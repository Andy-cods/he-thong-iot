# V4.1 — Audit toàn hệ & kế hoạch hoàn thiện luồng nghiệp vụ

- **Ngày:** 2026-09-26 (+07)
- **Phương pháp:** 7 agent rà song song, chỉ đọc code. Mọi mục có bằng chứng `file:dòng` trong báo cáo gốc của agent. Các lỗi P0 và vài điểm then chốt đã được **kiểm tra lại tận code / trên VPS** (đánh dấu ✅).
- **Đường dẫn:** tính từ `apps/web/src/` trừ khi ghi khác.
- **Mức:** P0 = chặn nghiệp vụ / mất dữ liệu / sập trang · P1 = sai chức năng · P2 = UX đáng kể · P3 = nhỏ.

---

## 0. Quyết định nghiệp vụ của anh Thang (đầu vào)

| # | Quyết định | Hiện trạng code |
|---|---|---|
| Q1 | Hàng nhận về khi QC còn PENDING phải HOLD, chỉ xuất sau khi QC đạt | ❌ Ngược: PENDING → lô **AVAILABLE**, chỉ NG mới HOLD ✅ (`server/repos/receivingEvents.ts:293-295`). Có 11 đường rò (mục 2). |
| Q2 | Hoàn tất lệnh SX có bước nhập kho thành phẩm, **tạm ẩn** | Backend **chưa có** (không chỗ nào ghi `PROD_IN`). Có 1 dialog nhập "SL thành phẩm / Lot FG" nhưng giá trị bị bỏ qua (`assembly/[woId]/page.tsx:499-590`) → ẩn khối này. |
| Q3 | Giao vật tư theo phiếu yêu cầu phải qua **phiếu xuất kho riêng** | ❌ Giao phiếu yêu cầu **chỉ đổi trạng thái, không trừ tồn, không chứng từ** ✅ (`server/repos/materialRequests.ts:386-434`). Tồn kho trên hệ thống đang **cao hơn thực tế** đúng bằng số đã giao theo phiếu. |
| Q4 | Ẩn Đơn hàng bán, ECO, Thiếu vật tư | ECO + Thiếu vật tư đã ẩn gần hết (còn vài link sót). Đơn hàng bán còn ~9 lối vào. ⚠️ Phải làm liên kết WO↔BOM (SX-16) **trước** khi ẩn. |
| Q5 | Phiên đăng nhập ~4 tiếng | Hiện **15 phút** ✅ (VPS: `JWT_ACCESS_TTL` không đặt → mặc định 900s). Không có refresh, không trượt. |
| Q6 | Xoá trang cũ không dùng | 7 nhóm trang xoá được + ~50 component/API mồ côi (mục 9). |
| Q7 *(bổ sung 26/09)* | Thu/chi có **nguồn thu / nguồn chi** (chi tiền mặt trừ quỹ tiền mặt, chi chi tiêu trừ TK chi tiêu…) | Cơ chế trừ/cộng theo nguồn **đã đúng** (trigger `fin_account_recalc_balance`). Thiếu: loại "TK chi tiêu", nhãn "Nguồn", chuyển quỹ nội bộ, chặn chi vượt số dư (mục 5). |

---

## 1. Lỗi P0 (sửa trước tiên)

| ID | Mô tả | Bằng chứng | |
|---|---|---|---|
| SX-01 | Lệnh SX tạo từ dòng BOM (nút GTAM) → **trang chi tiết văng trắng**: `routingPlan` là object nhưng trang gọi `.reduce/.map` như mảng | `api/work-orders/from-bom-line/[lineId]/route.ts:111-130`; `(app)/work-orders/[id]/page.tsx:181-187` | ✅ |
| AD-01 | User **không phải admin** bị admin reset mật khẩu → **kẹt vòng redirect**, không vào được hệ thống (trang đổi MK bắt buộc nằm dưới `/admin`) | `(app)/layout.tsx:94-124`; `admin/layout.tsx:34` | |
| TC-01 | Form "Ghi nhận thanh toán" lọc hoá đơn **cùng chiều** với thanh toán → "Chi cho NCC" chỉ thấy HĐ bán; muốn trả NCC phải chọn "Thu" → **số dư TĂNG khi trả tiền** | `components/finance/PaymentsTab.tsx:274-361`; `server/repos/finPayments.ts:125-141` | |
| TM-01 | Wizard "Tạo PO từ PR" **không chuyển PR sang CONVERTED** → tạo thêm PO lần 2 từ trang PR được → **PO trùng**; bỏ im lặng dòng nhập tay; không kiểm PR đã duyệt | `components/procurement/PoCreateWizard.tsx:113-175`; `server/repos/purchaseOrders.ts:788-818` | |
| KHO-01 | = Q1 (QC PENDING → AVAILABLE) | xem trên | ✅ |
| KHO-02 | Tiêu hao lắp ráp ghi giao dịch **không có bin** → tồn theo bin không giảm → hàng đã dùng vẫn "trên kệ", **xuất được lần 2** | `server/repos/assemblies.ts:272-281`; `packages/db/migrations/0034_*.sql:67-77` | |
| KHO-03 | Wizard nhận hàng sinh `scanId` mới mỗi lần bấm Gửi → gửi lỗi một phần rồi bấm lại = **nhập kho 2 lần** | `(app)/receiving/[poId]/wizard/page.tsx:303-340` | |
| KHO-04 | = Q3 (giao phiếu yêu cầu không trừ tồn) | xem trên | ✅ |

