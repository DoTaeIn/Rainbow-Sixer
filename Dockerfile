FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Discord application id는 공개값으로, Activity 클라이언트 번들에 포함된다.
ARG DISCORD_APP_ID
ENV DISCORD_APP_ID=$DISCORD_APP_ID

RUN npm run build && npm run build:discord

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-discord ./dist-discord
COPY --from=build /app/server ./server

EXPOSE 3000 3001

# 일반 웹 컨테이너의 기본 명령. Discord 컨테이너는 Jenkinsfile에서 덮어쓴다.
CMD ["node", "server/index.js"]
