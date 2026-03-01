# リポジトリルートでビルド: docker build -f headless-runner/Dockerfile .
# ゲームを配信し、ヘッドレスで学習を回して終了時にエクスポートする
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY . /app/src
RUN mkdir -p /app/game && \
    cp -r /app/src/index.html /app/src/css /app/src/js /app/game/ && \
    (cp /app/src/design-overview.md /app/src/design-memo.md /app/game/ 2>/dev/null || true) && \
    (cp -r /app/src/docs /app/game/ 2>/dev/null || true) && \
    rm -rf /app/src

WORKDIR /app/runner
COPY headless-runner/package.json headless-runner/run-learning.js ./
RUN npm install --omit=dev

ENV GAME_DIR=/app/game
ENV OUT_PATH=/app/output/export.json
ENV LEARNING_DURATION_SECONDS=3600

VOLUME /app/output

CMD ["node", "run-learning.js"]