---

## 2. Kho · Nhận hàng · QC (KHO-xx)

**Các đường rò hàng chưa QC / QC hỏng vẫn ra khỏi kho:** (1) nhận hàng PENDING→AVAILABLE; (2) xuất nhanh không kiểm `lot.status`; (3) duyệt yêu cầu xuất (ISR) không kiểm; (4) giữ chỗ cho lệnh SX ăn luôn lô chờ QC; (5) quét lắp ráp không kiểm, HOLD không nhả giữ chỗ; (6) "Rút hàng"/chỉnh giảm trừ cả lô HOLD; (7) chuyển bin lô HOLD tự do; (8) giao phiếu yêu cầu không qua kho; (9) chuyển snapshot INBOUND_QC→AVAILABLE không cần vai trò QC; (10) tồn "khả dụng" hiển thị tính cả HOLD; (11) planner release được HOLD.

| ID | Mức | Mô tả ngắn | Bằng chứng |
|---|---|---|---|
| KHO-05 | P1 | Xuất nhanh + duyệt ISR không kiểm trạng thái lô (xuất được lô HOLD/CONSUMED/EXPIRED) | `api/warehouse/issue/route.ts:85-103`; `issue-request/[id]/approve/route.ts:136-154` |
| KHO-06 | P1 | Quét lắp ráp không kiểm lô; HOLD không nhả reservation; khoá `scan:` khác namespace `lot:` | `server/repos/assemblies.ts:180-244` |
| KHO-07 | P1 | Nhận vào mã lô đã có → giữ trạng thái cũ (lô CONSUMED nhận thêm thì hàng "biến mất"; NG khoá lây hàng tốt) | `receivingEvents.ts:306-328` — **cần anh chốt** |
| KHO-08 | P1 | Nhận hàng không kiểm trạng thái PO (DRAFT/CANCELLED vẫn nhận, CANCELLED tự thành RECEIVED) | `api/receiving/events/route.ts:105-113` |
| KHO-09 | P1 | Dòng PO tìm theo `(poId,itemId) LIMIT 1` → PO 2 dòng cùng mã: dòng 2 không bao giờ đủ | `events/route.ts:127-136` |
| KHO-10 | P1 | Xuất/chỉnh giảm/chuyển bin bỏ qua hàng đã giữ chỗ cho lệnh SX | `issue/route.ts:88-103`; `bins/[id]/adjust/route.ts:148-175` |
| KHO-11 | P1 | Dialog "Rút hàng" chọn lô nhưng không gửi lô → server trừ nhầm lô lớn nhất | `components/warehouse/BinActions.tsx:611-640` |
| KHO-12 | P1 | HOLD/Release chỉ admin+planner; vai trò **QC không làm được gì**; planner release bỏ qua QC | `api/lot-serial/[id]/hold/route.ts:46`; `packages/shared/src/rbac/matrix.ts` |
| KHO-13 | P1 | Thu mua (purchaser) gọi được API xuất kho/chuyển bin (dùng quyền `transition:po`) | `issue/route.ts:55`; `transfer/route.ts:40` |
| KHO-14 | P1 | Xuất nhanh lý do Bán/Trả NCC không cần Giám đốc duyệt | `issue/route.ts:46-48` |
| KHO-15 | P1 | `inbound_receipt.qc_flag` không bao giờ được cập nhật; không có màn QC nhập | `receivingEvents.ts:268` |
| KHO-16 | P1 | **3 công thức tồn khác nhau** → các trang lệch số | `repos/items.ts:158-216`; `repos/inventory.ts:109-153` |
| KHO-17 | P1 | Chuyển trạng thái phiếu yêu cầu: sửa được dòng phiếu khác; UI không gửi SL → "Đã soạn/Đã giao" luôn 0; race | `materialRequests.ts:411-430` |
| KHO-18 | P2 | Từ chối PO đã nhận một phần → CANCELLED nhưng hàng vẫn trong kho | `api/receiving/[poId]/reject/route.ts:195` |
| KHO-19 | P2 | Chuyển bin/chỉnh giảm ngoài transaction, không khoá → tồn bin âm (nghi ngờ) | `transfer/route.ts:74-107` |
| KHO-20 | P2 | Số ISR = `COUNT+1` → trùng → 500 | `issue-request/route.ts:129-136` |
| KHO-21 | P2 | Báo cáo kho chỉ tính 100 mã đầu; "Tổng qty" cộng lẫn đơn vị | `components/warehouse/ReportTab.tsx:66-86` |
| KHO-22 | P2 | Danh sách PO chờ nhận cố định 50 dòng, KPI sai | `ReceivingMovementView.tsx:390-407` |
| KHO-23 | P2 | Xuất nhanh báo "✓ Đủ tồn" theo tổng có HOLD nhưng FIFO chỉ lấy AVAILABLE → xuất thiếu im lặng | `IssueMovementView.tsx:80-146` |
| KHO-24 | P2 | Cache không đồng bộ sau xuất/nhận → Vật tư, Sơ đồ kho hiện số cũ | `hooks/useReceivingEvents.ts:246-250` |
| KHO-25 | P2 | Danh sách phiếu yêu cầu: lỗi hiện thành rỗng, không lọc trạng thái, nút hiện sai vai trò | `(app)/material-requests/page.tsx` |
| KHO-26 | P2 | Link "Xem tại Lot/Serial" mất `itemId`; `/lot-serial` không có guard | `components/inventory/ItemInventoryPanel.tsx:147` |
| KHO-27 | P2 | Race cùng `scanId` → nhận 2 lần (nghi ngờ) | `events/route.ts:70-102` |
| KHO-28..36 | P3 | Nút Duyệt tính cộng 2 lần; ngày UTC; `lotNo` 128 vs cột 64; nhãn Anh thô; `prompt()` + toast đôi; `pickedBy` bị ghi đè; FIFO không xét HSD; UUID sai → 500; mọi vai trò tạo được ISR | báo cáo gốc |

