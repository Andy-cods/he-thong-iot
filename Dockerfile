# syntax=docker/dockerfile:1.7
# he-thong-iot — multi-stage image (Next.js standalone web + BullMQ worker)

# ---------- Stage 1: deps ----------
FROM node:20-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------- Stage 2: builder ----------
FROM deps AS builder
WORKDIR /repo
COPY . .
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=1024 \
    BUILD_STANDALONE=1 \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    JWT_SECRET=build-time-dummy-jwt-secret-value-placeholder-123456789 \
    SESSION_SECRET=build-time-dummy-session-secret-value-placeholder-abc
RUN pnpm --filter @iot/shared build 2>/dev/null || true
RUN pnpm --filter @iot/db build 2>/dev/null || true
RUN pnpm --filter @iot/worker build
RUN --mount=type=cache,id=nextjs,target=/repo/apps/web/.next/cache \
    pnpm --filter @iot/web build

# ---------- Stage 2b: worker-deploy ----------
# pnpm deploy flatten toàn bộ workspace deps của @iot/worker vào /worker-out:
# resolve @iot/shared + @iot/db từ symlink thành copy thực tế, gom node_modules
# phẳng. Giữ tsx (đã được move sang dependencies) để runtime chạy TS trực tiếp.
FROM builder AS worker-deploy
WORKDIR /repo
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --filter=@iot/worker /worker-out

# ---------- Stage 3: runtime (web) ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PORT=3001 \
    HOSTNAME=0.0.0.0
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
 && apt-get update \
 && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Next.js standalone output (web)
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

# Worker — deploy flattened (symlink-free, node_modules phẳng)
COPY --from=worker-deploy /worker-out ./apps/worker-deploy

EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","apps/web/server.js"]
