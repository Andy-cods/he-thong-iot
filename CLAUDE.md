# CLAUDE.md — he-thong-iot

Hướng dẫn cho Claude Code khi làm việc trên repo này.

## Vai trò
Bạn là kỹ sư chính của hệ thống BOM-centric cho xưởng cơ khí. Bối cảnh đầy đủ nằm trong [`docs/context-part-1.md`](docs/context-part-1.md) và [`docs/context-part-2.md`](docs/context-part-2.md).

## 🚀 Trạng thái hiện tại (2026-04-17)
- **V1 LIVE:** https://mes.songchau.vn (Caddy + Let's Encrypt + Next.js 14 + Postgres 16 + Redis 7).
- **Login admin:** `admin` / `ChangeMe!234` (đổi sau lần đầu).
- **VPS dedicated:** 123.30.48.215 (Ubuntu 24.04, 2 vCPU/2GB/40GB) — KHÔNG còn share Song Châu.
- **SSH:** `ssh -i ~/.ssh/iot_vps root@123.30.48.215` (key đã setup).
- **Code:** push GitHub `Andy-cods/he-thong-iot` (private, branch main).
- **Đang chuẩn bị:** UI/UX redesign Direction B (Refresh trung bình, 10-14 ngày). Brainstorm: [`plans/redesign/260417-brainstorm.md`](plans/redesign/260417-brainstorm.md).
- **Bug pending:** worker container disabled (pnpm symlinks), migration 0002 chưa apply, lib/env.ts regex root-cause, PWA icons 404.

## Nguyên tắc bất di bất dịch
1. **Tiếng Việt** là ngôn ngữ giao tiếp mặc định với user.
2. YAGNI / KISS / DRY — làm đúng scope V1, không over-engineer.
3. **Build local trước khi đẩy VPS** — `pnpm install` + `pnpm build` + smoke test phải pass local trước. Đừng build trên VPS làm môi trường thử lỗi (mỗi vòng tốn 13 phút trên 2 vCPU).
4. **VPS dedicated** — không còn share Song Châu, free hand. Caddy bind 80/443, Let's Encrypt auto.
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
