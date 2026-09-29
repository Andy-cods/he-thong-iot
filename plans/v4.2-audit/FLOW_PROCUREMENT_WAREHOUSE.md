# Audit luồng Thu mua + Kho (V4.2) — 2026-09-30

> Phạm vi: Đề xuất vật tư (PR/DNVT/YCVT) → duyệt → PO → gửi NCC → nhận hàng + QC → HĐ mua → bàn giao Tài chính | Kho: nhập, xuất (ISR/goods_issue/material_request), tồn theo lô/bin, sơ đồ kho, kiểm kê/điều chỉnh, bin "Chờ xếp kệ".
> Phương pháp: đọc code thật (đường dẫn tuyệt đối), đối chiếu `plans/v4.1-audit-hoan-thien/AUDIT.md` + `DOT1_PLAN.md` + `DOT2_PLAN.md` + `codexdo.md`, SELECT trực tiếp trên Postgres prod (`45.124.94.13`, schema `app`). Chỉ đọc, không sửa code/dữ liệu.
> Bối cảnh dữ liệu prod: hệ thống còn rất mỏng dữ liệu (10 PR, 6 PO, 0 material_request, 0 goods_issue, 0 issue_request, 490 lô đều AVAILABLE) — audit chủ yếu dựa vào đọc code, có đối chiếu vài mẫu dữ liệu thật khi có.

## Tóm tắt

| Quy trình | Trạng thái | Ghi chú |
|---|---|---|
| Nhận hàng + QC HOLD (Đợt 1a) | **Hoàn chỉnh** | `assertIssuable` chặn nhất quán mọi đường xuất; QC PASS/FAIL/PENDING đúng thiết kế; đã xác nhận sửa đúng toàn bộ KHO-01…17 |
| Xuất kho (nhanh/ISR/goods_issue) | **Hoàn chỉnh về kỹ thuật, GÃY về lối vào** | Cơ chế đúng nhưng module "Yêu cầu vật tư" (nguồn tạo ra giao dịch xuất nội bộ) đã mất mọi lối vào UI → 0 dữ liệu thật trên prod |
| Huỷ/Đóng PO khi đã nhận hàng | **Gãy (2 cơ chế song song mâu thuẫn)** | Route cũ `/api/receiving/[poId]/reject` vẫn cho phép huỷ PO PARTIAL, bypass state machine `cancel`/`close` mới của Đợt 2 |
| PR → duyệt → PO (Đợt 2) | **Hoàn chỉnh** | Toàn bộ TM-01…20, D7, D8 đã xác nhận sửa đúng trong code hiện tại |
| PR bị kẹt sau khi duyệt (không tạo PO) | **Thiếu cơ chế phục hồi** | 2 PR thật trên prod đã DUYỆT XONG từ tháng 7/2026, chưa từng có PO, chưa từng có thông báo — dữ liệu lịch sử kẹt vĩnh viễn, không có cảnh báo chủ động |
| HĐ mua từ PO (D7) | **Hoàn chỉnh** | Khoá PO, unique constraint, bắt race 23505, tính đúng theo SL nhận đạt |
| Tồn kho theo lô/bin, công thức chuẩn | **Hoàn chỉnh, còn vài chỗ tính tay dư thừa** | `v_lot_stock`/`v_item_stock` dùng nhất quán ở nơi hiển thị chính; còn 2-3 chỗ tính tay trùng logic (rủi ro bảo trì, chưa gây sai số) |
| Bin "Chờ xếp kệ" | **Hoàn chỉnh** | `resolveStagingBinId` throw rõ nếu thiếu cấu hình, không âm thầm mất hàng |
| Thông báo (Đợt notif gần đây) | **Hoàn chỉnh** | Link đều trỏ đúng route tồn tại; dữ liệu thông báo cũ trỏ `/warehouse/delivery-notes/:id` (404) là rác lịch sử trước fix, không phải lỗi code hiện tại |

---

## P0 — Chặn vận hành / sai dữ liệu

### P0-1. Route cũ `/api/receiving/[poId]/reject` bypass hoàn toàn state machine Huỷ/Đóng PO mới, cho phép huỷ PO đã có hàng thật trong kho

