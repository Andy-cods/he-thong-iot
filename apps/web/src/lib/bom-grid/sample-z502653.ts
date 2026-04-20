/**
 * V1.5 Trụ cột 2 POC — BOM mẫu Z0000002-502653 (BANG TAI DIPPI).
 *
 * Dữ liệu trích từ file Excel thực tế:
 * `docs/samples/20260324_ Z0000002-502653..._ BOM trien khai_sl 02 + 02.xlsx`
 *
 * Dùng cho /playground/univer để demo UI giống Excel. Sau khi POC pass, thay
 * bằng snapshot từ DB (`bom_template.univer_snapshot`).
 */

export interface BomSampleRow {
  id: string; // R01, R02…
  quantity: number;
  standardNumber: string;
  subCategory: string;
  supplier: string;
  visiblePartSize: string;
  totalQty: number;
  note: string;
}

export const Z502653_PARENT_NAME = "Z0000002-502653_BANG TAI DIPPI";
export const Z502653_PARENT_QTY = 2;

export const Z502653_ROWS: BomSampleRow[] = [
  { id: "R01", quantity: 6, standardNumber: "KES6-20", subCategory: "Chốt cài", supplier: "Chốt cài", visiblePartSize: "20.0 x 6.0 x 6.0", totalQty: 12, note: "đã tồn kho sẵn" },
  { id: "R02", quantity: 12, standardNumber: "STWN20", subCategory: "Phanh trục", supplier: "Phanh trục", visiblePartSize: "2.0 x 26.0 x 24.0", totalQty: 24, note: "đã tồn kho sẵn" },
  { id: "R03", quantity: 1, standardNumber: "C1609-24-P-00154", subCategory: "SUS304", supplier: "PG", visiblePartSize: "601.0 x 21.0 x 20.0", totalQty: 2, note: "đã yc gửi data/ có thể lv với NCC" },
  { id: "R04", quantity: 1, standardNumber: "C1609-24-P-00395", subCategory: "SUS304", supplier: "PG", visiblePartSize: "570.0 x 21.0 x 20.0", totalQty: 2, note: "đã yc gửi data/ có thể lv với NCC" },
  { id: "R05", quantity: 3, standardNumber: "C1609-24-P-00393", subCategory: "SUS304", supplier: "Vitech", visiblePartSize: "750.0 x 5.0 x 20.0", totalQty: 6, note: "đã yc gửi data/ có thể lv với NCC" },
  { id: "R06", quantity: 3, standardNumber: "C1609-24-P-00394", subCategory: "Acetal black", supplier: "GTAM", visiblePartSize: "750.0 x 15.0 x 20.0", totalQty: 6, note: "" },
  { id: "R07", quantity: 8, standardNumber: "B6203ZZ", subCategory: "Vòng bi B6203ZZ", supplier: "VB", visiblePartSize: "12.0 x 40.0 x 40.0", totalQty: 16, note: "hàng đã về 27/3" },
  { id: "R08", quantity: 4, standardNumber: "C1609-24-P-00381", subCategory: "SUS304 → đổi AL6061", supplier: "GTAM", visiblePartSize: "60.0 x 10.0 x 30.0", totalQty: 8, note: "đang gia công" },
  { id: "R09", quantity: 1, standardNumber: "C1609-24-P-00387", subCategory: "AL6061 màu xám bạc", supplier: "GTAM", visiblePartSize: "30.0 x 152.0 x 60.0", totalQty: 2, note: "đang gia công" },
  { id: "R10", quantity: 2, standardNumber: "C1609-24-P-00380", subCategory: "AL6061 màu xám bạc", supplier: "GTAM", visiblePartSize: "13.0 x 10.0 x 28.0", totalQty: 4, note: "đang gia công" },
  { id: "R11", quantity: 2, standardNumber: "C1609-24-P-00376", subCategory: "AL6061 màu xám bạc", supplier: "GTAM", visiblePartSize: "30.0 x 60.0 x 60.0", totalQty: 4, note: "đang gia công" },
  { id: "R12", quantity: 2, standardNumber: "C1609-24-P-00373", subCategory: "Nhôm định hình 60x30mm", supplier: "AL Profile", visiblePartSize: "31.0 x 61.0 x 629.0", totalQty: 4, note: "đã chốt, hẹn giao trước 3/4" },
  { id: "R13", quantity: 1, standardNumber: "C1609-24-P-00386", subCategory: "AL6061 màu xám bạc", supplier: "GTAM", visiblePartSize: "30.0 x 152.0 x 60.0", totalQty: 2, note: "" },
  { id: "R14", quantity: 2, standardNumber: "C1609-24-P-00379", subCategory: "AL6061 màu xám bạc", supplier: "GTAM", visiblePartSize: "13.0 x 10.0 x 28.0", totalQty: 4, note: "" },
  { id: "R15", quantity: 1, standardNumber: "C1609-24-P-00378", subCategory: "AL6061 màu xám bạc", supplier: "GTAM", visiblePartSize: "30.0 x 95.0 x 60.0", totalQty: 2, note: "" },
  { id: "R16", quantity: 1, standardNumber: "C1609-24-P-00377", subCategory: "AL6061 màu xám bạc", supplier: "GTAM", visiblePartSize: "30.0 x 95.0 x 60.0", totalQty: 2, note: "" },
  { id: "R17", quantity: 3, standardNumber: "HTBN1800S5M-150", subCategory: "Dây đai", supplier: "MI", visiblePartSize: "873.0 x 53.0 x 15.0", totalQty: 6, note: "ducpt đã nhận hàng 27/3" },
  { id: "R18", quantity: 2, standardNumber: "C1609-24-P-00436", subCategory: "SUS304 → đổi AL6061", supplier: "GTAM", visiblePartSize: "30.0 x 110.0 x 49.0", totalQty: 4, note: "" },
];

/**
 * Cột chuẩn Excel Song Châu (khớp 3 file mẫu đã inspect).
 * Thứ tự: [0] Image ẩn | [1] ID | [2] SL/bộ | [3] Mã tiêu chuẩn |
 *        [4] Nhóm | [5] NCC | [6] Kích thước | [7] Tổng SL | [8] Ghi chú.
 */
export const BOM_COLUMN_HEADERS = [
  "Ảnh",
  "Mã linh kiện",
  "SL/bộ",
  "Mã tiêu chuẩn",
  "Nhóm / Vật liệu",
  "NCC",
  "Kích thước (mm)",
  "Tổng SL",
  "Ghi chú",
] as const;
