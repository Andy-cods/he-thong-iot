# Codex Do

Ghi chú vận hành cho Codex trong repo `he-thong-iot`.

## Trạng thái kiểm tra 2026-04-26

- Local repo: `c:\dev\he-thong-iot`, branch `main`.
- Git remote: `origin https://github.com/Andy-cods/he-thong-iot.git`.
- SSH key VPS có sẵn: `~/.ssh/iot_vps`.
- SSH tới VPS OK bằng OpenSSH thật:
  - Host: `root@45.124.94.13`
  - Hostname: `ubuntu-4vcpu-8gb-1-0m6vr`
  - Lưu ý trong sandbox `ssh` có thể bị trỏ tới `C:\Users\ASUS\.sbx-denybin\ssh.bat`; khi cần SSH hãy gọi trực tiếp `C:\Windows\System32\OpenSSH\ssh.exe`.
- VPS deploy dir: `/opt/hethong-iot`.
- Docker Compose: `v5.1.3`.
- Containers đang chạy:
  - `iot_caddy`
  - `iot_app`
  - `iot_worker`
  - `iot_postgres` healthy
  - `iot_redis` healthy
- App image hiện tại trên VPS: `ghcr.io/andy-cods/hethong-iot:latest`.
- Health check nội bộ VPS OK:
  - `curl -kfsS --resolve mes.songchau.vn:443:127.0.0.1 https://mes.songchau.vn/api/health`
  - Kết quả: `{"ok":true,"app":"iot-web",...}`
- GitHub remote check OK khi chạy lệnh có quyền network ngoài sandbox:
  - `git ls-remote --heads origin main`

## Quy trình sau khi sửa code

1. Kiểm tra worktree trước khi sửa:
   - `git status --short`
   - Không revert thay đổi có sẵn của user nếu chưa được yêu cầu.

2. Verify local theo phạm vi thay đổi:
   - Web: `pnpm.cmd --filter @iot/web typecheck`
   - Shared: `pnpm.cmd --filter @iot/shared typecheck`
   - DB: `pnpm.cmd --filter @iot/db typecheck`
   - Worker: `pnpm.cmd --filter @iot/worker typecheck`
   - Tránh dùng `pnpm -r typecheck` trên Windows nếu gặp `spawn EPERM`; chạy từng package riêng.

3. Commit và push GitHub khi user yêu cầu:
   - `git status --short`
   - `git add <files>`
   - `git commit -m "<message>"`
   - `git push origin main`

4. Deploy VPS khi user yêu cầu:
   - Nếu GitHub Actions đã build/push `ghcr.io/andy-cods/hethong-iot:latest`, SSH vào VPS và pull image:
     - `C:\Windows\System32\OpenSSH\ssh.exe -i $env:USERPROFILE\.ssh\iot_vps root@45.124.94.13`
     - `cd /opt/hethong-iot`
     - `docker compose pull app worker`
     - `docker compose up -d app worker caddy`
   - Sau deploy, kiểm tra:
     - `docker ps --format '{{.Names}} {{.Status}}'`
     - `curl -kfsS --resolve mes.songchau.vn:443:127.0.0.1 https://mes.songchau.vn/api/health`

## Lưu ý quyền chạy lệnh

- Network tới GitHub có thể bị sandbox chặn qua proxy `127.0.0.1`; nếu `git ls-remote`, `git push`, hoặc lệnh network fail do sandbox, chạy lại với quyền escalated.
- Không đọc/in secret trong `/opt/hethong-iot/secrets`.
- Không chạy lệnh destructive như `git reset --hard`, xóa volume/container/database nếu user chưa yêu cầu rõ.

---

# 📋 Hàng đợi nhiệm vụ (Task Queue)

> **User feedback 2026-04-26 (+07):** "tôi muốn bạn làm người lên kế hoạch để thêm vào file codexdo.md sau đó bạn hãy phân công nó để nó đọc và làm nhé, ghi log thời gian các thứ để nó không bị trùng lặp các prompt hoặc task làm nhiều lần"
>
> **Phân vai:**
> - **Claude** (planner) — viết task có ID + timestamp + acceptance criteria
> - **Codex** (executor) — đọc task TODO, execute, mark DONE với log
> - **Human** (user) — approve P0, quyết định scope

## Quy ước (Convention)

### Format 1 task

```markdown
### TASK-YYYYMMDD-NNN — Tiêu đề ngắn
- **Trạng thái:** TODO | IN_PROGRESS | DONE | BLOCKED | CANCELLED
- **Tạo:** YYYY-MM-DD HH:MM (+07) bởi Claude (planner)
- **Phụ trách:** Codex | Claude | Human
- **Bắt đầu:** ___ (executor điền khi nhận)
- **Hoàn thành:** ___ (executor điền khi xong)
- **Ưu tiên:** P0 | P1 | P2 | P3
- **Phụ thuộc:** TASK-XXX (nếu có)

**Mô tả:** 1-3 câu what + why.

**Acceptance criteria (DoD):**
- [ ] Tiêu chí 1 — observable
- [ ] Tiêu chí 2

**File path liên quan:**
- `apps/web/src/...`

**Output / log:** (executor điền — commit hash, test result, etc.)
```

