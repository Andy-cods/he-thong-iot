# Kế hoạch cải tiến lõi BOM — "Mặt phẳng làm việc Song Châu"

> Phiên bản: V1.5 — Paradigm Shift
> Ngày lập kế hoạch: 2026-04-20
> Người duyệt: anh Hoạt (chủ xưởng Song Châu)
> Kỹ sư thực thi: Thắng (tienthangpt12@gmail.com)

---

## 1. Tầm nhìn (3 dòng cho anh Hoạt)

Hệ thống sẽ **không còn là "cái kho lưu Excel online"** nữa. Nó trở thành **bàn làm việc chính** của xưởng Song Châu, nơi anh và anh em thợ nhìn vào **cùng một cái BOM sống** để biết "linh kiện nào đã mua, đã về, đã gia công, đã giao" — không cần hỏi qua Zalo, không cần mở 7 file Excel.

BOM (mã Z) là trung tâm. Excel chỉ còn là **cái cửa đi vào** (import dữ liệu cũ) và **cái cửa đi ra** (xuất báo cáo). Tất cả thao tác chính đều làm trên Grid trông y hệt Excel — bấm vào, kéo, copy, paste, tô màu — nhưng **tự động cập nhật trạng thái** khi kho nhận hàng, thợ làm xong, xe giao hàng.

Mục tiêu cuối: anh Hoạt không còn phải **gõ tay cột "đã nhận đủ 13/4"** vào Excel nữa — hệ thống tự sinh.

---

## 2. Năm trụ cột

| # | Tên trụ cột | Giá trị anh nhận được | Thời gian |
|---|---|---|---|
| 1 | **Nền schema Product Line** | Nhóm được các mã Z thành "dòng sản phẩm" (vd: Băng tải DIPPI có 5 mã Z con). Biết tổng tiến độ cả dòng. | 1 ngày |
| 2 | **BOM Grid kiểu Excel (Univer)** | Mở 1 mã Z → thấy 1 bảng tính giống Excel y hệt: merge cell, tô màu theo trạng thái, công thức SUM/IF, copy sang Excel thật vẫn giữ format, có nút Hoàn tác. | 5 ngày |
| 3 | **Workspace Dòng sản phẩm** | Trang `/product-lines/[id]` — mở 1 dòng SP → thấy tất cả mã Z, đơn hàng, PR/PO, WO, giao hàng trong **1 màn hình duy nhất**. Drill-down xuống từng linh kiện. | 3 ngày |
| 4 | **Nhật ký + Hoàn tác theo người** | Mọi thao tác sửa ô đều được ghi lại: "Anh Hoạt đã sửa R01.Quantity từ 6 thành 8 lúc 14:22 ngày 20/04/2026". Ctrl+Z hoàn tác 30 bước gần nhất. | 2 ngày |
| 5 | **Phá silo — Status tự sinh** | Cột "Trạng thái" không còn gõ tay. Kho quét mã nhận hàng → ô tự chuyển xanh. Thợ kết thúc WO → ô tự chuyển "Đã sản xuất". | 4 ngày |
| — | Buffer + fix phát sinh + training | — | 2 ngày |
| **Tổng** | | | **17 ngày làm việc (~3.5 tuần)** |

---

## 3. Roadmap gantt-style (15 ngày làm việc + 2 ngày buffer)

```
Tuần 1 (5 ngày)      Tuần 2 (5 ngày)      Tuần 3 (5 ngày)      Tuần 4 (2 ngày)
=================    =================    =================    ========
[T1] Schema          [T2] Univer (tiếp)  [T3] Workspace (tiếp)[T5] Status sync
[T2] Univer POC      [T2] Univer i18n     [T4] Activity log    [T5] Cross-module
[T2] Univer layout   [T2] Univer format   [T4] Undo IndexedDB  [Buffer + train]
[T2] Univer save     [T3] Workspace       [T5] Status sync     [Deploy V1.5]
```

| Ngày | Trụ cột | Việc chính | Deliverable |
|---|---|---|---|
| D1 | T1 | DDL + migration product_line + activity_log | `packages/db/migrations/00XX_*.sql` chạy thành công local |
| D2-D3 | T2 | POC Univer render 1 BOM mẫu | `/playground/univer` mở được, 100 dòng render |
| D4-D5 | T2 | Column spec, conditional format, persist | Grid save/load được jsonb snapshot |
| D6 | T2 | Toolbar i18n tiếng Việt + formula whitelist | 50 key vi-VN dịch xong |
| D7 | T2 | Test 10 thao tác Excel (merge/paste/export) | Checklist pass 10/10 |
| D8-D9 | T3 | Route + layout Product Line Workspace | `/product-lines/[id]` có 6 tab |
| D10 | T3 | Drill-down drawer linh kiện | Click linh kiện → mở drawer phải |
| D11 | T4 | Activity log server + viewer tab | Tab "Lịch sử" hiển thị 20 sự kiện gần nhất |
| D12 | T4 | Undo IndexedDB 30 bước | Ctrl+Z revert được + PATCH server |
| D13-D14 | T5 | Event hook PO/WO/Receiving → derived_status | Nhận hàng xong → ô xanh trong <3s |
| D15 | T5 | Drawer cross-module (PR/PO/WO/Receiving) | Click linh kiện thấy 4 section |
| D16 | Buffer | Fix bug phát sinh | — |
| D17 | Train | Training 1 buổi anh Hoạt + 1 thợ | Cả 2 làm được 5 thao tác demo |