- **File:** `apps/web/src/app/api/receiving/[poId]/reject/route.ts:52` — guard chỉ chặn `status === "CANCELLED"`, còn lại cho qua cả `SENT` lẫn `PARTIAL`.
- **File:** `apps/web/src/server/repos/purchaseOrders.ts:1198-1233` (`rejectReceivingPO`) — update thẳng `status`, **không transaction, không `FOR UPDATE`, không kiểm đã có `inbound_receipt`/lô hàng nào chưa**.
- So sánh với cơ chế đúng mới xây ở Đợt 2: `cancelPO` (`purchaseOrders.ts:1387-1419`) cố tình **chặn PARTIAL** ("PO đã nhận một phần — dùng Đóng PO thay vì huỷ", mã lỗi `HAS_RECEIPTS`), có `FOR UPDATE` khoá đủ.
- **UI vẫn còn sống:** nút "Từ chối" trong `components/warehouse/ReceivingMovementView.tsx:169,552-593` gọi `useRejectReceiving` → route cũ này. Cùng RBAC (`transition:po` = admin+warehouse) với route `cancel`/`close` mới nên Kho không có cách nào phân biệt "dùng nút nào mới đúng".
- **Kịch bản lỗi thực tế:** PO đã nhận 1 phần (status PARTIAL, hàng đã vào `inventory_lot_serial`/`inventory_txn`, có thể đã được QC PASS và xuất dùng tiếp). Kho vào tab Nhận hàng, bấm "Từ chối" (thay vì "Đóng PO" ở trang chi tiết PO) → PO chuyển thẳng CANCELLED, `metadata.rejectedStage='RECEIVING'`. Hàng thật vẫn nằm trong kho, đã tính vào tồn, nhưng PO gốc bị đánh dấu huỷ — không đối soát được nguồn gốc, PR gốc không được cập nhật trạng thái, không có cách "hoàn tác" quay lại PARTIAL.
- **Đề xuất:** xoá route + nút UI "Từ chối" cũ này (đã có `cancel`+`close` thay thế đúng ý ở trang chi tiết PO), hoặc tối thiểu thêm guard `HAS_RECEIPTS` giống `cancelPO` vào `rejectReceivingPO`.

### P0-2. Toàn bộ lối vào UI để tạo "Yêu cầu vật tư" (material_request) — nền tảng của cơ chế phiếu xuất kho nội bộ (Q3/KHO-04, trọng tâm sửa lỗi mất tồn kho Đợt 1) — đã bị xoá, khiến quy trình có INPUT nhưng không ai tạo được

- Route `/material-requests`, `/material-requests/new` vẫn tồn tại về code, RBAC đúng thiết kế (`packages/shared/src/rbac/matrix.ts:126,147,179` — operator/warehouse/planner đều có `create:materialRequest`).
- Nhưng **không menu nào dẫn tới** — commit `53a865c` (27/09) "bỏ menu Yêu cầu vật tư — trùng Đề xuất vật tư" đã xoá dòng nav trong `apps/web/src/lib/nav-items.ts:142-144` (chỉ còn comment giải thích).
- **Đồng thời xoá luôn nút "Tạo yêu cầu vật tư" trên trang chi tiết lệnh SX** — diff commit `53a865c` cho thấy đã gỡ hẳn khối `<Link href="/material-requests/new?woId=...">` + biến `canRequestMaterial` khỏi `apps/web/src/app/(app)/work-orders/[id]/page.tsx`.
- Grep toàn bộ `apps/web/src/components/**/*.tsx` cho `material-requests/new` → **0 kết quả**. Grep cho `material-requests/${id}` chỉ ra 2 nơi (`ReconciliationSection.tsx:304`, `GoodsIssuesTab.tsx:356`) — đều là link tới **chi tiết MR đã tồn tại sẵn**, không phải link tạo mới.
- **Nhầm lẫn nghiệp vụ cần lưu ý:** "Đề xuất vật tư" (PR/DNVT/MRF — `apps/web/src/app/(app)/procurement/purchase-requests/**`) là cơ chế **mua từ nhà cung cấp ngoài** (comment tại `new-dnvt/page.tsx:25`: "Backend + luồng duyệt + số phiếu dùng CHUNG với MRF"). "Yêu cầu vật tư" (`material_request` — bảng riêng) là cơ chế **giao vật tư đã có sẵn trong kho** xuống cho SX/operator qua `goods_issue`, hoàn toàn khác luồng dữ liệu (không qua PR/PO/NCC). Quyết định gộp 2 tên gọi ở menu (Thang chốt 27/09) đã vô tình xoá luôn lối vào của cơ chế thứ hai, không phải chỉ đổi tên.
- **Bằng chứng thực tế trên prod:** `SELECT count(*) FROM app.material_request` = 0, `SELECT count(*) FROM app.warehouse_issue_request` = 0, `SELECT count(*) FROM app.goods_issue` = 0 — toàn bộ hạ tầng phiếu xuất kho xây ở Đợt 1 (D2/Q3, sửa đúng lỗ hổng mất tồn kho KHO-04) **chưa từng được dùng một lần nào** kể từ khi deploy (26/09) đến nay (30/09), khớp hoàn toàn với việc không còn lối vào.
- **Đề xuất:** hoặc (a) khôi phục nút "Tạo yêu cầu vật tư" trên trang WO (đã xây sẵn, chỉ cần un-revert) cho operator/planner, hoặc (b) nếu chủ trương thật sự là gộp 2 khái niệm, phải chuyển hướng PR "loại vật tư nội bộ / có sẵn trong kho" sang tạo `material_request` + `goods_issue` thay vì luôn hướng ra NCC — hiện tại PR không có phân nhánh này (mọi PR đều đi PO → NCC).

