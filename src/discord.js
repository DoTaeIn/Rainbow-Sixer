// 디스코드 Activity 진입점. 웹 진입점(main.js)은 손대지 않고, 그 앞단에서
// "방 코드"와 "닉네임"만 디스코드가 준 값으로 채운 뒤 입장 폼을 대신 눌러준다.
//   방   = 액티비티 인스턴스 (같은 음성 채널에서 켜면 자동으로 같은 방)
//   닉네임 = 디스코드 표시 이름
import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;
const root = document.documentElement;
const say = t => (document.getElementById('status').textContent = t);

root.dataset.host = 'discord';        // 핸드셰이크 동안 입장 화면을 감춘다
say('디스코드 연결 중…');

// 앱 자체는 무조건 먼저 띄운다. 디스코드 연동이 실패해도 수동 입장은 되어야 한다.
await import('./main.js');

// 디스코드 밖(그냥 브라우저)에서 열면 핸드셰이크 상대가 없어 응답이 안 온다.
const limit = p => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error('시간 초과')), 8000)),
]);

try {
  if (!CLIENT_ID) throw new Error('VITE_DISCORD_CLIENT_ID 가 비어 있습니다');

  const sdk = new DiscordSDK(CLIENT_ID);
  await limit(sdk.ready());

  const { code } = await limit(sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  }));

  const r = await fetch('/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!r.ok) throw new Error('토큰 교환 실패');
  const { access_token } = await r.json();

  const auth = await limit(sdk.commands.authenticate({ access_token }));

  // instanceId 는 액티비티가 켜진 세션마다 다르다. 방 코드는 12자까지만 쓰므로
  // 변화가 큰 뒤쪽을 남긴다.
  document.getElementById('joinCode').value =
    sdk.instanceId.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-12);
  document.getElementById('joinNick').value =
    (auth.user.global_name || auth.user.username || '').slice(0, 16);
  document.getElementById('joinForm').requestSubmit();
} catch (e) {
  console.error(e);
  root.dataset.host = '';             // 입장 화면을 되살려 수동으로 들어가게 한다
  say('디스코드 연결 실패 — 코드를 직접 입력하세요');
}
