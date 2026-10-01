# Trạng thái PHIẾU IN / XUẤT FILE (PDF + Excel) — V4.4

Branch worktree: `worktree-agent-a670e9ade8c13319c` (base: `v43/warehouse`)

## Phạm vi đã rà + sửa

### PDF (`@react-pdf/renderer`)

| Phiếu | File | Lỗi tìm thấy | Đã sửa |
|---|---|---|---|
| Đơn đặt hàng (PO) | `server/services/poPdf.tsx` | Ngày dùng `d.getDate()` theo giờ server (không ép +07); Số lượng + tiền dùng chung 1 hàm `toLocaleString` không giới hạn số lẻ → đơn giá/thành tiền ra số dư "2.166,666", tổng tiền ra "125.000.000,5" (nửa đồng); không có số trang; khối Tổng tiền/VAT bị cắt đôi khi bảng vật tư tràn hết trang 1 | Dùng `formatDate`/`formatMoney`/`formatQty` dùng chung (`lib/format.ts`) — tiền làm tròn đồng + dấu chấm nghìn, số lượng tối đa 4 số lẻ bỏ số 0 thừa; thêm "Trang x/y" (chỉ hiện khi ≥2 trang); bọc khối Ghi chú+Tổng tiền `wrap={false}` để không bị cắt ngang trang |
| Đề xuất vật tư NPL (DNVT) | `server/services/dnvtPdf.tsx` | Date/number helpers viết tay cục bộ, không ép giờ VN (lệch ngày nếu server/CI chạy UTC); số lượng không giới hạn số lẻ chuẩn; không có số trang | Thay bằng `formatDate`/`formatDateTime`/`formatQty` dùng chung; thêm "Trang x/y". **Giữ nguyên bố cục mẫu giấy gốc** theo đúng yêu cầu |
| Yêu cầu vật tư (YCVT/MRF) | `server/services/ycvtPdf.tsx` | Tương tự DNVT; thêm: đơn giá/tổng tiền dùng `toLocaleString` thô ra "123.456,789 ₫"-kiểu-sai (dư số lẻ đồng) | Thay bằng `formatDate`/`formatDateTime`/`formatQty`/`formatMoney` dùng chung (tiền làm tròn đồng); thêm "Trang x/y". Giữ nguyên bố cục mẫu giấy gốc |
| Biên bản giao hàng (BBGH) | `server/services/deliveryNotePdf.tsx` | Date/qty helpers viết tay cục bộ (lệch giờ VN tiềm ẩn); **checkbox "Kết luận giao nhận" không hiện dấu X dù đã chọn kết quả** (ô checkbox là `Text` không có `alignItems/justifyContent`, dấu X bị lệch ra ngoài vùng nhìn thấy) — xác nhận bằng cách render thật rồi đọc PDF: cả 3 ô đều trống bất kể `deliveryResult`; không có số trang | Thay date/qty helpers bằng `formatDate`/`formatQty` dùng chung; **sửa checkbox**: đổi sang `View` flex `alignItems/justifyContent: center` chứa `Text` dấu X riêng — render lại xác nhận ô đúng đã hiện dấu X; thêm "Trang x/y" |

Kiểm tra chung cho cả 4 phiếu: dựng file PDF thật với dữ liệu mẫu (tên dài,
tiếng Việt đủ dấu "ư ơ ạ ả ẫ ồ", số có nhiều số lẻ, ngày sát nửa đêm giờ VN,
bảng tràn nhiều trang), đọc từng trang bằng công cụ xem PDF — xác nhận:
- Chữ tiếng Việt hiển thị đúng, không ô vuông (font Roboto bundled đủ glyph).
- Tên vật tư dài tự xuống dòng, không tràn khỏi cột.
- Số căn phải, tiền có dấu chấm nghìn + làm tròn đồng, số lượng tối đa 4 số lẻ.
- "Trang x/y" chỉ hiện khi phiếu thật sự tràn ≥ 2 trang (PO 18 dòng = 2 trang
  do khối chữ ký; PO 45 dòng test riêng = 2 trang gọn, không bị cắt khối tổng).

**Phát hiện thêm (không sửa — nằm ngoài scope định dạng, rủi ro cao):**
Với phiếu YCVT và BBGH, lớp text ẩn trong PDF (dùng để copy/paste, tìm kiếm,
đọc màn hình) bị `@react-pdf/renderer`/fontkit làm sai lệch ký tự ở một số
trang nội dung dài (VD "Kính gửi" → "Kí_h g`i" khi copy ra, dù **hiển thị trực
quan hoàn toàn đúng**). Đây là lỗi đã biết của thư viện khi subset font TTF
với tập ký tự lớn, không liên quan tới code của repo — không sửa trong đợt
này vì cần nâng cấp `@react-pdf/renderer` + kiểm hồi quy toàn bộ, vượt phạm vi
"sửa lỗi định dạng nhỏ". Ghi lại để theo dõi riêng nếu khách phàn nàn về việc
copy nội dung PDF.