**Phương án Q1 (QC HOLD):** nhận hàng → mọi lô mới `HOLD (QC_PENDING)`; API QC mới `POST /api/receiving/receipt-lines/[id]/qc {PASS|FAIL}` cho vai trò qc/admin; guard dùng chung `assertIssuable()` (khoá lô + bắt buộc AVAILABLE + trừ giữ chỗ) gọi ở mọi đường xuất; trigger DB chặn cuối cùng; một view tồn chuẩn; tab **"Chờ QC"** trong Nhập/Xuất kho.

**Phương án Q3 (phiếu xuất):** khuyến nghị **Hướng A — bảng mới `goods_issue` + `goods_issue_line`** (số `PX-YYMM-NNNN`), mọi luồng xuất (phiếu yêu cầu, xuất nhanh, ISR khi duyệt, bán, trả NCC) đều sinh phiếu xuất → thống kê một nguồn. Hướng B (rẻ hơn): mở rộng ISR. Panel "Lập phiếu xuất" trong chi tiết phiếu yêu cầu (giao từng phần được), tab "Phiếu xuất kho".

---

## 3. Sản xuất · BOM · Lệnh SX (SX-xx)

> Bối cảnh: có 2 kiểu lệnh SX. Kiểu cũ (từ đơn hàng bán → snapshot) mới có dòng linh kiện, giữ chỗ, lắp ráp được — nhưng **không còn giao diện nào tạo được**. Kiểu mới (LSX / từ dòng BOM) không có dòng linh kiện → lắp ráp không chạy.

| ID | Mức | Mô tả ngắn | Bằng chứng |
|---|---|---|---|
| SX-02 | P1 | Số WO từ dòng BOM = `COUNT+1`, không khoá, giờ UTC → trùng → 500 | `from-bom-line/route.ts:94-100` |
| SX-03 | P1 | WO LSX/từ BOM **không lắp ráp được** nhưng vẫn hiện nút cờ-lê | `repos/assemblies.ts:102-108` |
| SX-04/05 | P1 | Hoàn thành WO 0 dòng qua ngay kể cả SL đạt = 0; transaction vô tác dụng | `repos/workOrders.ts:444-543` |
| SX-06 | P1 | Planner gọi API bắt đầu thẳng từ DRAFT, bỏ qua duyệt; ghi đè giờ duyệt | `workOrders.ts:32,489` |
| SX-07/08 | P1 | Xoá (luôn force) được cả WO đang chạy/đã xong; huỷ WO không nhả giữ chỗ → tồn bị giữ vĩnh viễn | `components/work-orders/WorkOrderActions.tsx:325`; `workOrders.ts:546-622` |
| SX-09 | P1 | Duyệt/từ chối xong trang không cập nhật (sai query key) → bấm lần 2 ra 409 | `WorkOrderActions.tsx:93-113` |
| SX-11 | P1 | "Người lập" trên phiếu LSX (cả bản in) = **người đang xem** | `(app)/work-orders/[id]/page.tsx:189-192` |
| SX-12/13 | P1 | Xoá entry tiến độ không trừ lại SL; báo tiến độ cho WO đã xong/huỷ và cho dòng của WO khác | `repos/woProgressLog.ts:95-149` |
| SX-16 | P1 | Tab BOM "Lệnh SX/Sản xuất/Lắp ráp" lọc qua đơn hàng bán → WO tạo từ chính BOM **không bao giờ hiện**. **Phải sửa trước khi ẩn Đơn hàng bán** | `workOrders.ts:80-83` |
| SX-22 | P1 | Quét lắp ráp trừ kho cho WO DRAFT/PAUSED/COMPLETED; không chặn vượt SL | `assemblies.ts:130-400` |
| SX-25 | P1 | = Q3 | |
| SX-10,14,15,17-21,23,24,26-34 | P2-P3 | Race duyệt/từ chối; good_qty sai nghĩa; form QC/PAUSE vô tác dụng; link WO↔BOM không ai ghi; bấm 2 lần tạo 2 YCSX; tạo LSX không báo Gia công; form LSX mất ĐVT, không kiểm ngày; redirect làm mất dữ liệu điền sẵn; race lắp ráp; 2 đường hoàn tất WO; phiếu yêu cầu không có trong menu, operator không tạo được, mọi vai trò đọc được; KPI chỉ 200 dòng đầu; lọc BOM phía client; lỗi hiện thành rỗng; nhiều bản RELEASED cùng lúc; danh sách WO không có cột Sản phẩm | báo cáo gốc |
| UX-01..08 | P2-P3 | `prompt()/confirm()`; nút chỉ hiện khi rê chuột (không dùng được trên tablet xưởng); lẫn Anh-Việt; DRAFT 2 tên; không sửa được WO; trang lắp ráp chỉ về `/orders` vòng vô nghĩa; chữ 10–11px | báo cáo gốc |

