# Audit luồng Sản xuất + dữ liệu gốc — 2026-09-30

- **Phạm vi:** dữ liệu gốc (item/NCC/BOM/dự án) + BOM → Lệnh sản xuất (WO) → routing/gia công →
  tiến độ → lắp ráp → QC → thành phẩm/nhập kho → giao hàng. Nhu cầu vật tư của WO → PR/xuất kho.
  Dashboard sản xuất.
- **Phương pháp:** đọc code thật (`apps/web/src/app/(app)/**`, `api/**`, `server/repos/**`,
  `lib/wo-guards.ts`, `lib/hidden-features.ts`) + SELECT trực tiếp DB prod (`hethong_iot`, schema
  `app`) qua SSH — không sửa code, không ghi dữ liệu. Đối chiếu với
  `plans/v4.1-audit-hoan-thien/AUDIT.md` + `DOT4_PLAN.md` + `codexdo.md` để không báo lại lỗi đã
  sửa (SX-01..34, Q2, Q4, D10 đã DONE tại Đợt 4, commit `520e8b5`, E2E 26/26 trên prod).
- **Mức:** P0 = chặn nghiệp vụ/mất dữ liệu · P1 = sai chức năng nghiêm trọng · P2 = nên sửa.

## Bảng tóm tắt

| Quy trình | Trạng thái | Ghi chú |
|---|---|---|
| Dữ liệu gốc (Item/NCC/BOM import) | Hoàn chỉnh (đã audit + vá ở Đợt 1-7) | Không phát hiện thêm lỗi mới ngoài AUDIT.md cũ |
| Tạo LSX / YCSX từ dòng BOM | Hoàn chỉnh về form + chống trùng (SX-02/17/18 đã vá) | — |
| Duyệt / bắt đầu / tạm dừng / huỷ WO | Hoàn chỉnh (SX-06/07/08/09 đã vá, state machine rõ) | — |
| **Báo tiến độ → Hoàn thành LSX (kiểu mới, không dòng linh kiện)** | **GÃY (thiết kế)** | Hoàn thành chỉ cần `good_qty > 0`, không đối chiếu `plannedQty`; không trừ bất kỳ vật tư nào — xem PROD-01 |
| Lắp ráp quét barcode (kiểu cũ, cần `sales_order`) | **Ngõ cụt tiềm ẩn** | Backend còn nguyên (`assembly_scan`/`recordAssemblyScanAtomic`) nhưng UI `/assembly/[woId]` bị redirect toàn bộ sang tab Tiến độ (không có scan) — xem PROD-02 |
| WO → Yêu cầu vật tư (D6) → Phiếu xuất kho (goods_issue) → trừ tồn | Hoàn chỉnh về code (Đợt 1), **0 dòng dữ liệu thật trên prod** | Chưa được xưởng dùng lần nào — xem PROD-03 |
| Nhập kho thành phẩm (PROD_IN) | Đã ẩn có chủ đích (Q2), không tạo ngõ cụt | UI dialog đã bỏ ô nhập, TODO rõ ràng trong code |
| Ẩn Đơn hàng bán / ECO / Thiếu vật tư / Lắp ráp cũ (Đợt 4) | Hoàn chỉnh, không để lại ngõ cụt route/tab | Đã verify: `useTopTabState`, `hidden-features.ts`, dashboard `ProgressBarStack`, `/operations` đều lọc đúng; URL cũ fallback an toàn |
| Dashboard sản xuất | Hoàn chỉnh sau Đợt 4 (KPI theo GROUP BY, không còn snapshot đơn hàng) | — |
| BOM ↔ WO link (SX-16/17) | Hoàn chỉnh, đã verify code + DB | `bom_template_id`/`bom_line_id` hoạt động đúng |

## Phát hiện mới (chưa có trong AUDIT.md / DOT4_PLAN.md)

### PROD-01 (P1) — Hoàn thành LSX không đối chiếu sản lượng kế hoạch, không trừ vật tư

- **File:** `apps/web/src/lib/wo-guards.ts:62-84` (`checkWoCompletable`),
  `apps/web/src/server/repos/workOrders.ts:732-756` (`completeWO`),
  `apps/web/src/components/work-orders/ProgressReportForm.tsx:75-78` (`canSubmit`).