---

## P1 — Nghiêm trọng

### P1-1. PR đã duyệt xong (DIRECTOR_APPROVED) nhưng chưa tạo PO không có cơ chế cảnh báo chủ động — 2 phiếu thật đã kẹt 2.5 tháng trên prod

- Dữ liệu thật: `PR-2607-0064` (YCVT Bộ phận Gia công, duyệt xong 11/07/2026) và `PR-2607-0071` (DNVT Bộ phận Gia công, duyệt xong 14/07/2026) — cả hai `status=APPROVED, approval_step=DIRECTOR_APPROVED`, tính đến 30/09/2026 là **hơn 2.5 tháng chưa có PO nào được tạo** (`SELECT ... WHERE po.metadata->>'prId'=pr.id::text` = rỗng cho cả hai).
- `SELECT * FROM app.notification WHERE entity_code IN (...)` = 0 dòng — xác nhận đây là hệ quả của lỗi TM-05 gốc (trước khi `notifyPRApprovedToPurchasing` được thêm ở Đợt 2); fix code không có cơ chế "quét lại" các PR cũ bị bỏ sót.
- Cơ chế lọc thủ công có tồn tại (`PRTab.tsx` filter theo `status`, chọn "APPROVED" sẽ thấy 2 case này) nhưng **không có dashboard/cảnh báo nào chủ động nhắc** — không giống PR_PENDING_REMINDER (dành cho PR đang chờ duyệt) hay FIN_INVOICE_DUE_SOON. Thẻ dashboard "Đề xuất vật tư" (`server/services/dashboardOverview.ts:107`) chỉ đếm tỉ lệ `APPROVED+CONVERTED / tổng`, không tách riêng "đã duyệt nhưng chưa xử lý quá N ngày".
- **Đề xuất:** thêm job nhắc định kỳ tương tự `PR_PENDING_REMINDER` cho PR ở `APPROVED` quá N ngày chưa `CONVERTED`; hoặc thêm badge/bộ đếm riêng trên trang PR list.

### P1-2. `/api/purchase-requests/[id]/reject` không áp dụng `isSelfApprovalBlocked` — không nhất quán với 2 route duyệt cùng nhóm (D8)

- **File:** `apps/web/src/app/api/purchase-requests/[id]/reject/route.ts` — dùng `requireCan(req, "approve", "pr")` giống `dept-approve`/`director-approve` nhưng thiếu bước gọi `isSelfApprovalBlocked`.
- Hệ quả: người lập PR (nếu có role warehouse/purchaser, không phải admin) có thể tự từ chối phiếu của chính mình — không đúng nguyên tắc D8 (người tạo không tự xử lý phiếu của mình), dù rủi ro nghiệp vụ thấp hơn tự-duyệt (từ chối không phát sinh nghĩa vụ mua hàng).
- **Đề xuất:** thêm guard `isSelfApprovalBlocked` vào route reject cho đồng bộ.

