// node server/check.js  — 방 릴레이 자체 검사
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { attach } from './room.js';

const http = createServer().listen(0);
attach(http);
const url = `ws://localhost:${http.address().port}/ws`;

const open = (room, name) => new Promise(res => {
  const ws = new WebSocket(url);
  ws.inbox = [];
  ws.on('message', d => ws.inbox.push(JSON.parse(d)));
  ws.on('open', () => { ws.send(JSON.stringify({ t: 'join', room, name })); res(ws); });
});
const settle = () => new Promise(r => setTimeout(r, 60));
const last = (ws, t) => ws.inbox.filter(m => m.t === t).at(-1);

const a = await open('ABC123', 'hiro');
const b = await open('ABC123', 'friend');
const c = await open('OTHER', 'stranger');
await settle();

assert.equal(last(a, 'members').members.length, 2, '같은 방만 명단에 뜬다');
assert.equal(last(c, 'members').members.length, 1, '다른 방은 섞이지 않는다');
assert.notEqual(last(a, 'members').members[0].color,
  last(a, 'members').members[1].color, '참가자 색이 겹치지 않는다');

a.send(JSON.stringify({ t: 'ping', x: 0.25, y: 0.5, map: 'bank', floor: '1F' }));
await settle();
assert.equal(last(b, 'ping').x, 0.25, '같은 방에 핑이 전달된다');
assert.equal(last(a, 'ping').x, 0.25, '찍은 본인에게도 온다');
assert.equal(last(c, 'ping'), undefined, '다른 방에는 안 간다');

a.send(JSON.stringify({ t: 'ping', x: 9, y: 0.5 }));
a.send(JSON.stringify({ t: 'ping', x: 'NaN', y: 0.5 }));
await settle();
assert.equal(last(b, 'ping').x, 0.25, '범위 밖 좌표는 버린다');

a.send(JSON.stringify({ t: 'map', map: 'oregon' }));
await settle();
assert.equal(last(b, 'map').map, 'oregon', '맵 선택은 방 전체에 퍼진다');
const late = await open('ABC123', 'latecomer');
await settle();
assert.equal(last(late, 'welcome').map, 'oregon', '늦게 들어와도 보던 맵으로 붙는다');
late.send(JSON.stringify({ t: 'map', map: null }));
await settle();
assert.equal(last(a, 'map').map, null, '나가기는 방 전체를 맵 선택 화면으로 되돌린다');
late.close();

b.close();
await settle();
assert.equal(last(a, 'members').members.length, 1, '나가면 명단에서 빠진다');

console.log('ok');
process.exit(0);