**Q2 — ẩn nhập kho thành phẩm:** thêm cờ `NEXT_PUBLIC_FEATURE_FG_RECEIPT` (theo mẫu `NEXT_PUBLIC_FEATURE_*` có sẵn), bọc 3 ô trong dialog hoàn tất, sửa câu mô tả sai "consume reservation và trừ kho". Điểm móc sau này: `completeWO()` ghi `PROD_IN` trong cùng transaction (enum và mọi truy vấn tồn đã hỗ trợ).

**Q4 — ẩn Đơn hàng bán / ECO / Thiếu vật tư:** cờ `NEXT_PUBLIC_FEATURE_SALES_ORDER`; bỏ tab "Đơn hàng" khỏi `TOP_TAB_KEYS` (như đã làm với ECO/Thiếu vật tư), chip KPI, cột "Đơn hàng", link trong trang lắp ráp, ô Đơn hàng trên dashboard, link ECO sót trong QcChecklist; guard route `/orders`. **Giữ API + DB.** Rủi ro: lắp ráp kiểu cũ chết hẳn; 4 thanh tiến độ dashboard đứng yên (tính từ snapshot) → đổi nhãn/ẩn.

---

## 4. Thu mua PR → PO → Nhận hàng → Công nợ (TM-xx)

| ID | Mức | Mô tả ngắn | Bằng chứng |
|---|---|---|---|
| TM-02 | P1 | Nhận hàng cho PO nháp/huỷ/đóng; UI mở bảng nhận nhanh với PO DRAFT | `repos/receivingEvents.ts:436-460` |
| TM-03 | P1 | Sửa PO nháp **mất liên kết snapshot + quy cách DNVT** khỏi PDF | `procurement/purchase-orders/[id]/page.tsx:155-233`; `purchaseOrders.ts:923-943` |
| TM-04 | P1 | VAT 0% bị biến thành 8% (`\|\| 8`) → không lưu được PO không thuế | `purchase-orders/[id]/page.tsx:231` |
| TM-05 | P1 | PR duyệt cuối xong **Thu mua không được báo** (bộ phận phải tạo PO) | `services/notifications.ts:370-386` |
| TM-06 | P1 | PR từ thiếu hụt kẹt DRAFT mãi (không có nút/hook gửi) | `api/purchase-requests/from-shortage/route.ts` |
| TM-07 | P1 | Gửi duyệt PO không báo admin (người duyệt duy nhất); PO admin tự duyệt không báo Kho | `purchase-orders/[id]/submit-approval/route.ts` |
| TM-08 | P2 | Tạo PO từ PR không khoá → bấm đúp ra 2 bộ PO | `purchaseOrders.ts:523-690` |
| TM-09 | P2 | Đổi được NCC ưu tiên của dòng PR khác; parse lỗi bị nuốt | `purchaseOrders.ts:571-576` |
| TM-10 | P2 | PO từ PR không mang đơn giá dự kiến, dùng `qty` thay `approvedQty`; duyệt được PO 0đ | `purchaseOrders.ts:661-673` |
| TM-11/12 | P2 | Sửa PR sau khi Kho duyệt được; sửa PR làm mất cột "Tham khảo/Ngày giao" | `api/purchase-requests/[id]/route.ts` |
| TM-13 | P2 | API "Hoàn tất/Đã xuất kho" PR cho purchaser đẩy phiếu đang chờ duyệt sang DONE | `[id]/mark-completed/route.ts` |
| TM-14 | P2 | Nhận nhanh không ghi "đã nhận" vào PR → nút "Đã xuất kho/Hoàn tất" không bao giờ hiện | `receiving/events/route.ts:180-194` |
| TM-15/16 | P2 | = KHO-09; duyệt "đủ" theo tổng ≥95% gộp mọi dòng (một dòng nhận 0 vẫn qua); hàng NG vẫn tính đã nhận | `receiving/[poId]/approve/route.ts:75-93` |
| TM-17 | P2 | Không có huỷ PO nháp/đã gửi, không có đóng sớm; không chỗ nào set CLOSED | `purchaseOrders.ts:1100-1135` |
| TM-18 | P2 | Nhận hàng không sinh hoá đơn phải trả; form HĐ không có trường PO → **cần anh quyết** | `repos/finInvoices.ts:72` |
| TM-19 | P2 | Kho sửa được đơn giá PO nháp; người tạo tự duyệt phiếu của mình → **chính sách, cần anh xác nhận** | `rbac/matrix.ts` |
| TM-20 | P2 | Xuất Excel PO ghi tiền dạng chuỗi (không SUM được), in UUID thay mã PR | `api/purchase-orders/export/route.ts` |
| TM-21..26 | P3 | Số phiếu "dự kiến" không ghi rõ + tạo/gửi 2 transaction; thông báo nhiễu bước 1; float `qty*1.1`; ngày UTC; `?from=abc` → 500; khớp cả NCC đã ngưng | báo cáo gốc |
| (Dashboard) | P1-P2 | Thẻ "Đơn hàng đang sản xuất" thực ra đếm dòng vật tư; % Thu mua/Nhận hàng tính từ snapshot đơn hàng → không phản ánh PO thật; tab "Mua sắm" của BOM luôn rỗng; link "PO quá hạn" mất bộ lọc | `components/dashboard/ProgressBarStack.tsx:62`; `(app)/page.tsx:59-100` |

