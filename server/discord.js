// 디스코드 Activity 배포용 서버. 웹용(index.js)과 완전히 별개로 돌린다.
//   npm run build:discord
//   DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... npm run start:discord
//
// dist-discord/ 정적 파일 + /ws 릴레이 + /api/token (OAuth 코드 교환).
// client_secret 은 절대 브라우저로 내려가면 안 되므로 교환은 여기서만 한다.
import { createServer } from 'node:http';
import { attach } from './room.js';
import { serveStatic } from './static.js';
import { loadEnv } from './env.js';

loadEnv();

const PORT = process.env.PORT || 3001;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APP_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

if (!CLIENT_ID) {
  console.error('DISCORD_APP_ID (= application id) 가 필요합니다. .env 를 확인하세요.');
  process.exit(1);
}
if (!CLIENT_SECRET) {
  console.error(
    'DISCORD_CLIENT_SECRET 이 필요합니다.\n' +
    '  개발자 포털 > 내 앱 > OAuth2 > Client Secret 에서 발급합니다.\n' +
    '  (Public Key 는 인터랙션 서명 검증용이라 여기서는 쓰지 않습니다.)');
  process.exit(1);
}

const files = serveStatic(new URL('../dist-discord/', import.meta.url));

const body = req => new Promise((res, rej) => {
  let s = '';
  req.on('data', c => {
    s += c;
    if (s.length > 4096) rej(new Error('too large'));   // 코드 하나 받는 곳이다
  });
  req.on('end', () => res(s));
  req.on('error', rej);
});

const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/api/token')) return files(req, res);

  try {
    const { code } = JSON.parse(await body(req));
    if (typeof code !== 'string' || !code) throw new Error('code 없음');

    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      // 디스코드가 돌려준 원문에는 민감한 값이 섞일 수 있어 그대로 흘리지 않는다.
      console.error('토큰 교환 실패:', r.status, data.error || '');
      res.writeHead(502, { 'content-type': 'application/json' }).end('{"error":"token_exchange"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' })
       .end(JSON.stringify({ access_token: data.access_token }));
  } catch (e) {
    res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"bad_request"}');
  }
});

attach(server);
server.listen(PORT, () => console.log(`discord activity: http://localhost:${PORT}`));
