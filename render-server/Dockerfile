# AutoCut overlay server (HyperFrames) as a container.
#
# Build from the REPO ROOT so the caption fonts in public/fonts are included:
#   docker build -f render-server/Dockerfile -t autocut-overlay .
#   docker run -p 4100:4100 -e PORT=4100 -e ALLOWED_ORIGINS=http://localhost:3000 autocut-overlay
#
# It receives only card text and timings — never the user's video.
FROM node:22-bookworm-slim

# Libraries headless Chrome needs on Linux, plus an emoji font for stickers.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-noto-color-emoji \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
      libdrm2 libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
      libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 \
      libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# No anonymous usage reporting from our servers.
ENV HYPERFRAMES_NO_TELEMETRY=1 \
    HF_CLI_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1 \
    HYPERFRAMES_SKIP_SKILLS=1 \
    NODE_ENV=production

# Run as the image's non-root user (uid 1000, which Hugging Face Spaces also expects).
RUN mkdir -p /app/render-server /app/public && chown -R node:node /app
USER node
WORKDIR /app/render-server

COPY --chown=node:node render-server/package.json render-server/package-lock.json ./
# tsx (a dev dependency) runs the TypeScript server, so install everything.
RUN npm ci --include=dev && npm cache clean --force
# Download the Chrome build HyperFrames renders with (into ~/.cache).
RUN node node_modules/hyperframes/bin/hyperframes.mjs browser ensure

COPY --chown=node:node render-server/src ./src
COPY --chown=node:node public/fonts /app/public/fonts

# Most hosts set PORT; 7860 is the Hugging Face Spaces default.
ENV PORT=7860
EXPOSE 7860
CMD ["node", "--import", "tsx", "src/server.ts"]
