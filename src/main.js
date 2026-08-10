// 로비(방 + 맵 선택) / 보드(도면 + 마커) 두 화면. 맵 선택은 방 전체가 함께 움직인다.
import { connect } from './net.js';

const TTL = { ping: 3000, op: 5000 };   // 마커 수명
const SIDE_COLOR = { atk: '#60a5fa', def: '#fb923c' };
const MAX_ZOOM = 6;

const $ = id => document.getElementById(id);
const canvas = $('view'), ctx = canvas.getContext('2d');

const [manifest, ops] = await Promise.all([
  fetch('/maps/manifest.json').then(r => r.json()),
  fetch('/ops/index.json').then(r => r.json()),
]);
const slugs = Object.keys(manifest);
const opById = Object.fromEntries(ops.map(o => [o.id, o]));

const img = new Map();
const markers = [];                     // {x,y,map,floor,color,op,t0,ttl}
let map = null, floor = null, me = null;
let tool = 'ping', side = 'atk', pickedOp = null;
let zoom = 1, panX = 0, panY = 0, autoZoomed = false;
let view = null;                        // 화면상 도면 사각형 (좌표 변환용)

const src = (m, f) => `/maps/${m}/${f.toLowerCase()}.webp`;
const esc = s => s.replace(/[<&]/g, c => ({ '<': '&lt;', '&': '&amp;' }[c]));

function load(url) {
  if (!img.has(url)) {
    const el = new Image();
    el.src = url;
    el.decoding = 'async';
    img.set(url, el);
  }
  return img.get(url);
}

// ── 화면 0: 입장 ─────────────────────────────────────────
// 헷갈리는 글자(I,O,0,1)를 뺀 코드. 불러줄 때 잘못 듣는 걸 줄인다.
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)),
  b => ALPHA[b % 32]).join('');
const tidy = s => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

const params = new URLSearchParams(location.search);
const nick = $('nick'), joinNick = $('joinNick'), joinCode = $('joinCode');
let roomCode = null, net = null;

joinNick.value = localStorage.nick || '';
joinCode.value = tidy(params.get('r'));

const canEnter = () => ($('enter').disabled = tidy(joinCode.value).length < 4);
joinCode.oninput = canEnter;
canEnter();

$('newRoom').onclick = () => {
  joinCode.value = newCode();
  canEnter();
  $('joinForm').requestSubmit();
};

$('joinForm').onsubmit = e => {
  e.preventDefault();
  const code = tidy(joinCode.value);
  if (code.length < 4) return;
  roomCode = code;
  nick.value = joinNick.value.trim();
  localStorage.nick = nick.value;
  params.set('r', code);
  history.replaceState(null, '', `?${params}`);
  $('codeval').textContent = code;
  $('codeval').hidden = false;
  $('join').hidden = true;
  $('status').textContent = '연결 중…';
  net = connect(code, () => nick.value.trim(), onMessage);
};

// ── 방 ──────────────────────────────────────────────────
nick.onchange = () => {
  localStorage.nick = nick.value.trim();
  net?.send({ t: 'name', name: nick.value.trim() });
};

