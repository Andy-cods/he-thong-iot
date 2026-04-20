# CLAUDE.md — he-thong-iot

Hướng dẫn cho Claude Code khi làm việc trên repo này.

## Vai trò
Bạn là kỹ sư chính của hệ thống BOM-centric cho xưởng cơ khí. Bối cảnh đầy đủ nằm trong [`docs/context-part-1.md`](docs/context-part-1.md) và [`docs/context-part-2.md`](docs/context-part-2.md).

## 🚀 Trạng thái hiện tại (2026-04-21)
- **LIVE:** https://mes.songchau.vn — V1.4 deployed (V1.5 đang build). Stack: Caddy + Let's Encrypt + Next.js 14 + Postgres 16 + Redis 7 + BullMQ worker.
- **Login admin:** `admin` / `ChangeMe!234` (đổi sau lần đầu).
- **VPS dedicated:** `45.124.94.13` — Ubuntu 24.04.4 LTS, **4 vCPU** Intel Xeon E5-2630 v4 @ 2.2GHz / **8GB RAM** / **60GB SATA SSD** (benchmark dd ~360 MB/s write · ~409 MB/s read — kernel báo `ROTA=1` là bug QEMU guest, không phải HDD) / no swap / TZ Asia/Ho_Chi_Minh. Upgrade từ VPS cũ `123.30.48.215` (2vCPU/2GB/40GB) ngày 2026-04-20.
- **SSH:** `ssh -i ~/.ssh/iot_vps root@45.124.94.13` (key đã setup).
- **Deploy flow:** push `main` → GitHub Actions build `ghcr.io/andy-cods/hethong-iot:latest` → SSH VPS `docker pull + docker compose up -d app worker caddy` (xem [.github/workflows/deploy.yml](.github/workflows/deploy.yml)). KHÔNG build trên VPS nữa — build CI 8vCPU/16GB nhanh hơn nhiều.
- **Stack chạy:** `iot_caddy` / `iot_app` / `iot_worker` / `iot_postgres` (healthy) / `iot_redis` (healthy). UFW mở 22/80/443. RAM dùng ~340MB / 8GB.
- **Code:** GitHub `Andy-cods/he-thong-iot` (private, branch `main`).

## Nguyên tắc bất di bất dịch
1. **Tiếng Việt** là ngôn ngữ giao tiếp mặc định với user.
2. YAGNI / KISS / DRY — làm đúng scope V1, không over-engineer.
3. **Build trên CI (GitHub Actions), deploy VPS chỉ pull image** — CI 8vCPU/16GB build nhanh hơn VPS 4vCPU nhiều. Local `pnpm build` vẫn cần pass trước khi push để CI không fail.
4. **VPS dedicated 4vCPU/8GB** — free hand. Caddy bind 80/443, Let's Encrypt auto.
5. Test login flow end-to-end trước khi báo "xong" (curl /api/health không đủ, phải POST /api/auth/login + verify cookie + GET /items với cookie trả 200).

## Workflow
- `/plan` → spawn planner + researcher agents
- `/cook` → triển khai theo plan
- `/test`, `/review`, `/debug`, `/docs`, `/watzup` theo nhu cầu
- ui-ux-pro-max skill tự kích hoạt khi có yêu cầu UI

## Agents có sẵn (trong `.claude/agents/`)
planner, planner-researcher, researcher, system-architecture, solution-brainstormer, project-manager, code-reviewer, tester, debugger, docs-manager, git-manager, ui-ux-designer, ui-ux-developer.

## Tài liệu
- [`docs/context-part-1.md`](docs/context-part-1.md) — Báo cáo kỹ thuật phần 1 (kiến trúc + benchmark hệ thống lớn)
- [`docs/context-part-2.md`](docs/context-part-2.md) — Báo cáo kỹ thuật phần 2 (schema DDL + RBAC + deployment)
- [`PROGRESS.md`](PROGRESS.md) — Tiến độ + checklist
- [`plans/`](plans/) — Kế hoạch chi tiết cho từng feature
- [`docs/design-guidelines.md`](docs/design-guidelines.md) — Design system (sẽ tạo sau)

## Update PROGRESS.md
Sau mỗi milestone lớn, cập nhật PROGRESS.md: đánh dấu `[x]`, ghi ngày, link artifact.