- **Kịch bản lỗi:** Với LSX tạo từ dòng BOM (`createFromBomLine`) hoặc LSX standalone
  (`createLsxWorkOrder`) — đây là **loại WO duy nhất còn dùng được trên prod** (2 WO thật, 0 dòng
  `work_order_line`) — điều kiện hoàn thành chỉ là `status === IN_PROGRESS && good_qty > 0`
  (`wo-guards.ts:78-84`). Không có so sánh với `plannedQty`. Operator có thể báo SL đạt = 0.01 cho
  kế hoạch 1000 cái rồi bấm "Hoàn thành" ngay — lệnh chuyển COMPLETED, không thể báo tiến độ/mở lại
  (`WO_ALLOWED_TRANSITIONS.COMPLETED = []`). Đồng thời, hoàn thành LSX **không ghi bất kỳ
  `inventory_txn` nào** — không trừ nguyên vật liệu theo BOM, không đối chiếu `material_requirements`
  (mảng JSON nhập tay chỉ để in phiếu). Việc "xin vật tư" hoàn toàn tách rời qua
  `material_request` → `goods_issue` (D6, đã làm ở Đợt 1) nhưng không có ràng buộc nào bắt vật tư
  phải được giao đủ trước khi hoàn thành LSX, và ngược lại hoàn thành LSX không đóng/đối chiếu các
  phiếu yêu cầu vật tư đang mở của chính WO đó.
- **Hệ quả nghiệp vụ:** Số liệu "Sản xuất nội bộ" trên dashboard (KPI `production`) và LSX
  "COMPLETED" không phản ánh đã sản xuất đủ số lượng; tồn kho vật tư không giảm dù LSX báo xong →
  lặp lại đúng dạng lệch số đã nêu ở AUDIT.md Q3 (giao phiếu yêu cầu không trừ tồn) nhưng ở lớp cao
  hơn (toàn bộ chu trình LSX, không chỉ 1 API).
- **Đề xuất:** (a) thêm điều kiện mềm cảnh báo khi `good_qty + scrap_qty < plannedQty` (chặn hoặc
  yêu cầu xác nhận "hoàn thành sớm" tuỳ chính sách anh Thang); (b) khi hoàn thành, kiểm còn
  `material_request` trạng thái OPEN/PARTIAL gắn `wo_id` này thì cảnh báo hoặc tự đóng; (c) về lâu
  dài, cân nhắc tự tạo gợi ý phiếu yêu cầu vật tư từ `bomTemplateId`/`bomLineId` của WO ngay khi
  duyệt (RELEASED) thay vì để operator gõ tay từng dòng ở `/material-requests/new`.

### PROD-02 (P1) — Ẩn Lắp ráp kiểu cũ (D10) để lại ngõ cụt tiềm ẩn cho WO có `linked_order_id`

- **File:** `apps/web/src/lib/hidden-features.ts:44-58` (redirect `/assembly/[woId]` →
  `/work-orders/[id]?tab=progress`), `apps/web/src/app/(app)/work-orders/[id]/page.tsx:670-770`
  (tab Tiến độ chỉ có `ProgressReportForm` + bảng dòng, KHÔNG có ô quét/scan),
  `apps/web/src/server/repos/assemblies.ts:144-150` (`ensureAssemblyOrder` bắt buộc
  `wo.linkedOrderId`, tức chỉ WO kiểu cũ mới quét được) và `:251-267` (`isWoScannable` vẫn cho
  RELEASED/QUEUED/IN_PROGRESS quét — guard backend còn sống).
- **Kịch bản lỗi:** Nếu có bất kỳ WO kiểu cũ (`linked_order_id` khác NULL, có `work_order_line` từ
  `bom_snapshot_line`) đang RELEASED/IN_PROGRESS/PAUSED với dòng linh kiện chưa quét đủ
  (`completed_qty < required_qty`) tại thời điểm bật ẩn D10, thao tác duy nhất để tiếp tục quét
  linh kiện (trừ kho theo lô, cộng `completed_qty`) là qua `/assembly/[woId]` — route này bị chặn ở
  layout (`redirect` không điều kiện, không kiểm còn dở dang hay không) và đẩy thẳng sang tab Tiến
  độ, nơi **không có bất kỳ control nào gọi `/api/assembly/scan`**. `checkWoCompletable` vẫn đòi
  "mọi dòng linh kiện đủ SL" mới cho hoàn thành → WO này **kẹt vĩnh viễn ở IN_PROGRESS/PAUSED**,
  không hoàn thành được, không quét tiếp được, chỉ còn đường "Huỷ" (mất reservation, không phản ánh
  đúng thực tế đã lắp một phần).
- **Xác minh trên prod (2026-09-30):** hiện KHÔNG có WO nào rơi vào tình huống này — DB chỉ có 2 WO
  thật, cả hai đều `linked_order_id IS NULL` (LSX mới, 0 dòng). Vậy đây là rủi ro **tiềm ẩn cho
  tương lai** (nếu bật lại Đơn hàng bán, hoặc còn dữ liệu demo/thử nghiệm dở dang ở môi trường khác),
  không phải sự cố đang xảy ra. Ghi nhận để không lặp lại khi D10 được "bật lại" hoặc dọn dữ liệu.
