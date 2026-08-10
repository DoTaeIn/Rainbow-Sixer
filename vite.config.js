import { loadEnv } from 'vite';
import { attach } from './server/room.js';

// 빌드 대상이 둘이다. 웹(dist) 과 디스코드 Activity(dist-discord).
// HTML 은 하나만 두고, 디스코드 모드에서만 진입 스크립트를 바꿔치기한다.
//   vite build                -> dist          (src/main.js)
//   vite build --mode discord -> dist-discord  (src/discord.js)
export default ({ mode }) => {
  const discord = mode === 'discord';
  // 접두사 '' = VITE_ 없는 변수까지 읽는다. 아래 define 에 넣은 것만 번들로 나가므로
  // client secret 이나 public key 는 절대 브라우저로 새지 않는다.
  const env = loadEnv(mode, process.cwd(), '');
  const appId = env.DISCORD_APP_ID || env.VITE_DISCORD_CLIENT_ID || '';

  return {
    plugins: [{
      name: 'sixer',
      // 반환값을 주면 vite 가 post-hook 함수로 취급한다. 아무것도 돌려주지 말 것.
      configureServer(s) { attach(s.httpServer); },
      configurePreviewServer(s) { attach(s.httpServer); },
      // order:'pre' 가 없으면 번들링이 끝난 뒤에 치환돼서 진입점이 그대로 main.js 가 된다.
      transformIndexHtml: {
        order: 'pre',
        handler: html => (discord ? html.replace('/src/main.js', '/src/discord.js') : html),
      },
    }],
    // application id 는 공개값이다. 액티비티 창을 띄우는 데 필요하다.
    define: { 'import.meta.env.VITE_DISCORD_CLIENT_ID': JSON.stringify(appId) },
    build: { outDir: discord ? 'dist-discord' : 'dist' },
  };
};
