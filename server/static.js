// 빌드 결과물을 서빙하는 요청 핸들러. 웹용 서버와 디스코드용 서버가 같이 쓴다.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

export function serveStatic(distUrl) {
  const dist = fileURLToPath(distUrl);
  if (!existsSync(dist)) {
    console.error(`${dist} 가 없습니다. 먼저 빌드하세요.`);
    process.exit(1);
  }
  return (req, res) => {
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://_').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    // dist 밖으로 나가려는 경로는 전부 index.html 로 떨어뜨린다.
    let file = join(dist, normalize(path));
    if (!(file + sep).startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(dist, 'index.html');
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] || 'application/octet-stream',
      // 맵/오퍼 이미지는 파일명이 바뀌지 않는 대신 내용도 안 바뀐다. 길게 캐시해도 안전.
      'cache-control': /^\/(maps|ops)\//.test(path) ? 'public, max-age=604800' : 'no-cache',
    });
    createReadStream(file).pipe(res);
  };
}
