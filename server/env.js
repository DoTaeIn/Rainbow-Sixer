// 저장소 루트의 .env 를 읽는다. process.loadEnvFile 은 실행 위치(cwd) 기준이라
// Jenkins/systemd 처럼 다른 디렉터리에서 띄우면 못 찾는다. 경로를 파일 기준으로 고정한다.
// 이미 환경변수로 준 값이 언제나 우선이다.
import { fileURLToPath } from 'node:url';

export function loadEnv() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch { /* .env 가 없으면 그냥 환경변수만 쓴다 */ }
}
