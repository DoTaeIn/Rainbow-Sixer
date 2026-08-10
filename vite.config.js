import { attach } from './server/room.js';

// 빌드 대상이 둘이다. 웹(dist) 과 디스코드 Activity(dist-discord).
// HTML 은 하나만 두고, 디스코드 모드에서만 진입 스크립트를 바꿔치기한다.
//   vite build              -> dist        (src/main.js)
//   vite build --mode discord -> dist-discord (src/discord.js, .env.discord 를 읽는다)
export default ({ mode }) => {
  const discord = mode === 'discord';
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
    build: { outDir: discord ? 'dist-discord' : 'dist' },
  };
};