---

## 5. Tài chính (TC-xx) + Nguồn thu / nguồn chi (Q7)

| ID | Mức | Mô tả ngắn | Bằng chứng |
|---|---|---|---|
| TC-02 | P1 | Huỷ giao dịch sinh từ thanh toán ở Sổ thu chi → số dư hoàn lại nhưng hoá đơn vẫn "Đã trả" | `api/finance/transactions/[id]/void/route.ts`; `CashbookTab.tsx:455` |
| TC-03 | P1 | Danh sách NCC gọi `pageSize:200` > giới hạn 100 → 422 → cột "Đối tác" luôn "—" | `components/finance/InvoicesTab.tsx:95`; `packages/shared/src/schemas/supplier.ts:128` |
| TC-04 | P1 | **Import Excel bằng chính file mẫu của hệ thống luôn lỗi** "Thiếu cột" (parser đọc cả sheet hướng dẫn) | `server/services/financeImport.ts:230-247` |
| TC-05 | P1 | Sửa chi tiết giao dịch lần 2 **ghi đè mất** danh mục vừa đổi | `components/finance/TransactionDetailSheet.tsx:96-110` |
| TC-06 | P1 | Thanh toán đã huỷ vẫn hiện bình thường (bảng không có cột trạng thái) | `packages/db/src/schema/finance.ts:194-219` |
| TC-07 | P1 | Công nợ phải thu gom theo `notes` → mọi HĐ tạo từ giao diện rơi vào "(Chưa ghi tên khách hàng)" | `repos/finInvoices.ts:273-284` |
| TC-08 | P1 | Toàn bộ màn tài chính **không báo lỗi**: 409 (vượt nợ, trùng số HĐ) im lặng; huỷ 1 click không xác nhận | `CashbookTab.tsx`, `InvoicesTab.tsx`, `PaymentsTab.tsx` |
| (mới) | P1 | Kế toán không có quyền đọc NCC → không chọn được NCC khi ghi thanh toán/HĐ | `rbac/matrix.ts:198-212` |
| TC-09..19 | P2 | Chọn cùng HĐ 2 dòng → 500; trùng số HĐ đầu ra vô hạn (NULL); gia hạn không tính lại trạng thái quá hạn; **mỗi HĐ chỉ được nhắc quá hạn 1 lần**; lệch ngày UTC ✅; PO không nối công nợ; race huỷ HĐ; chi tiết giao dịch không tìm thấy HĐ; import không ghi lô; import khớp mờ ghi **nhầm tài khoản**; XSS qua link đính kèm | báo cáo gốc |
| TC-20..27 | P3 | Import tái dùng lô cũ; import xong không làm mới; parse số/ngày sai (`1234567.5`, `31/02`); dedupe bỏ 2 khoản hợp lệ giống nhau (và không tính chiều thu/chi); `?overdue=false` thành true; HĐ 0đ không bao giờ PAID; tên file tiếng Việt → 500; MIME tin client | báo cáo gốc |
| (UI) | P2 | `fmtVND` rút gọn "1.5 tr ₫" dùng cả cho ô bảng và tổng tiền (kế toán cần số đủ); trục biểu đồ làm tròn sai; bảng không có dòng tổng, không sticky header, thiếu cột "Còn nợ"; lẫn Anh-Việt trong thông báo lỗi | `components/finance/_format.ts:13-18` |

