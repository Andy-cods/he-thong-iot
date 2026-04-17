# Plan: Bootstrap VPS mới 123.30.48.215 và deploy `he-thong-iot`

> Ngày: 2026-04-17
> VPS: `123.30.48.215` (Ubuntu 24.04.2, 1.9GB RAM, 38GB disk, clean, **dedicated** — không share Song Châu)
> Local: Windows + OneDrive, Docker Desktop CHƯA có, plink/pscp sẵn
> Trạng thái: đang cook — xem `PROGRESS.md` để cập nhật tiến độ.

## 1. Quyết định kiến trúc chốt

| Quyết định | Lý do |
|---|---|
| Build trên VPS + swap 4GB swapfile | Tránh Docker Desktop local; 37GB disk dư; one-shot reproducible. `next build` peak ~1.5-2GB heap → cần swap |
| 1 image multi-stage chứa cả web (standalone) + worker (tsc) | Compose hiện tại tham chiếu 1 image 2 command; giảm build time |
| Port Caddy = 80 (không 8443) | VPS dedicated, không share → không cần trốn port; link gọn `http://123.30.48.215` |
| Caddy `auto_https off` | Chưa có domain → HTTP plain; khi có domain chỉ cần 2 lệnh sed |
| `db:push` thay vì migrate SQL | Repo chưa sinh migration file; V1 plan cũng dùng push |
| Upload code qua pscp tar (fallback) | OneDrive lock; repo chưa có commit lên GitHub |
| Swap 4GB swapfile, không zram | zram không giúp heap Node lớn |

## 2. Ràng buộc quan trọng

- RAM 1.9GB chưa swap → **BẮT BUỘC** tạo swap trước build.
- pnpm-lock.yaml **CHƯA** tồn tại → Dockerfile dùng `--lockfile=false` hoặc sinh lock trong stage deps.
- Next.js 14 `output: "standalone"` đã có trong `apps/web/next.config.js` → Dockerfile copy `.next/standalone` + `.next/static` + `public`.
- `argon2` native module → cần python3 + g++ trong stage builder.
- Drizzle config cần `DATABASE_URL` có password → override env khi chạy `run --rm` cho migrate/seed.

## 3. Files cần tạo / sửa

| Path | Action |
|---|---|
| `/Dockerfile` | TẠO mới (multi-stage Next standalone + worker, xem section 5) |
| `/.dockerignore` | TẠO mới |
| `/deploy/Caddyfile` | Sửa `:8443 {` → `:80 {` |
| `/deploy/docker-compose.yml` | Sửa ports Caddy `"8443:8443"` → `"80:80"` + `"443:443"` |
| `/deploy/scripts/backup.sh` | Đã OK (PG_MODE=docker mặc định), không cần sửa |

## 4. Timeline

| Phase | Phút |
|---|---|
| VPS swap + apt + docker + ufw (parallel with local prep) | 6-8 |
| Local chuẩn bị Dockerfile + sửa compose/Caddy + tar | 5 |
| pscp tar lên VPS | 2-5 |
| Sinh pnpm-lock + docker build (nặng) | 12-18 |
| Up Postgres+Redis + migrate + seed | 3 |
| Up app+worker+caddy + smoke test | 3 |
| **Tổng** | **30-40** |

## 5. Dockerfile skeleton

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --no-frozen-lockfile

FROM deps AS builder
WORKDIR /repo
COPY . .
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536
RUN pnpm --filter @iot/shared build 2>/dev/null || true \
 && pnpm --filter @iot/db build 2>/dev/null || true \
 && pnpm --filter @iot/web build \
 && pnpm --filter @iot/worker build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
 && apt-get update && apt-get install -y --no-install-recommends tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /repo/apps/web/.next/standalone /app/
COPY --from=builder /repo/apps/web/.next/static /app/apps/web/.next/static
COPY --from=builder /repo/apps/web/public /app/apps/web/public
COPY --from=builder /repo/apps/worker/dist /app/apps/worker/dist
COPY --from=builder /repo/apps/worker/package.json /app/apps/worker/package.json
COPY --from=builder /repo/packages /app/packages
COPY --from=builder /repo/node_modules /app/node_modules
COPY --from=builder /repo/pnpm-workspace.yaml /repo/package.json /app/
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["node","apps/web/server.js"]
```

## 6. Smoke test

```bash
curl -fsS http://123.30.48.215/api/health
curl -fsSI http://123.30.48.215/login
# Login:
curl -c /tmp/c.txt -X POST http://123.30.48.215/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"admin","password":"ChangeMe!234"}'
```

## 7. Link cuối

- `http://123.30.48.215` → landing redirect `/login`
- Admin seed: `admin` / `ChangeMe!234` (ĐỔI ngay sau lần login đầu)
- Endpoints:
  - `/api/health`, `/api/ready`
  - `/login`, `/items`, `/items/import`

## 8. Rollback nếu build OOM

1. `docker system prune -af` để giải phóng.
2. Tăng swap lên 6GB: `swapoff /swapfile; fallocate -l 6G /swapfile; mkswap /swapfile; swapon /swapfile`.
3. Thêm ARG NODE_OPTIONS=--max-old-space-size=1280 vào Dockerfile builder.
4. Nếu vẫn fail → plan B: chạy app Node trực tiếp (không Docker), systemd unit cho web + worker; giữ Postgres + Redis + Caddy trong Docker.

## 9. Sau deploy

- Đổi admin password.
- Mua domain + A record → `sed` Caddyfile bật Let's Encrypt.
- Cấu hình R2 thật cho `/api/ready` pass.
- UptimeRobot ping `/api/health`.
- Enable Telegram bot cho health-check.sh.