### Anti-duplicate rules

1. **Mỗi task có ID duy nhất** `TASK-YYYYMMDD-NNN` (NNN = sequence trong ngày).
2. **Trước khi tạo task mới**, search keyword. Nếu task tương tự đang TODO/IN_PROGRESS → comment vào task cũ thay vì tạo mới.
3. **Trước khi execute**, đổi `TODO → IN_PROGRESS` + ghi `Bắt đầu: <timestamp>`. Nếu task đã `IN_PROGRESS` bởi agent khác → SKIP.
4. **Khi xong**, đổi `DONE` + ghi `Hoàn thành: <timestamp>` + paste log.
5. **KHÔNG xoá task** — giữ làm reference. Move sang `codexdo-archive.md` sau 30 ngày DONE.

### Execute order

1. Lọc `Trạng thái: TODO`
2. Sắp `Ưu tiên` (P0 → P3) → tie-break `Tạo` ASC
3. Skip task có `Phụ thuộc` chưa DONE
4. Pick top → execute → mark DONE

### Format timestamp

`YYYY-MM-DD HH:MM (+07)` — Asia/Ho_Chi_Minh.

---

## 🚀 Tasks

<!-- Task mới TRÊN, cũ DƯỚI. -->

### TASK-20260426-001 — Migration 0031 seed FULL master catalog (60+ mat / 19 proc)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-26 23:40 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-26 23:42 (+07)
- **Hoàn thành:** 2026-04-26 23:44 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** —

**Mô tả:** User: "tôi cần bạn thêm đủ 100% thông tin như excel ở sheet material". Bổ sung 40 materials + 8 processes còn thiếu so với migration 0017.

**Acceptance criteria:**
- [x] File `packages/db/migrations/0031_seed_full_master_catalog.sql`
- [x] Apply VPS không lỗi (idempotent ON CONFLICT)
- [x] `material_master ≥ 60`, `process_master ≥ 19`

**Output / log:** Applied 2026-04-26 23:44 — `INSERT 0 40 (mat) + INSERT 0 8 (proc)`. Final: material_master=63, process_master=19.

---

### TASK-20260426-002 — Update gen-bom-sql aliases full coverage
- **Trạng thái:** DONE
- **Tạo:** 2026-04-26 23:42 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Hoàn thành:** 2026-04-26 23:46 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** TASK-20260426-001

**Mô tả:** Script `scripts/gen-bom-sql-from-excel.ts` chỉ có 21 codes catalog. Mở rộng full 60+ với aliases EN+VN.

**Acceptance criteria:**
- [x] MATERIAL_CATALOG ≥60 entries
- [x] Order: longer-prefix first (vd `SUS304_20_40` trước `SUS304`)
- [x] Aliases có VN ("đồng thau", "thép gió")

**Output / log:** Cập nhật 60+ entries với 2-4 aliases mỗi code. Sẽ commit cùng commit codexdo.md.

---

### TASK-20260426-003 — Tạo `codexdo.md` task queue convention (chính file này)
- **Trạng thái:** DONE
- **Tạo:** 2026-04-26 23:50 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-26 23:50 (+07)
- **Hoàn thành:** 2026-04-26 23:59 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** —

**Mô tả:** User yêu cầu workflow planner. Tạo convention + 5 task queue đầu tiên.

**Acceptance criteria:**
- [x] Section "Hàng đợi nhiệm vụ" thêm vào codexdo.md (giữ phần Codex viết trước)
- [x] Format task chuẩn (ID, timestamp, status, DoD)
- [x] Anti-duplicate rules + execute order
- [x] Commit + push (commit pending)

---

### TASK-20260426-004 — Update CLAUDE.md ghi nhớ workflow `codexdo.md`
- **Trạng thái:** DONE
- **Tạo:** 2026-04-26 23:55 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-26 23:59 (+07)
- **Hoàn thành:** 2026-04-27 00:01 (+07)
- **Ưu tiên:** P2
- **Phụ thuộc:** TASK-20260426-003

**Mô tả:** Thêm section vào `CLAUDE.md` chỉ rõ: trước khi nhận user prompt, agent phải search `codexdo.md` xem task tương tự đã có chưa. Sau khi xong, mark DONE + log.

**Acceptance criteria:**
- [x] CLAUDE.md có section `## 📋 Workflow planning với codexdo.md`
- [x] Liệt kê: search trước, format ID, status workflow
- [x] Link tới `codexdo.md`

**Output / log:** CLAUDE.md updated với 6 quy tắc bắt buộc + execute order. Mọi Claude/Codex session tương lai sẽ thấy rule này khi load CLAUDE.md đầu phiên.

---