---

## P2 — Nên sửa

### P2-1. Công thức tồn kho còn 2-3 chỗ tính tay ngoài view chuẩn `v_lot_stock`/`v_item_stock`
- `apps/web/src/app/api/lot-serial/route.ts:82-90` — tự SUM CASE trên `inventory_txn` thay vì JOIN view chuẩn; số hiện đúng (logic giống hệt view) nhưng là bản sao logic thứ 2, rủi ro lệch âm thầm nếu sau này sửa view mà quên đồng bộ. Trang này cũng không hiển thị `issuable_qty` nên người dùng phải tự trừ nhẩm reservation.
- `apps/web/src/server/services/derivedStatus.ts:98-121` (`computeTemplateDerivedStatus`) — cùng kiểu tính tay từ `inventory_txn`.
- `apps/web/src/server/repos/assemblies.ts:628-644` (`getLotOnHandRemaining`) — **code chết**, không có nơi nào gọi (grep toàn bộ `src/` chỉ ra định nghĩa, 0 lời gọi) — nên xoá hoặc xác nhận rồi xoá trong đợt dọn dẹp kế tiếp.

### P2-2. PO tạo từ dòng BOM (subcontract) không có guard chống tạo trùng khi bấm đúp
- `apps/web/src/app/api/purchase-orders/from-bom-line/[lineId]/route.ts` — không khoá theo `bomLineId`, không có unique constraint; bấm đúp nhanh trước khi nút disable kịp có thể tạo 2 PO nháp cho cùng 1 dòng BOM. Ảnh hưởng thấp (cả hai đều DRAFT, dễ phát hiện/xoá tay).

### P2-3. Race lý thuyết trong dedupe thông báo "PO đã nhận đủ" (`runOnce`, commit b4ac169)
- `apps/web/src/server/services/notifications.ts` — kiểm tra "đã gửi chưa" bằng SELECT thường, không khoá cùng transaction với INSERT. Về lý thuyết 2 luồng cập nhật PO gần như đồng thời (nhận hàng + QC-recompute) có xác suất nhỏ gửi trùng thông báo. Thực tế khó xảy ra vì 2 luồng khoá PO tuần tự. Mức độ thấp, không cần sửa gấp.

### P2-4. Dữ liệu thông báo lịch sử trỏ route đã đổi (không phải lỗi code hiện tại)
- 5 bản ghi `DELIVERY_NOTE_CONFIRMED` (22/09/2026, trước audit) có `link=/warehouse/delivery-notes/:id` (route không tồn tại — chỉ có `/warehouse?tab=delivery-notes&id=`). Đã xác nhận code hiện tại (`notification-plans.ts:234` `L.whDeliveryNote`) tạo đúng link mới; đây chỉ là rác dữ liệu cũ, sẽ tự hết khi người dùng đọc/hết hạn. Không cần xử lý gấp, có thể dọn bằng UPDATE thủ công nếu muốn.

---

## Đã xác nhận SỬA ĐÚNG (không lặp lại như lỗi mới)