- **Đề xuất:** trước khi bật `HIDDEN_FEATURES.legacyAssembly = true` ở môi trường có dữ liệu thật,
  chạy kiểm tra `SELECT * FROM work_order WHERE linked_order_id IS NOT NULL AND status IN
  ('RELEASED','QUEUED','IN_PROGRESS','PAUSED')`; nếu có dòng, xử lý dứt điểm (hoàn thành/huỷ) trước
  khi ẩn — hoặc sửa `hiddenRouteRedirect`/layout để chỉ redirect nếu WO đó đã COMPLETED/CANCELLED,
  còn dở dang thì vẫn cho vào trang scan cũ (giữ 1 cửa thoát an toàn cho dữ liệu tồn).

### PROD-03 (P2, ghi nhận vận hành — không phải bug) — Vòng khép kín SX → kho chưa từng chạy thật

- **Bằng chứng DB (2026-09-30):**
  - `material_request`: **0 dòng**. `goods_issue`: **0 dòng**. `reservation` ACTIVE: **0 dòng**.
  - `work_order`: 2 dòng (1 RELEASED, 1 COMPLETED), cả hai `linked_order_id IS NULL`, cả hai
    **0 `work_order_line`**.
  - `inventory_txn` theo loại: `ADJUST_PLUS` 500, `IN_RECEIPT` 5, `ADJUST_MINUS` 3 — **0**
    `ASSEMBLY_CONSUME`, `OUT_ISSUE`, `PROD_IN`, `PROD_OUT`.
  - `inventory_lot_serial`: 490 lô, 100% `AVAILABLE` (không lô nào từng qua QC HOLD/consume).
- **Ý nghĩa:** toàn bộ 490 lô tồn kho hiện tại đến từ điều chỉnh thủ công (`ADJUST_PLUS`, khởi tạo
  dữ liệu), không phải từ chu trình nhận hàng → QC → xuất → lắp ráp thật. Module Kho (QC HOLD, phiếu
  xuất, giữ chỗ) và module Yêu cầu vật tư đã code xong và test E2E kỹ (Đợt 1, 23/23 ca) nhưng
  **xưởng chưa vận hành thật một vòng nào** qua hệ thống — mọi đánh giá "hoàn chỉnh" ở các module
  này mới dừng ở mức code + test kịch bản, chưa có xác nhận từ vận hành thực tế nhiều ngày.
- **Đề xuất:** không phải lỗi cần sửa code, nhưng nên là ưu tiên vận hành kế tiếp: chạy thử 1 WO thật
  từ đầu đến cuối (LSX → duyệt → yêu cầu vật tư gắn WO → Kho lập phiếu xuất → báo tiến độ → hoàn
  thành) để lộ ra các vấn đề UX/luồng thật mà audit tĩnh không thấy được (ví dụ PROD-01 ở trên chỉ lộ
  ra khi nhìn luồng đầu-cuối, không nằm riêng lẻ trong 1 file).

## Đối chiếu các mục AUDIT.md / DOT4_PLAN.md liên quan Đợt 4 — đã verify lại, không phát hiện sai/thiếu

- SX-16/17 (WO↔BOM qua `bom_template_id`/`bom_line_id`): đã verify `listWorkOrders`,
  `getWorkOrder`, `createFromBomLine`, `createLsxWorkOrder`, `resolveBomLink` — đúng như log, không
  còn phụ thuộc `sales_order` để hiện WO.
- SX-04/05 (hoàn thành WO 0 dòng khi `good_qty = 0`): đã vá đúng — `checkWoCompletable` chặn
  `good_qty <= 0`. (Gap còn lại là không so `plannedQty` — xem PROD-01, khác với lỗi gốc đã vá.)
- SX-06 (bỏ DRAFT→IN_PROGRESS): `WO_ALLOWED_TRANSITIONS` xác nhận DRAFT chỉ đi QUEUED/RELEASED/
  CANCELLED — đúng.
- SX-07/08 (xoá/huỷ nhả giữ chỗ): `deleteWO`/`cancelWO` đều gọi `releaseWoReservationsTx` trong
  cùng transaction — đúng.
- Q2/Q4/D10 (ẩn tính năng): verify toàn bộ điểm vào (`hidden-features.ts`, `useTopTabState.ts`,
  `ProgressBarStack.tsx`, `/operations/page.tsx`, dashboard `(app)/page.tsx`) — không còn lối vào
  sống nào tới Đơn hàng bán/ECO/Thiếu vật tư/Lắp ráp cũ; URL cũ fallback về tab mặc định, không lỗi.

## Không phát hiện thêm lỗi P0 mới

Không tìm thấy lỗi mới ở mức P0 (chặn vận hành/mất dữ liệu) ngoài những gì AUDIT.md đã liệt kê và
đã xử lý qua các Đợt 0-7. Hai phát hiện P1 mới (PROD-01, PROD-02) đều thuộc dạng "thiết kế còn hở"
chứ chưa gây sự cố dữ liệu trên prod tại thời điểm audit (2026-09-30).