### Excel (`exceljs`)

| Xuất | File | Lỗi tìm thấy | Đã sửa |
|---|---|---|---|
| DNVT (1 phiếu + batch) | `server/services/dnvtExportExcel.ts` | Ngày (ngày cần, ngày giao hàng, ngày ký duyệt) ghi bằng **chuỗi** `toLocaleDateString` thay vì ô Date thật → Excel không sort/lọc/so sánh ngày được, lệch kiểu với ô `L3` (vốn đã là Date) | Thêm `setDateCell()` gán Date thật + `numFmt dd/mm/yyyy` cho mọi ô ngày |
| YCVT/MRF (1 phiếu + batch) | `server/services/ycvtExportExcel.ts` | Tương tự DNVT; thêm: ô `O3` (ngày lập) kế thừa `numFmt` **kiểu Mỹ "mm-dd-yy"** từ file mẫu gốc (dễ đọc nhầm ngày/tháng cho người Việt); các ngày duyệt/theo dõi ghi bằng chuỗi | Ép `numFmt dd/mm/yyyy`/`dd/mm/yyyy hh:mm` cho mọi ô ngày — ghi đè định dạng Mỹ gốc |
| **Lỗi dùng chung cả 2 trên + mọi Excel khác có ô ngày**: ExcelJS tính serial ngày trực tiếp từ `Date.getTime()` theo UTC (không biết timezone) — nếu gán thẳng timestamp UTC, phiếu tạo gần nửa đêm giờ VN sẽ **lệch 1 ngày** so với PDF/UI (vốn đã tính đúng +07) | `lib/format.ts` (hàm mới) | — | Thêm `toExcelVnDate()` dịch +7h trước khi gán `cell.value`, dùng thống nhất ở mọi nơi gán Date vào ô Excel bên dưới. Có test riêng xác nhận ca biên 23:30 UTC → đúng ngày VN hôm sau |
| Xuất nhiều PR 1 file (sheet "Tổng hợp" + mỗi phiếu 1 sheet) | `server/services/batchPrTemplateExcel.ts`, `app/api/purchase-requests/export-excel/route.ts` | Cột "Ngày tạo" ở sheet Tổng hợp ghi chuỗi `formatDateTime()` thay vì Date thật | Đổi kiểu `PrSummary.rows` nhận `Date`; route truyền `new Date(...)` trực tiếp; `buildSummarySheet` tự áp `toExcelVnDate` + `numFmt` khi gặp ô kiểu Date |
| Xuất nhiều Yêu cầu vật tư 1 file | `server/services/batchSlipsExcel.ts`, `app/api/material-requests/export-excel/route.ts` | Tương tự — cột "Ngày tạo" (cả sheet Tổng hợp lẫn khối info đầu mỗi sheet chi tiết) là chuỗi | Đổi kiểu nhận `Date`; xoá hàm `formatVNDateTime` không còn dùng (dead code) |
| Phiếu kiểm kê | `server/services/stocktakeExport.ts` | Dòng mô tả lộ **mã trạng thái thô** `Trạng thái: PENDING_APPROVAL` (enum kỹ thuật, không phải người dùng cuối hiểu được); "Chụp tồn lúc" dùng `.toLocaleString("vi-VN")` phụ thuộc giờ hệ điều hành server (không ép +07); hàng tiêu đề không cố định khi cuộn; cột số lượng không numFmt (có thể hiện dư số lẻ thô từ numeric(18,4)) | Map trạng thái sang nhãn tiếng Việt (khớp `StocktakeSessionSheet.tsx`: "Đang đếm"/"Chờ Giám đốc duyệt"/"Đã duyệt"/"Bị trả lại"/"Đã huỷ"); dùng `formatDateTime()` dùng chung; `ws.views` đóng băng hàng 4; `numFmt "#,##0.####"` + căn phải cho 2 cột số lượng |
| Danh sách PO cho kế toán | `app/api/purchase-orders/export/route.ts` | 3 cột ngày (Ngày tạo, Ngày dự kiến/thực tế nhận) ghi bằng chuỗi `formatDate()` thay vì Date thật; cột tên NCC/vật tư/mã PR **không qua `sanitizeExcelCellValue`** → hở formula injection nếu NCC/vật tư có tên bắt đầu bằng `=`/`+`/`-`/`@`; cột SL không có numFmt | Đổi sang `setDateCell()` (Date thật + `toExcelVnDate` + `numFmt dd/mm/yyyy`); bọc `safe()` (`excelSafety.ts`) cho mọi cột chuỗi tự do; thêm `numFmt "#,##0.####"` cho cột SL |
| Vị trí mặc định vật tư | `server/services/defaultBinImport.ts` (`buildDefaultBinExportWorkbook`) | Không đóng băng hàng tiêu đề (danh sách toàn bộ vật tư active có thể dài); 2 cột số lượng không numFmt/căn phải | Thêm `ws.views` đóng băng hàng 1; `numFmt "#,##0.####"` + căn phải cho 2 cột SL |

