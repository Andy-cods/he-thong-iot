# he-thong-iot

Hệ thống MES/ERP nhẹ, BOM-centric cho xưởng cơ khí SMB Việt Nam. V1 thay thế Excel/OneDrive cho 1 xưởng (~12 máy CNC, ~10.000 mã vật tư, 20-50 user).

## 1. Tổng quan

- **Monorepo pnpm** gồm:
  - `apps/web` — Next.js 14 App Router + PWA (frontend + API routes)
  - `apps/worker` — BullMQ worker (import Excel, sync scan offline, retry PO)
  - `packages/db` — Drizzle ORM schema + migration + seed
  - `packages/shared` — type + constant dùng chung
- **Stack:** Node 20, TypeScript, PostgreSQL 16 (share với Song Châu, DB riêng `hethong_iot`), Redis (share, `db=2`), Cloudflare R2 (file), Caddy + Cloudflare Tunnel.
- **Scope V1:** Auth/RBAC, Item master, BOM template/revision, Sales order + snapshot bất biến, Shortage, PO + receipt, Inventory txn, Work order, PWA pick+scan offline, Audit + dashboard.

Chi tiết: [`plans/v1-foundation/260416-v1-implementation-plan.md`](plans/v1-foundation/260416-v1-implementation-plan.md).

## 2. Setup local

Yêu cầu: Node 20.11+, pnpm 9+, Docker Desktop (tuỳ chọn cho Postgres/Redis local), PostgreSQL 16 + Redis 7 (nếu không dùng Docker).

```bash
# 1. Cài dependency toàn workspace
pnpm install

# 2. Copy env template
cp .env.example .env.local
# Chỉnh DATABASE_URL, REDIS_URL, JWT_SECRET cho local

# 3. Push schema Drizzle lên DB local (chưa có migration SQL → dùng push)
pnpm db:push

# 4. Seed role + 1 admin user
pnpm db:seed

# 5. Chạy web + worker song song
pnpm dev
```

Mặc định web chạy `http://localhost:3001`, login admin seed ở `/login`.

## 3. Scripts chính

| Lệnh | Mô tả |
|---|---|
| `pnpm dev` | Chạy `apps/web` + `apps/worker` song song |
| `pnpm dev:web` | Chỉ web (port 3001) |
| `pnpm dev:worker` | Chỉ worker BullMQ |
| `pnpm build` | Build production toàn monorepo |
| `pnpm lint` | ESLint tất cả package |
| `pnpm typecheck` | `tsc --noEmit` tất cả package |
| `pnpm test` | Vitest tất cả package |
| `pnpm db:push` | Drizzle push schema lên DB (dev only) |
| `pnpm db:generate` | Sinh migration SQL từ schema |
| `pnpm db:migrate` | Apply migration SQL (production) |
| `pnpm db:seed` | Seed role + admin |
| `pnpm db:studio` | Mở Drizzle Studio |

## 4. Deploy

Xem chi tiết trong [`deploy/README.md`](deploy/README.md).

Tóm tắt:
1. Chuẩn bị DB `hethong_iot` + role `hethong_app` trên Postgres share của VPS.
2. Build image Docker → push registry nội bộ.
3. `cd /opt/hethong-iot && docker compose up -d` (dùng `deploy/docker-compose.yml`).
4. Setup Cloudflare Tunnel `iot.<domain>.vn` → `localhost:8443`.
5. Cron backup `deploy/scripts/backup.sh` (3h sáng mỗi ngày) + health-check 5 phút.

**Nguyên tắc bất di bất dịch:** KHÔNG động Nginx/container/volume của Song Châu ERP đang chạy cùng VPS `103.56.158.129`. Stack IoT cô lập: container prefix `iot_`, network `iot_net`, Caddy bind `127.0.0.1:8443`.

## 5. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử |
|---|---|---|
| `pnpm install` lỗi peer dep | Node < 20.11 hoặc pnpm < 9 | Nâng cấp Node LTS + `corepack enable` |
| `pnpm db:push` lỗi `role does not exist` | Chưa tạo role `hethong_app` trên Postgres | `CREATE ROLE hethong_app LOGIN PASSWORD '...'; CREATE DATABASE hethong_iot OWNER hethong_app;` |
| Login trả 401 nhưng user/password đúng | Chưa seed, hoặc hash argon2 không match | Chạy lại `pnpm db:seed`; kiểm env `JWT_SECRET` khớp giữa web và worker |
| Web lên nhưng `GET /api/ready` fail | Redis/R2 chưa cấu hình | Set `REDIS_URL`, `R2_*` đúng; tạm thời `/api/health` vẫn lên |
| Container `iot_app` OOM | `mem_limit=768m` chật khi build | Build image bên ngoài (CI), chỉ pull về VPS; kiểm `shared_buffers` Postgres |
| PWA scan không chạy camera offline | Service worker chưa register hoặc HTTPS thiếu | Dùng Cloudflare Tunnel (HTTPS tự động); check DevTools → Application → Service Workers |
| Drizzle `relation "user_account" does not exist` | Quên chạy `pnpm db:push` sau khi pull | Chạy lại `pnpm db:push` rồi `pnpm db:seed` |

---

Giấy phép: proprietary (nội bộ). Liên hệ maintainer trước khi fork.
