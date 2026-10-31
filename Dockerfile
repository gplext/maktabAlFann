# syntax=docker/dockerfile:1
# Maktaba Al-Fann: one container serves the website and the /api.
#
# Coolify: Build Pack = Dockerfile, Port = 8080, Health check path = /api/healthz.
# Required env: DATABASE_URL, SESSION_SECRET, DATA_ENCRYPTION_KEY,
#               ADMIN_USERNAME, ADMIN_PASSWORD (plus WHATSAPP_NUMBER, Stripe keys, ...).
# Persistent storage: mount a volume at /data. Uploaded images are stored in /data/uploads.

# ── 1. Build ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

# Download dependencies from the lockfile only, so this layer is cached between deploys.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
# .npmrc points pnpm at Git Bash on Windows; inside Linux use the normal shell.
RUN sed -i '/^script-shell/d' .npmrc && pnpm fetch

COPY . .
RUN sed -i '/^script-shell/d' .npmrc \
 && pnpm install --offline --frozen-lockfile \
 && pnpm --filter @workspace/art-gallery run build \
 && pnpm --filter @workspace/api-server run build \
 && pnpm --filter @workspace/api-server deploy --prod --legacy /out

# ── 2. Run ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/public \
    UPLOAD_DIR=/data

COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /app/artifacts/api-server/dist ./dist
COPY --from=build --chown=node:node /app/artifacts/art-gallery/dist/public ./public
# Kept in the image so they can be run from Coolify's terminal if needed.
COPY --chown=node:node migrations ./migrations
RUN mkdir -p /data/uploads && chown -R node:node /data

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