Kiểm tra: dựng từng workbook với dữ liệu mẫu (ngày sát ranh giới UTC/VN, chuỗi
thử formula injection `=cmd|/c calc`, `=1+1`, `=HACK()`), đọc lại bằng
`exceljs` để in `cell.value`/`numFmt`/`type`/`alignment` — xác nhận:
- Mọi ô ngày đều `type: Date` với `numFmt` đúng kiểu VN (`dd/mm/yyyy` hoặc
  `dd/mm/yyyy hh:mm`), không còn ô ngày dạng chuỗi.
- Chuỗi formula-injection bị `excelSafety.ts` thêm tiền tố `'` (vô hiệu hoá),
  công thức Excel thật (`=IF(...)` trong template YCVT) vẫn giữ nguyên.
- `toExcelVnDate` dịch đúng +7h: timestamp 23:30 UTC 07/09 → cell Date
  `2026-09-08T06:30:00.000Z` (đúng ngày VN 08/09, khớp PDF).

**Không sửa** (ngoài scope "phiếu in"/mẫu xuất nghiệp vụ, không phải lỗi định
dạng): `app/api/admin/audit/export` (nhật ký audit cho admin, cột "Mã đối
tượng" cố ý hiện UUID vì đây là log kỹ thuật, không phải phiếu nghiệp vụ),
`app/api/reports/employee/[userId]/export`, `financeImport.ts`
(`buildFinanceTemplateWorkbook` — mẫu NHẬP liệu cho người dùng tự điền, không
phải phiếu IN kết quả).

## Thay đổi dùng chung (`apps/web/src/lib/format.ts`)

- Thêm `toExcelVnDate(date)`: dịch Date/chuỗi ngày +7h trước khi gán vào ô
  Excel — bắt buộc vì `exceljs` tính serial ngày trực tiếp từ `Date.getTime()`
  theo UTC, không có khái niệm timezone. Có 4 test case mới trong
  `format.test.ts` (ranh giới UTC/VN, chuỗi ngày thuần, giá trị rỗng/không hợp lệ).

## Kiểm chứng

- `pnpm install --frozen-lockfile`: OK.
- `pnpm -r typecheck`: OK (4/4 package: `@iot/db`, `@iot/shared`, `@iot/web`, `@iot/worker`).
- `pnpm --filter @iot/web test`: OK — 46 file / 735 test pass (bao gồm 23 test
  `format.test.ts`, trong đó 7 test mới cho `toExcelVnDate`).
- `pnpm --filter @iot/web build` (với `DATABASE_URL`/`JWT_SECRET`/`SESSION_SECRET`
  tạm cho bước collect page data): build thành công, mọi route export PDF/Excel
  đã sửa đều compile sạch.
- Dựng lại từng phiếu sau khi sửa bằng vitest tạm (đã xoá, không commit) ghi
  file mẫu ra thư mục scratchpad ngoài repo — xem từng trang PDF + in cell
  Excel để đối chiếu trước/sau.

## File đã sửa

PDF: `poPdf.tsx`, `dnvtPdf.tsx`, `ycvtPdf.tsx`, `deliveryNotePdf.tsx`.
Excel: `dnvtExportExcel.ts`, `ycvtExportExcel.ts`, `batchPrTemplateExcel.ts`,
`batchSlipsExcel.ts`, `stocktakeExport.ts`, `defaultBinImport.ts`.
Route (chỉ sửa tham số định dạng truyền vào, không đổi nghiệp vụ):
`api/purchase-orders/export/route.ts`, `api/purchase-requests/export-excel/route.ts`,
`api/material-requests/export-excel/route.ts`.
Dùng chung: `lib/format.ts` (+ `format.test.ts`).