**Q7 — thiết kế nguồn thu/chi (KISS, 2 migration nhỏ, không sửa trigger):**
1. Thêm loại `EXPENSE` = "Tài khoản chi tiêu" (`0059a`, `ALTER TYPE … ADD VALUE` lặp theo schema như 0055, chạy ngoài transaction).
2. Nhãn động: "Nguồn thu" / "Nguồn chi"; dropdown nhóm theo loại, hiện số dư: `Quỹ tiền mặt · 12.500.000 ₫`; dưới ô hiện "Số dư sau phiếu: Y ₫" (đỏ nếu âm).
3. **Chuyển quỹ nội bộ**: cột `transfer_group_id` (`0059b`), 1 lần chuyển = 1 dòng OUT + 1 dòng IN mã `CQ-…`; **không tính vào báo cáo thu/chi** (lọc ở 3 điểm tổng hợp); huỷ 1 dòng = huỷ cả nhóm.
4. **Chặn chi vượt số dư** ở server (khoá nguồn `FOR UPDATE`, 409 "Nguồn chi X chỉ còn Y ₫"); admin được vượt khi cần. Import Excel chỉ cảnh báo (dữ liệu lịch sử).
5. Import Excel nhận cột "Nguồn" (vẫn nhận "Tài khoản" cho file cũ), chỉ khớp chính xác + nguồn đang hoạt động.

---

## 6. Quản trị · Phiên đăng nhập · Phân quyền (AD-xx)

**Q5 — Khuyến nghị Phương án A: 4 giờ tuyệt đối kể từ đăng nhập.**
- Đặt `JWT_ACCESS_TTL=14400` trong `/opt/hethong-iot/docker-compose.yml` **trên VPS** (CI không chép compose) + đổi mặc định `lib/env.ts:49`. `login/route.ts` không cần sửa (JWT, bản ghi phiên, cookie cùng dùng 1 biến). Kiosk giữ 24h.
- Bắt buộc đi kèm: khoá user / đổi role thì **thu hồi mọi phiên** (AD-04) — TTL dài hơn làm rủi ro này lớn hơn.
- Chống mất dữ liệu: banner "Phiên hết lúc 17:30 — hãy lưu" 10 phút trước; gặp 401 thì **mở hộp đăng nhập lại tại chỗ** thay vì chuyển trang (form giữ nguyên).
- Phương án B (4 giờ không hoạt động, trần 12h) nhiều code và ca biên hơn — chỉ làm nếu A chưa đủ.

| ID | Mức | Mô tả ngắn | Bằng chứng |
|---|---|---|---|
| AD-02 | P1 | Planner/operator/kho/thu mua/QC **đọc và xuất 50.000 dòng nhật ký hệ thống** qua API | `rbac/matrix.ts`; `api/admin/audit/export/route.ts:58` |
| AD-03 | P1 | `/api/admin/stats` lộ username, IP, thiết bị của mọi phiên cho mọi vai trò | `api/admin/stats/route.ts:4-5` |
| AD-04 | P1 | Khoá user/đổi role không thu hồi phiên | `api/admin/users/[id]/route.ts:42-67` |
| AD-05 | P1 | 4 loại thông báo BBGH trỏ `/warehouse/delivery-notes/:id` → **404** (cả trong email) | `services/notifications.ts:1098-1146` |
| AD-06..19 | P2 | Layout không kiểm phiên đã thu hồi; `/board` + `/production-board` thiếu trong matcher (guard không chạy, TV kẹt màn lỗi khi hết phiên); ô "Ghi nhớ đăng nhập" giả; "online 30 phút" sai; nút "Mở audit" ở PO không lọc; bộ lọc audit chỉ 6/37 loại, login/logout không ghi audit; admin tự gỡ quyền admin được; Ctrl+K dùng danh sách vai trò cũ; admin không xem/thu hồi phiên người khác; link kế toán sang trang NCC 403; redirect làm mất dữ liệu điền sẵn; phân quyền riêng từng user không áp cho menu/trang | báo cáo gốc |
| AD-20..24 | P3 | `?next=` chưa lọc (open-redirect); bảng phiên không dọn; API đọc quyền/email của người khác; file `role-guard.ts` chết; **5 file HTML mock thiết kế phục vụ công khai không cần đăng nhập** (`apps/web/public/*.html`) | báo cáo gốc |

---

## 7. Giao diện xuyên suốt (UI-xx)