// 코드를 누르면 초대 링크가 복사된다.
// http 로 뜬 LAN 주소에서는 clipboard API 가 막히므로 예전 방식으로 한 번 더 시도한다.
async function copyInvite() {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const t = document.createElement('textarea');
    t.value = url;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.append(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  const el = $('codeval');
  el.textContent = '링크 복사됨';
  el.toggleAttribute('data-copied', true);
  setTimeout(() => {
    el.textContent = roomCode;
    el.toggleAttribute('data-copied', false);
  }, 1200);
}
$('codeval').onclick = copyInvite;

function onMessage(msg) {
  if (msg.t === 'welcome') {
    me = msg.you;
    if (!nick.value) nick.value = me.name;
    showMap(msg.map);
  } else if (msg.t === 'members') {
    $('members').innerHTML = msg.members.map(m =>
      `<li${me && m.id === me.id ? ' data-me' : ''}><i style="background:${m.color}"></i>` +
      `${esc(m.name)}</li>`).join('');
  } else if (msg.t === 'map') {
    showMap(msg.map);
  } else if (msg.t === 'ping') {
    markers.push({ ...msg, t0: performance.now(), ttl: msg.op ? TTL.op : TTL.ping });
    tick();
  } else if (msg.t === 'status') {
    $('status').textContent = msg.up ? '연결됨' : '재연결 중…';
  }
}

// ── 화면 전환 ────────────────────────────────────────────
function showMap(next) {
  map = slugs.includes(next) ? next : null;
  const on = map !== null;
  $('lobby').hidden = on;
  $('board').hidden = !on;
  $('leave').hidden = !on;
  if (!on) return;

  markers.length = 0;
  zoom = 1; panX = 0; panY = 0; autoZoomed = false;
  floor = manifest[map].includes('1F') ? '1F' : manifest[map][0];
  manifest[map].forEach(f => load(src(map, f)));   // 층 전환이 끊기지 않게 미리 받는다
  drawFloorBar();
  render();
}

$('leave').onclick = () => net.send({ t: 'map', map: null });

// ── 로비: 맵 목록 ────────────────────────────────────────
$('grid').innerHTML = slugs.map(m =>
  `<button data-map="${m}"><img src="${src(m, manifest[m].at(-1))}" alt="" loading="lazy">` +
  `<span>${m.replace(/-/g, ' ')}</span></button>`).join('');
$('grid').onclick = e => {
  const b = e.target.closest('[data-map]');
  if (b) net.send({ t: 'map', map: b.dataset.map });
};

// ── 보드: 도구 / 오퍼레이터 ───────────────────────────────
function setTool(t) {
  tool = t;
  $('tools').querySelectorAll('[data-tool]').forEach(b =>
    b.toggleAttribute('aria-current', b.dataset.tool === t));
}
$('tools').onclick = e => {
  const b = e.target.closest('[data-tool]');
  if (b) setTool(b.dataset.tool);
};
setTool('ping');

// 모바일에서 오퍼레이터 목록을 서랍으로 올렸다 내린다 (데스크톱에선 버튼이 숨어있다)
const drawer = on => $('board').toggleAttribute('data-ops', on);
$('opsToggle').onclick = () => drawer(!$('board').hasAttribute('data-ops'));

function drawOps() {
  $('sides').querySelectorAll('[data-side]').forEach(b =>
    b.toggleAttribute('aria-current', b.dataset.side === side));
  $('oplist').innerHTML = ops.filter(o => o.side === side).map(o =>
    `<button data-op="${o.id}" title="${o.name}"${o.id === pickedOp ? ' aria-current' : ''}` +
    ` style="color:${SIDE_COLOR[o.side]}"><img src="/ops/${o.id}.svg" alt="${o.name}"></button>`
  ).join('');
}
$('sides').onclick = e => {
  const b = e.target.closest('[data-side]');
  if (b) { side = b.dataset.side; drawOps(); }
};
$('oplist').onclick = e => {
  const b = e.target.closest('[data-op]');
  if (!b) return;
  pickedOp = b.dataset.op;
  setTool('op');
  drawOps();
  drawer(false);        // 고르면 서랍은 닫아준다. 바로 맵을 찍을 수 있게.
};
drawOps();

// ── 보드: 층 ────────────────────────────────────────────
function drawFloorBar() {
  const bar = $('bar');
  bar.innerHTML = '';   // manifest 는 아래에서 위 순서, CSS 가 column-reverse 라 위층이 위로 온다
  for (const f of manifest[map]) {
    const b = document.createElement('button');
    b.textContent = f;
    b.onclick = () => setFloor(f);
    if (f === floor) b.setAttribute('aria-current', 'true');
    bar.append(b);
  }
}
function setFloor(f) {
  if (!manifest[map].includes(f) || f === floor) return;
  floor = f;
  drawFloorBar();
  render();
}
function stepFloor(d) {
  const fs = manifest[map];
  setFloor(fs[Math.min(fs.length - 1, Math.max(0, fs.indexOf(floor) + d))]);
}

// ── 확대 / 이동 ─────────────────────────────────────────
function clampPan() {
  if (!view) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  // 확대된 만큼만 움직일 수 있다. 축소 상태면 가운데 고정.
  const mx = Math.max(0, (view.w - w) / 2), my = Math.max(0, (view.h - h) / 2);
  panX = Math.min(mx, Math.max(-mx, panX));
  panY = Math.min(my, Math.max(-my, panY));
}
function setZoom(z, cx, cy) {
  const next = Math.min(MAX_ZOOM, Math.max(1, z));
  if (next === zoom) return;
  if (view && cx !== undefined) {
    // 커서 아래 지점이 그대로 있도록 팬을 보정한다.
    const px = (cx - view.x) / view.w, py = (cy - view.y) / view.h;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const nw = (view.w / zoom) * next, nh = (view.h / zoom) * next;
    panX = cx - px * nw - (w - nw) / 2;
    panY = cy - py * nh - (h - nh) / 2;
  }
  zoom = next;
  if (zoom === 1) { panX = 0; panY = 0; }
  render();
}
$('zoom').onclick = e => {
  const b = e.target.closest('[data-zoom]');
  if (!b) return;
  const d = +b.dataset.zoom;
  if (d === 0) { zoom = 1; panX = 0; panY = 0; autoZoomed = false; render(); }
  else setZoom(zoom * (d > 0 ? 1.4 : 1 / 1.4), canvas.clientWidth / 2, canvas.clientHeight / 2);
};

// ── 렌더 ────────────────────────────────────────────────
function render() {
  if (map === null) return;
  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const el = load(src(map, floor));
  if (!el.complete || !el.naturalWidth) {
    el.decode().then(render, () => {});
    return;
  }
  // 세로로 긴 화면(폰)에서는 contain 이 도면을 지나치게 작게 만든다.
  // 처음 한 번은 화면을 채우는 배율로 시작하고, 이후엔 사용자 확대만 따른다.
  if (!autoZoomed) {
    autoZoomed = true;
    const fit = Math.min(w / el.naturalWidth, h / el.naturalHeight);
    const cover = Math.max(w / el.naturalWidth, h / el.naturalHeight);
    if (fit > 0 && cover / fit > 1.35) {
      zoom = Math.min(MAX_ZOOM, cover / fit);
      return render();
    }
  }
  // 화면에 꽉 채우되 비율 유지(contain) 한 뒤 확대/이동을 얹는다
  const s = Math.min(w / el.naturalWidth, h / el.naturalHeight) * zoom;
  const dw = el.naturalWidth * s, dh = el.naturalHeight * s;
  view = { x: (w - dw) / 2 + panX, y: (h - dh) / 2 + panY, w: dw, h: dh };
  clampPan();
  view.x = (w - dw) / 2 + panX;
  view.y = (h - dh) / 2 + panY;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(el, view.x, view.y, dw, dh);
  drawMarkers();
  $('zoomval').textContent = `${Math.round(zoom * 100)}%`;
}

function drawMarkers() {
  const now = performance.now();
  for (const m of markers) {
    if (m.map !== map || m.floor !== floor) continue;
    const age = (now - m.t0) / m.ttl;
    const x = view.x + m.x * view.w, y = view.y + m.y * view.h;
    ctx.globalAlpha = Math.max(0, 1 - age ** 3);   // 끝에서만 훅 사라지게

    if (m.op) {
      const o = opById[m.op];
      const c = SIDE_COLOR[o?.side] || m.color;
      // 아이콘 자체가 배경판을 갖고 있어서 배지를 깔 필요가 없다. 테두리로 공/방만 표시.
      const icon = load(`/ops/${m.op}.svg`);
      const s = 30;
      if (icon.complete && icon.naturalWidth) ctx.drawImage(icon, x - s / 2, y - s / 2, s, s);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    } else {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.beginPath();                              // 찍힐 때 퍼지는 링
      ctx.arc(x, y, 6 + Math.min(1, age * 3) * 20, 0, 7);
      ctx.stroke();
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 7);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// 마커가 남아있는 동안만 루프를 돈다.
let looping = false;
function tick() {
  if (looping) return;
  looping = true;
  requestAnimationFrame(function frame() {
    const now = performance.now();
    for (let i = markers.length - 1; i >= 0; i--) {
      if (now - markers[i].t0 > markers[i].ttl) markers.splice(i, 1);
    }
    render();
    looping = markers.length > 0;
    if (looping) requestAnimationFrame(frame);
  });
}

// 화면 좌표 -> 도면 기준 0~1 정규화 좌표. 도면 밖이면 null.
// 공식 블루프린트는 층마다 프레임이 같아서 이 좌표는 전 층 공통이다.
function toMap(ev) {
  if (!view) return null;
  const r = canvas.getBoundingClientRect();
  const x = (ev.clientX - r.left - view.x) / view.w;
  const y = (ev.clientY - r.top - view.y) / view.h;
  // 캔버스가 아직 0 크기면 NaN 이 나온다. 부등호로는 NaN 이 안 걸러지니 범위로 확인한다.
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

// ── 입력 ────────────────────────────────────────────────
// 손가락 하나 = 이동(안 움직였으면 마커), 둘 = 확대. 마우스도 같은 경로를 탄다.
const touches = new Map();
let drag = null, pinch = null;

const pair = () => {
  const [a, b] = [...touches.values()];
  const r = canvas.getBoundingClientRect();
  return {
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    mx: (a.x + b.x) / 2 - r.left,
    my: (a.y + b.y) / 2 - r.top,
  };
};

canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    drag = null;                       // 두 번째 손가락이 닿는 순간 이동은 취소
    pinch = { ...pair(), zoom };
  } else if (touches.size === 1) {
    drag = { x: e.clientX, y: e.clientY, panX, panY, moved: false };
  }
  // 캡처는 상태를 잡은 뒤에. 실패해도(포인터가 이미 놓였거나 합성 이벤트) 나머지는 굴러가야 한다.
  try { canvas.setPointerCapture(e.pointerId); } catch { /* 무시 */ }
});

canvas.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pinch && touches.size === 2) {
    const now = pair();
    panX += now.mx - pinch.mx;         // 두 손가락 중점이 움직인 만큼 같이 끌린다
    panY += now.my - pinch.my;
    pinch.mx = now.mx;
    pinch.my = now.my;
    setZoom(pinch.zoom * (now.dist / pinch.dist), now.mx, now.my);
    render();
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;   // 살짝 흔들린 건 탭으로 친다
    drag.moved = true;
    canvas.dataset.panning = '';
    panX = drag.panX + dx;
    panY = drag.panY + dy;
    render();
    return;
  }
  const p = toMap(e);
  $('hint').textContent = p ? `${p.x.toFixed(3)}, ${p.y.toFixed(3)}` : '';
});

function endPointer(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  const d = drag;
  drag = null;
  delete canvas.dataset.panning;
  if (!d || d.moved || touches.size) return;
  const p = toMap(e);
  if (!p) return;
  net.send({ t: 'ping', x: p.x, y: p.y, map, floor, op: tool === 'op' ? pickedOp : null });
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  drag = null;
  delete canvas.dataset.panning;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey) {
    const r = canvas.getBoundingClientRect();
    setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
  } else {
    stepFloor(e.deltaY > 0 ? -1 : 1);
  }
}, { passive: false });

addEventListener('keydown', e => {
  if (e.target === nick || map === null) return;
  if (e.key === '1') setTool('ping');
  else if (e.key === '2') setTool('op');
  else if (e.key === 'ArrowUp') stepFloor(1);
  else if (e.key === 'ArrowDown') stepFloor(-1);
  else if (e.key === 'Escape') net.send({ t: 'map', map: null });
});
addEventListener('resize', render);
addEventListener('contextmenu', e => e.preventDefault());
