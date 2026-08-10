// 웹 배포용 서버. dist/ 정적 파일 + /ws 릴레이. 프로세스 하나가 전부다.
//   npm run build && npm start
import { createServer } from 'node:http';
import { attach } from './room.js';
import { serveStatic } from './static.js';

import { loadEnv } from './env.js';

// .env 가 있으면 읽는다(PORT 등). 이미 환경변수로 준 값이 우선이다.
loadEnv();

const PORT = process.env.PORT || 3000;

const server = createServer(serveStatic(new URL('../dist/', import.meta.url)));
attach(server);
server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
