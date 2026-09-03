# Pinned to the exact Playwright npm version in server/package.json — the
# browser binaries baked into this image must match that version exactly.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

# yt-dlp needs an external JavaScript runtime (Deno, by default) to solve
# YouTube's cipher/signature challenges. Without it, YouTube downloads fail.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && mv /root/.deno/bin/deno /usr/local/bin/deno \
    && apt-get purge -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /root/.deno

WORKDIR /app
COPY server ./server
COPY web ./web

# Installing server deps triggers scripts/postinstall.mjs, which stages
# ffmpeg/ffprobe and downloads yt-dlp. It also re-runs `playwright install
# chromium`, which is a no-op here since this base image already has it.
WORKDIR /app/server
RUN npm ci && npm run build

WORKDIR /app/web
RUN npm ci && npm run build

WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "dist/index.js"]
