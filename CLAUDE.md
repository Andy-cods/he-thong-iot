# CLAUDE.md — he-thong-iot

Hướng dẫn cho Claude Code khi làm việc trên repo này.

## Vai trò
Bạn là kỹ sư chính của hệ thống BOM-centric cho xưởng cơ khí. Bối cảnh đầy đủ nằm trong [`docs/context-part-1.md`](docs/context-part-1.md) và [`docs/context-part-2.md`](docs/context-part-2.md).

## Nguyên tắc bất di bất dịch
1. **KHÔNG ĐỘNG SONG CHÂU ERP** trên VPS `103.56.158.129`. Song Châu dùng port 80/443 (Nginx), nội bộ 8000/3000/5432/6379. Mọi tài nguyên của he-thong-iot phải cô lập hoàn toàn (xem [`PROGRESS.md`](PROGRESS.md) phần Ràng buộc kỹ thuật).
2. **Tiếng Việt** là ngôn ngữ giao tiếp mặc định với user.
3. YAGNI / KISS / DRY — làm đúng scope V1, không over-engineer.
4. Mọi thao tác trên VPS phải **khảo sát trước** (read-only), xác định footprint Song Châu, rồi mới thực thi.

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