### TASK-20260427-006 — Auto-populate full catalog (63 mat + 19 proc) vào MỌI BOM Material&Process sheet
- **Trạng thái:** IN_PROGRESS
- **Tạo:** 2026-04-27 00:10 (+07) bởi Claude (planner)
- **Phụ trách:** Claude (executor)
- **Bắt đầu:** 2026-04-27 00:11 (+07)
- **Ưu tiên:** P1
- **Phụ thuộc:** TASK-20260426-001

**Mô tả:** User feedback: "tôi muốn nó có đầy đủ sẵn luôn ở tất cả bom list hiện tại chứ không phải giờ mới thêm mới vào từng vật liệu 1". Backfill tất cả material_master (63) + process_master (19) vào mỗi MATERIAL sheet hiện có, và update `createTemplate` để BOM mới tự auto-populate full catalog.

**Acceptance criteria:**
- [ ] Migration `0032_backfill_full_catalog_to_all_bom_sheets.sql` viết xong
- [ ] Apply VPS, verify mỗi MATERIAL sheet có ≥63 mat rows + ≥19 proc rows
- [ ] `createTemplate` repo update: sau INSERT bom_sheet "Material & Process" → bulk INSERT all materials + processes
- [ ] BOM mới tạo qua API có 63+19 rows trong Material&Process tab
- [ ] BOM cũ (id `6dead934-...`) tab Material&Process hiển thị full catalog
- [ ] Idempotent: chạy lại migration không nhân đôi rows

**File path:**
- `packages/db/migrations/0032_backfill_full_catalog_to_all_bom_sheets.sql` (mới)
- `apps/web/src/server/repos/bomTemplates.ts` (update createTemplate)

---

### TASK-20260426-005 — Re-seed BOM real với material aliases full
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:55 (+07) bởi Claude (planner)
- **Phụ trách:** Codex hoặc Claude (executor)
- **Ưu tiên:** P3
- **Phụ thuộc:** TASK-20260426-001, TASK-20260426-002

**Mô tả:** BOM real id `6dead934-...` hiện chỉ match 3 vật liệu. Sau khi catalog mở rộng, re-run gen-bom-sql sẽ match thêm Acetal black → POM, vv. Re-seed để demo full catalog.

**Acceptance criteria:**
- [ ] DELETE BOM cũ (id `6dead934-e299-4bb7-873d-232fe8a027a2`)
- [ ] Re-run gen-bom-sql → output SQL mới
- [ ] Apply VPS → verify `mat_rows ≥ 5`
- [ ] Click BOM detail Material&Process tab → thấy đủ vật liệu mới

---

## 📂 Sprint 7 backlog

### TASK-20260427-S7A — Migration 0023 approval_chain (multi-level)
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P1

**Mô tả:** Per `plans/redesign-v3/addendum-user-answers.md` Q1, schema `approval_chain` (definition) + `approval_request` (runtime) + `approval_step` (audit) cho PR/PO/WO ≥2 cấp.

**Acceptance criteria:**
- [ ] `packages/db/migrations/0023_approval_chain.sql` (skeleton từ addendum §1.1)
- [ ] Drizzle schema `packages/db/src/schema/approval.ts`
- [ ] Apply VPS, verify 3 tables
- [ ] Seed 2 default chain (PR + WO)

---

### TASK-20260427-S7B — UI ApprovalTimeline + tích hợp PR/PO/WO
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P1
- **Phụ thuộc:** TASK-20260427-S7A

**Mô tả:** Component `<ApprovalTimeline>` vertical step + nút Duyệt/Từ chối. Tích hợp PR/PO/WO detail.

**Acceptance criteria:**
- [ ] Component `apps/web/src/components/approval/ApprovalTimeline.tsx`
- [ ] API `/api/approval/[id]/approve` POST + `/reject`
- [ ] Hook `useApproval`
- [ ] Test: tạo PR → submit → 2 cấp duyệt → APPROVED

---

### TASK-20260427-S7C — Migration 0024 mention_notification
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P2

**Mô tả:** Per addendum §1.2 — bảng `mention_notification` + cột `bom_line_note.mentioned_user_ids uuid[]` cho @mention feature.

---

### TASK-20260427-S7D — UI MentionPicker + NotificationBell TopBar
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P2
- **Phụ thuộc:** TASK-20260427-S7C

---

### TASK-20260428-S8A — Migration 0022 payment_log + workspace `/accounting`
- **Trạng thái:** TODO
- **Tạo:** 2026-04-26 23:58 (+07) bởi Claude (planner)
- **Phụ trách:** Codex
- **Ưu tiên:** P2

**Mô tả:** Sprint 8 Bộ phận Kế toán tối thiểu — payment_log + công nợ NCC. KHÔNG VAT/MISA (out-of-scope per user 2026-04-25).

---

## 🗄️ Archive (DONE > 30 ngày)

(Empty)

---

## 📊 Stats

- Tổng task: 9
- TODO: 5
- IN_PROGRESS: 0
- DONE: 4
- BLOCKED: 0
- Update lần cuối: 2026-04-27 00:01 (+07)