Toàn bộ danh sách KHO-01…27 (trừ P0-2 nêu trên) và TM-01…26 trong `AUDIT.md` đã được kiểm chứng lại bằng đọc code thật, kết quả: **đã sửa đúng và nhất quán**, bao gồm:
- QC HOLD nhận hàng (KHO-01/Q1), guard xuất chung `assertIssuable` áp dụng ở mọi đường xuất (xuất nhanh, ISR, goods_issue, assembly consume, bin adjust) (KHO-02/05/06/10/13/14), tách lô trùng mã (KHO-07/D5), PO không hợp lệ bị chặn nhận hàng + chọn đúng dòng PO (KHO-08/09), rút hàng đúng lô (KHO-11), RBAC QC/planner đúng thiết kế (KHO-12), transaction + khoá đầy đủ khi chuyển bin (KHO-13/19), `qc_flag` tính lại đúng (KHO-15), công thức tồn chuẩn `v_lot_stock`/`v_item_stock` (KHO-16), giao dịch material_request không còn race/ngõ cụt (KHO-17/25), số chứng từ race-safe (KHO-20), "Khả dụng" hiển thị đúng (KHO-23), link Lot/Serial có itemId (KHO-26).
- Migration `0061_fix_reservation_lock.sql` (sửa lỗi `pg_advisory_xact_lock` sai chữ ký) **đã xác nhận apply đúng trên VPS prod** (`SELECT prosrc FROM pg_proc WHERE proname='reservation_lock'` khớp bản sửa) — không còn là rủi ro treo lơ lửng.
- PR/PO: chặn PO trùng khi tạo từ PR (TM-01/08), giữ snapshot/spec khi sửa PO nháp (TM-03), VAT 0% hợp lệ (TM-04), thông báo Thu mua khi PR duyệt xong + PR từ thiếu hụt không kẹt DRAFT (TM-05/06), override giá không lọt sang PR khác + lỗi không bị nuốt (TM-09), PO từ PR mang đúng giá dự kiến + chặn duyệt PO 0đ (TM-10), mark-completed/issued kiểm đúng trạng thái PR (TM-13), nhận nhanh ghi nhận vào PR (TM-14), duyệt "đủ" tính từng dòng + loại trừ hàng NG (TM-15/16), có huỷ/đóng PO chính thức (TM-17, nhưng xem P0-1 về route cũ song song), HĐ mua từ PO đúng thiết kế D7 (TM-18), Kho không sửa được giá PO + không tự duyệt phiếu mình (TM-19/D8, áp dụng nhất quán ở PO approve 2 lớp), Excel PO đúng định dạng số + đúng mã PR (TM-20).
- Trang chi tiết PO thiết kế lại (commit `8f45829`) — RBAC D8 đúng, race 2 người sửa giá được xử lý bằng `FOR UPDATE` tuần tự, không mất update.
- Thông báo hoàn thiện (`08ec3d7`, `b4ac169`) — mọi link kiểm tra đều trỏ đúng route tồn tại thật; dedupe "PO đã nhận đủ" hoạt động đúng trong luồng bình thường; không phát hiện sự kiện quan trọng nào còn thiếu thông báo (PR rejected, PO rejected, HĐ mua tạo xong đều đã có).
- Bin "Chờ xếp kệ" (`resolveStagingBinId`) throw rõ ràng khi thiếu cấu hình, không âm thầm mất hàng.

---

## Tính năng thừa / trùng lặp

1. **`/api/receiving/[poId]/reject` (cũ) vs `cancel`/`close` PO (mới, Đợt 2)** — xem P0-1. Đề xuất bỏ route/nút cũ, không cần giữ song song 2 cách huỷ PO.
2. **"Đề xuất vật tư" (PR/DNVT/MRF) và "Yêu cầu vật tư" (material_request)** — về UI đã gộp thành một entrypoint theo quyết định nghiệp vụ, nhưng về kỹ thuật là 2 bảng/luồng dữ liệu hoàn toàn khác nhau (mua ngoài NCC vs. xuất từ tồn kho có sẵn). Xem P0-2 — đây không đơn thuần là "trùng lặp cần gộp" mà là gộp nhầm gây mất chức năng.

---

## File đã đọc trong quá trình audit (không lặp lại toàn bộ, tham khảo)

`apps/web/src/server/repos/{stockGuard,receivingEvents,inboundQc,goodsIssues,materialRequests,assemblies,items,inventory,warehouseLocation,purchaseOrders,poInvoice,poPrices}.ts`; `apps/web/src/lib/procurement-policy.ts` (+ test); `apps/web/src/server/services/{notifications,notification-plans,dashboardOverview,derivedStatus}.ts`; `apps/web/src/app/api/{receiving,warehouse,lot-serial,issue-request,material-requests,purchase-orders,purchase-requests}/**`; `apps/web/src/app/(app)/{warehouse,material-requests,procurement,work-orders,qc-inbound}/**`; `apps/web/src/components/{warehouse,procurement,engineering}/**`; `packages/db/migrations/0059_qc_hold.sql, 0060_goods_issue.sql, 0061_fix_reservation_lock.sql, 0062_dot2_thu_mua.sql`; `packages/shared/src/rbac/matrix.ts`; `apps/web/src/lib/nav-items.ts` (+ diff commit `53a865c`).
