# Sixer

레인보우 식스 시즈 실시간 전술 맵. 방을 만들어 링크를 공유하면 파티원 전원이 같은 도면을 보면서
핑과 오퍼레이터 마커를 찍을 수 있습니다.

- 공식 블루프린트 27개 맵 — 파괴 가능 벽 / 트랩도어 / 시야 벽 표시
- 방 단위 실시간 동기화. 맵을 고르면 방 전체가 같이 이동합니다
- 핑 3초, 오퍼레이터 마커 5초 뒤 자동으로 사라집니다
- 데스크톱 / 모바일 (한 손가락 이동, 두 손가락 확대)

## 실행

```bash
npm install
npm run dev
```

http://localhost:5173 . 같은 공유기의 다른 기기에서 열려면 `npm run dev -- --host`.

## 배포

```bash
npm ci && npm run build
PORT=8080 node server/index.js
```

`dist/` 정적 파일과 `/ws` 릴레이를 한 프로세스가 같이 서빙합니다.

- Node **20.19+** 또는 **22.12+** 필요 (vite 7)
- 런타임 의존성은 `ws` 하나뿐입니다. DB 없음
- **인스턴스는 하나만.** 방 상태가 메모리에 있어서 여러 대로 띄우면 같은 방 사람들이 갈라집니다.
  늘려야 할 만큼 커지면 그때 Redis pub/sub 을 끼우면 됩니다

## 디스코드 Activity (별도 배포)

웹 버전과 **따로** 빌드하고 따로 띄웁니다. 소스는 같은 걸 쓰되 진입점과 산출물, 서버가 갈립니다.

| | 웹 | 디스코드 |
|---|---|---|
| 진입점 | `src/main.js` | `src/discord.js` |
| 산출물 | `dist/` | `dist-discord/` |
| 서버 | `server/index.js` | `server/discord.js` |
| 방 / 닉네임 | 입장 화면에서 입력 | 액티비티 인스턴스 / 디스코드 계정 |

두 서버는 각자 자기 방 목록을 들고 있어서 웹 방과 디스코드 방은 서로 보이지 않습니다.

### 준비

1. [디스코드 개발자 포털](https://discord.com/developers/applications)에서 앱 생성 → **Activities 활성화**
2. **URL Mappings**: `PREFIX` `/` → `TARGET` 배포 도메인 (프로토콜 제외)
3. `.env.discord.example` 을 `.env.discord` 로 복사하고 `VITE_DISCORD_CLIENT_ID` 채우기

```bash
npm run build:discord
DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... npm run start:discord
```

`client_secret` 은 서버(`/api/token`)에서만 씁니다. 브라우저로 내려가지 않습니다.

개발 중에는 https 가 필요하므로 터널을 씁니다. 나온 주소를 URL Mapping 에 넣으세요.

```bash
npm run dev:discord
cloudflared tunnel --url http://localhost:5173
```

디스코드 밖(그냥 브라우저)에서 열면 핸드셰이크가 8초 후 실패하고 **일반 입장 화면으로 넘어갑니다.**

## 구조

```
index.html          화면 전체 (입장 / 로비 / 보드) + 스타일. 두 빌드가 같이 쓴다
src/main.js         뷰어, 마커, 확대·이동, 화면 전환  ← 웹 진입점
src/discord.js      디스코드 SDK 로 방·닉네임을 채우고 main.js 를 띄운다 ← 액티비티 진입점
src/net.js          방 접속 + 자동 재연결
server/room.js      ws 릴레이. 방마다 참가자와 현재 맵만 들고 있다
server/static.js    정적 파일 핸들러 (두 서버 공용)
server/index.js     웹 배포용 서버
server/discord.js   액티비티 배포용 서버 (+ OAuth 토큰 교환)
server/check.js     릴레이 자체 검사 — npm run check
maps/floors.json    맵별 층 순서 (유일한 수동 데이터)
tools/maps.py       공식 zip -> public/maps/*.webp + manifest.json
tools/ops.js        오퍼레이터 아이콘 -> public/ops/
```

핑 좌표는 도면 기준 `0~1` 정규화 값입니다. 공식 블루프린트는 층마다 프레임이 같아서
좌표 하나가 모든 층·모든 해상도에서 통합니다.

## 맵 데이터

`public/maps/` 는 커밋되어 있어서 클론 후 바로 빌드됩니다. 다시 만들 일이 있을 때만:

```bash
python tools/maps.py sync    # 유비소프트 공식 zip 내려받기 (maps/, 91MB, git 제외)
npm run maps                 # zip -> webp + manifest.json
```

zip 안 블루프린트에는 층 이름이 없고 **나열 순서가 맵마다 다릅니다** (Bank 는 1층부터,
Chalet 은 지하부터). 그래서 층 순서는 규칙이 아니라 `maps/floors.json` 에 데이터로 둡니다.
새 맵을 추가하면 기본값으로 굽고 경고를 띄우니, 화면에서 확인하고 틀리면 그 파일만 고치면 됩니다.

## 에셋 출처

이 프로젝트는 유비소프트와 무관한 팬 제작물입니다.

- 맵 블루프린트: © Ubisoft Entertainment. [공식 맵 페이지](https://www.ubisoft.com/en-gb/game/rainbow-six/siege/game-info/maps)에서 배포하는 파일
- 오퍼레이터 아이콘: [r6operators](https://github.com/marcopixel/r6operators) (MIT)
- *Tom Clancy's Rainbow Six Siege* 및 관련 상표는 유비소프트의 자산입니다