**Phát hiện nền:** `tailwind.config.ts:364` đặt `sm = 375px` (mặc định 640px) ✅ → nhiều bản vá mobile đợt V3.12.2 viết theo `sm:` **không có tác dụng trên phần lớn điện thoại**.

| ID | Mức | Mô tả ngắn |
|---|---|---|
| UI-01/02/03 | P1 | Modal dán sát mép màn (`sm:w-full`) ✅; popup thông báo tràn mép trái trên iPhone; modal **không có giới hạn chiều cao** → form dài bị cắt, không cuộn được ✅ |
| UI-04 | P1 | **Không có `error.tsx`/`global-error.tsx`/`loading.tsx`** ✅ → mọi lỗi ra màn trắng "Application error" tiếng Anh |
| UI-05 | P1 | ~15 tab coi lỗi API là "chưa có dữ liệu" |
| UI-06 | P1 | Nút mất vòng focus (bàn phím) toàn hệ |
| UI-07/08 | P1 | Mã trạng thái tiếng Anh thô ("PO đã SENT" trong wizard nhận hàng); cùng 1 trạng thái WO có 5 nhãn 3 màu; 37 bảng map trạng thái cục bộ |
| UI-09/10 | P1 | Thanh tab hub không cuộn ngang (tràn ở 390px); wizard nhận hàng 11 cột không có dạng thẻ trên điện thoại |
| UI-11..26 | P2 | 18 khung kẹt cuộn trên mobile; 2 `<main>` lồng nhau; tiền 6 kiểu định dạng ("1.5 tr" dấu chấm dễ đọc nhầm); ngày UTC; ngày tự định dạng "10:05:03 26/9/2026"; KPI chỉ tính 200 dòng đầu; **413 chỗ chữ xám nhạt không đạt độ tương phản**; 634 chỗ chữ 9–11px (quá nhỏ cho xưởng), badge in hoa; ô nhập 13px làm iPhone tự zoom; vùng chạm 28px; nav ngang tràn tablet; **dashboard "cầu vồng" 6 màu + gradient (trái nguyên tắc tiết chế)**; thuật ngữ lệch ("Đề xuất vật tư" vs "Yêu cầu mua", 3 tên hệ thống, kế toán phải vào "Bộ phận Thu mua"); guideline bắt dùng `<PageShell>` nhưng component không tồn tại; 17 chỗ `confirm()` gốc; form dài không cảnh báo rời trang |
| UI-27..33 | P3 | 193 thông báo validate tiếng Anh ("String must contain…"); ~15 nhóm chữ Anh lọt giao diện; Ctrl+K lỗi thời; dark mode theo hệ thống nhưng 26 component thiếu màu tối; 11 nút icon thiếu nhãn; code chết; màn trắng khi tải |

**Chuẩn bảng đề xuất:** hiện có 4 kiểu bảng, **58 bảng viết tay**, 3 kiểu phân trang, không có `ui/table`. Dựng `components/ui/data-table` trên `@tanstack/react-table` (đã cài, chưa dùng) + virtual: cột khai báo `kind` (`qty|money|date|status|code…`) tự canh phải + `tabular-nums` + định dạng + đơn vị; luôn có 3 trạng thái tải/rỗng/lỗi (có "Thử lại"); header dính; mobile tự chuyển dạng thẻ khi ≥5 cột; phân trang + xuất Excel chuẩn. Kèm `lib/status.ts` (nguồn nhãn/màu trạng thái duy nhất), mở rộng `lib/format.ts` (`formatMoney` đủ số, `formatMoneyShort` dấu phẩy, `formatQty+ĐVT`, `toLocalDateInput` giờ VN), `<ConfirmDialog>`, bảng thuật ngữ, zod errorMap tiếng Việt.

---

## 8. Việc cần anh Thang chốt

> **ĐÃ CHỐT 2026-09-26:** D1 = A (4h tuyệt đối kể từ đăng nhập) · D2 = A (bảng phiếu xuất mới `goods_issue`) · D3 = lô cũ coi là đã đạt, chỉ áp HOLD cho hàng nhận từ ngày triển khai · D6 = thêm menu "Yêu cầu vật tư" cho Sản xuất (cả operator) + Kho, gắn với lệnh SX. **Còn chờ:** D4, D5, D7, D8, D9, D10 (không chặn đợt 0).

| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| D1 | Phiên 4h: tuyệt đối (A) hay 4h không hoạt động (B)? | **A** |
| D2 | Phiếu xuất kho: bảng mới (A) hay mở rộng ISR (B)? | **A** |
| D3 | Lô cũ nhận với QC PENDING đang AVAILABLE: chuyển hết sang HOLD hay coi là đã đạt? | Coi là đã đạt (tránh tắc xưởng), chỉ áp HOLD cho hàng nhận từ nay |
| D4 | Tồn kho bị thừa do phiếu yêu cầu đã giao chưa từng trừ: kiểm kê hay điều chỉnh? | Kiểm kê thực tế rồi điều chỉnh có chứng từ |
| D5 | Nhận hàng trùng mã lô: tách lô theo từng lần nhận hay chặn trùng? (KHO-07) | Tách lô theo từng lần nhận |
| D6 | Module "Yêu cầu vật tư" (`/material-requests`) không có trong menu: thêm menu hay gộp vào Kho? | Thêm menu cho Sản xuất + Kho (đây chính là đầu vào của Q3) |
| D7 | Nhận đủ PO có tự sinh hoá đơn phải trả (nháp) không? (TM-18) | Tối thiểu: nút "Tạo HĐ mua từ PO" điền sẵn |
| D8 | Cho người tạo tự duyệt phiếu của chính mình? Kho được sửa đơn giá PO? (TM-19) | Không / Không (trừ admin) |
| D9 | Có thêm loại nguồn "Khác" ngoài Ngân hàng / Tiền mặt / TK chi tiêu? | Chưa (YAGNI) |
| D10 | Module Lắp ráp kiểu cũ (cần đơn hàng bán) — ẩn luôn cùng Đơn hàng bán? | Ẩn, làm lại sau nếu cần |

---

## 9. Trang & code cũ (Q6)

**Xoá được:** `/import` (trang trung gian 2 link) · `/orders/new` · `/bom/[id]/tree` (+4 component chỉ nó dùng) · 7 trang redirect `/bom/[id]/{eco,shortage,assembly,history,orders,procurement,work-orders}` · `/work-orders/quick-new` · `/procurement/purchase-requests/new` · `/receiving` (giữ `/receiving/[poId]`).

**Không được xoá dù không có trong menu:** `/material-requests*` (đích của thông báo — xem D6), `/lot-serial/[id]` (truy vết lô), `/work-orders/new` (còn 3 link trỏ tới — đổi link trước).

**Code mồ côi (0 import):** nhóm Dashboard V1 (API `dashboard/overview` + hook + mocks + 8 component), BOM workspace cũ (BottomPanel, Eco/Shortage/Snapshot panel…), `layout/Sidebar.tsx`, `warehouse/{LotSerialTab,OverviewTab}.tsx`, `procurement/{POForm,PRForm,ConvertPRDialog,PRLineEditor}.tsx`, `eco/*`, `shortage/*`, `orders/{OrderListTable,OrderFilterBar}`, `work-orders/{QcChecklistEnriched,MaterialRequirementsTable,RoutingPlanEditor}`, `qc/QcChecklist`, `receiving/EtaProgressBar`, `lib/{role-guard,cn,dashboard-mocks,date-folders}.ts`, API `product-lines/**`, `purchase-requests/[id]/approve` (410), `work-orders/quick`, `work-orders/[id]/source-bom`, 5 file HTML mock trong `public/`.
**Nên dùng lại thay vì xoá:** `sessions.ts` `listAllActiveSessions`, `touchSessionLastSeen`; `RoutingPlanEditor`/`MaterialRequirementsTable` (gắn vào nút "Sửa phiếu" WO nháp).

**Hai task đang dở trong `codexdo.md`:** TASK-20260717-005 (mobile) — còn lỗi gốc `sm=375` chưa xử lý; TASK-20260427-025 (sidebar) — thực tế ~90% xong, nên đóng và tách phần còn lại.

---

## 10. Lộ trình sửa đề xuất

| Đợt | Nội dung | Phụ thuộc quyết định |
|---|---|---|
| **0 — Chặn cháy** | SX-01, AD-01, TC-01, TM-01+TM-08, KHO-03, `error.tsx`/`global-error.tsx`/`loading.tsx`, **phiên 4h** (Q5) + AD-04, UI-01/02/03/06, AD-05 | D1 |
| **1 — Kho: QC HOLD + phiếu xuất** | Q1, Q3, KHO-01/02/04..17, SX-25, D6 menu Yêu cầu vật tư | D2, D3, D4, D5, D6 |
| **2 — Thu mua** | TM-02..20, dashboard % thu mua | D7, D8 |
| **3 — Tài chính + nguồn thu/chi** | Q7, TC-02..27 | D9 |
| **4 — Sản xuất + ẩn tính năng** | SX-02..34, SX-16 → rồi Q2, Q4 | D10 |
| **5 — Quản trị/RBAC** | AD-02..24 | — |
| **6 — Chuẩn giao diện** | `sm` breakpoint, `lib/status.ts`, `lib/format.ts`, `ui/data-table`, `ConfirmDialog`, tiếng Việt, mobile, tiết chế dashboard | — |
| **7 — Dọn dẹp** | Q6 xoá trang + code mồ côi | — |

Mỗi đợt: sửa → `pnpm build` + vitest local → push `main` (CI build) → kiểm tra E2E thật (đăng nhập + thao tác) trên mes.songchau.vn → cập nhật `codexdo.md` + `PROGRESS.md`.