---

## 4. Rủi ro chính

| Rủi ro | Xác suất | Tác động | Cách giảm nhẹ |
|---|---|---|---|
| **Univer bundle 500KB làm trang chậm** | Trung bình | Trung bình | Dynamic import CHỈ route `/bom/[code]`, preload sau login 2s. Fallback table HTML cũ nếu flag `bomGridV2=off`. |
| **Copy/paste từ Excel vào Grid không giữ format** | Thấp | Cao | POC ngày 2-3 test ngay. Nếu fail → dùng plugin `@univerjs/sheets-clipboard-pro` (miễn phí Apache 2.0). |
| **Derived status sai logic (ô chuyển "received" khi chưa nhận đủ)** | Trung bình | Cao | State machine có test case rõ. Tooltip hiển thị "Tự sinh từ PO #123 nhận 15/4" để thợ kiểm chứng. Nút "Override" dành cho admin. |
| **Anh Hoạt không quen workflow mới** | Cao | Thấp | Feature flag bật dần: admin trước 3 ngày, rồi mới bật cho tất cả. Training 1 buổi + video màn hình 10 phút. |
| **IndexedDB hỏng → mất 30 bước undo** | Thấp | Thấp | Activity log server-side là nguồn sự thật. IndexedDB chỉ là cache local, reset khi logout. |

---

## 5. Kết quả mong đợi sau khi release

- Anh Hoạt mở https://mes.songchau.vn/product-lines → thấy 3-5 dòng SP đang chạy, mỗi dòng kèm % tiến độ tổng.
- Click 1 dòng → thấy danh sách mã Z, click 1 mã Z → mở Grid giống Excel.
- Quét mã nhận hàng ở kho → trong <3 giây, ô tương ứng trong Grid chuyển xanh lá.
- Thợ sửa nhầm → bấm Ctrl+Z → khôi phục. Nhật ký ghi lại ai sửa gì lúc nào.
- Xuất báo cáo .xlsx giữ nguyên format Excel cho khách hàng/kế toán.

---

## 6. Điều **không** làm (YAGNI)

- Không build formula engine riêng (dùng Univer built-in).
- Không làm real-time multi-user edit (1 người edit/lúc V1.5, OT để V2).
- Không hỗ trợ BOM lồng >5 cấp (DB schema đã chặn 5 cấp).
- Không remove bảng HTML cũ tuần 1 — giữ làm fallback, gỡ V1.6 nếu ổn.

---

## 7. Nút bấm cuối

- [ ] **OK — bắt đầu ngày 21/04/2026** (anh Hoạt xác nhận → Thắng khởi công)
- [ ] **Cần chỉnh** — sửa phần nào? (ghi chú cuối file)

---

## 8. Danh sách file plan chi tiết

| File | Nội dung | Estimate |
|---|---|---|
| [`01-schema.md`](./01-schema.md) | Trụ cột 1 — DDL + migration product_line, activity_log, alias | 1 ngày |
| [`02-bom-grid-univer.md`](./02-bom-grid-univer.md) | Trụ cột 2 — POC Univer + column spec + i18n + test | 5 ngày |
| [`03-product-line-workspace.md`](./03-product-line-workspace.md) | Trụ cột 3 — Route + layout + drill-down | 3 ngày |
| [`04-activity-log-undo.md`](./04-activity-log-undo.md) | Trụ cột 4 — Activity log server + undo IndexedDB | 2 ngày |
| [`05-cross-module-glue.md`](./05-cross-module-glue.md) | Trụ cột 5 — Event-driven derived_status | 4 ngày |
| [`06-deployment.md`](./06-deployment.md) | Bundle, migration order, feature flag, rollback | 0.5 ngày |
| [`CHANGELOG.md`](./CHANGELOG.md) | Breaking changes + nav-items update | — |

---

**Ghi chú riêng cho anh Hoạt:** mỗi file plan đều có section "Rủi ro" + "Cách test" — anh mở xem được, nhưng phần kỹ thuật thì Thắng lo. Anh chỉ cần duyệt `README.md` này và trả lời 3 câu hỏi cuối trong phần **"Cần anh Hoạt xác nhận"** (xem response cuối).
