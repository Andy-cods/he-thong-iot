/**
 * V1.5 Trụ cột 2 POC — BOM mẫu Z0000002-502653 (BANG TAI DIPPI).
 *
 * Dữ liệu trích từ file Excel thực tế:
 * `docs/samples/20260324_ Z0000002-502653..._ BOM trien khai_sl 02 + 02.xlsx`
 *
 * Update 2026-04-20: thêm depth + kind (Gia công/Thương mại) + scrapPercent.
 * Cấu trúc 2 cấp nested để demo row banding + outline group.
 */

/** Loại linh kiện: fab = Gia công, com = Thương mại (mua ngoài). */
export type BomItemKind = "fab" | "com" | "group";

/** Icon + text cho cột "Loại". */
export const KIND_LABEL: Record<BomItemKind, { icon: string; text: string }> = {
  fab: { icon: "🔧", text: "Gia công" },
  com: { icon: "🛒", text: "Thương mại" },
  group: { icon: "📁", text: "Cụm lắp" },
};

export interface BomSampleRow {
  id: string; // R01, R02… hoặc "GR_FRAME" cho group
  /** 1 = cụm lắp (group header), 2 = linh kiện thuộc cụm. */
  depth: 1 | 2;
  /** fab = Gia công (trong xưởng), com = Thương mại (mua ngoài), group = header cụm. */
  kind: BomItemKind;
  /** Tên dài / mô tả. */
  name: string;
  /** Mã tiêu chuẩn (VD C1609-24-P-00154). Group rows bỏ trống. */
  standardNumber: string;
  /** Nhóm / vật liệu (VD SUS304, AL6061 anode đen). */
  category: string;
  /** Mã/tên NCC viết tắt (VD GTAM, MI, VB). */
  supplier: string;
  /** Số lượng cho 1 bộ parent (cột "Quantity" Excel). */
  quantity: number;
  /** Kích thước lộ ra (VD "601.0 x 21.0 x 20.0"). */
  visiblePartSize: string;
  /** Hao hụt % (0-100). Thêm cho phép edit inline. */
  scrapPercent: number;
  /** Ghi chú tự do. Cột này SẼ bị thay thế bởi derived_status ở Trụ cột 5. */
  note: string;
}

export const Z502653_PARENT_NAME = "Z0000002-502653_BANG TAI DIPPI";
export const Z502653_PARENT_QTY = 2;

/** Dữ liệu demo 2 cụm lắp ráp + 18 linh kiện (gom từ Excel thực tế). */
export const Z502653_ROWS: BomSampleRow[] = [
  // ───── Cụm 1: Khung + cố định ─────
  { id: "GR_FRAME", depth: 1, kind: "group", name: "Cụm khung + cố định", standardNumber: "", category: "", supplier: "", quantity: 1, visiblePartSize: "", scrapPercent: 0, note: "6 linh kiện" },
  { id: "R01", depth: 2, kind: "com", name: "Chốt cài KES6-20", standardNumber: "KES6-20", category: "Chốt cài", supplier: "Chốt cài", quantity: 6, visiblePartSize: "20.0 x 6.0 x 6.0", scrapPercent: 0, note: "đã tồn kho sẵn" },
  { id: "R02", depth: 2, kind: "com", name: "Phanh trục STWN20", standardNumber: "STWN20", category: "Phanh trục", supplier: "Phanh trục", quantity: 12, visiblePartSize: "2.0 x 26.0 x 24.0", scrapPercent: 0, note: "đã tồn kho sẵn" },
  { id: "R03", depth: 2, kind: "fab", name: "Tấm chống thanh trượt dài", standardNumber: "C1609-24-P-00154", category: "SUS304 điện hóa", supplier: "PG", quantity: 1, visiblePartSize: "601.0 x 21.0 x 20.0", scrapPercent: 3, note: "đã yc gửi data" },
  { id: "R04", depth: 2, kind: "fab", name: "Tấm chống thanh trượt ngắn", standardNumber: "C1609-24-P-00395", category: "SUS304 điện hóa", supplier: "PG", quantity: 1, visiblePartSize: "570.0 x 21.0 x 20.0", scrapPercent: 3, note: "đã yc gửi data" },
  { id: "R05", depth: 2, kind: "fab", name: "Thanh dẫn SUS304", standardNumber: "C1609-24-P-00393", category: "SUS304", supplier: "Vitech", quantity: 3, visiblePartSize: "750.0 x 5.0 x 20.0", scrapPercent: 5, note: "có thể lv với NCC" },
  { id: "R06", depth: 2, kind: "fab", name: "Thanh Acetal đen", standardNumber: "C1609-24-P-00394", category: "Acetal black", supplier: "GTAM", quantity: 3, visiblePartSize: "750.0 x 15.0 x 20.0", scrapPercent: 5, note: "" },
  // ───── Cụm 2: Dẫn động ─────
  { id: "GR_DRIVE", depth: 1, kind: "group", name: "Cụm dẫn động + bearing", standardNumber: "", category: "", supplier: "", quantity: 1, visiblePartSize: "", scrapPercent: 0, note: "12 linh kiện" },
  { id: "R07", depth: 2, kind: "com", name: "Vòng bi B6203ZZ", standardNumber: "B6203ZZ", category: "Vòng bi", supplier: "VB", quantity: 8, visiblePartSize: "12.0 x 40.0 x 40.0", scrapPercent: 0, note: "hàng đã về 27/3" },
  { id: "R08", depth: 2, kind: "fab", name: "Tấm đế AL6061", standardNumber: "C1609-24-P-00381", category: "AL6061 anode đen", supplier: "GTAM", quantity: 4, visiblePartSize: "60.0 x 10.0 x 30.0", scrapPercent: 3, note: "đang gia công" },
  { id: "R09", depth: 2, kind: "fab", name: "Chân đỡ AL6061 lớn", standardNumber: "C1609-24-P-00387", category: "AL6061 anode đen", supplier: "GTAM", quantity: 1, visiblePartSize: "30.0 x 152.0 x 60.0", scrapPercent: 3, note: "đang gia công" },
  { id: "R10", depth: 2, kind: "fab", name: "Ke góc AL nhỏ", standardNumber: "C1609-24-P-00380", category: "AL6061 anode đen", supplier: "GTAM", quantity: 2, visiblePartSize: "13.0 x 10.0 x 28.0", scrapPercent: 3, note: "đang gia công" },
  { id: "R11", depth: 2, kind: "fab", name: "Khối đỡ motor", standardNumber: "C1609-24-P-00376", category: "AL6061 anode đen", supplier: "GTAM", quantity: 2, visiblePartSize: "30.0 x 60.0 x 60.0", scrapPercent: 3, note: "đang gia công" },
  { id: "R12", depth: 2, kind: "com", name: "Nhôm định hình 60x30", standardNumber: "C1609-24-P-00373", category: "Nhôm định hình", supplier: "AL Profile", quantity: 2, visiblePartSize: "31.0 x 61.0 x 629.0", scrapPercent: 2, note: "đã chốt, hẹn giao 3/4" },
  { id: "R13", depth: 2, kind: "fab", name: "Chân đỡ AL6061 lớn (đối xứng)", standardNumber: "C1609-24-P-00386", category: "AL6061 anode đen", supplier: "GTAM", quantity: 1, visiblePartSize: "30.0 x 152.0 x 60.0", scrapPercent: 3, note: "" },
  { id: "R14", depth: 2, kind: "fab", name: "Ke góc AL nhỏ (đối xứng)", standardNumber: "C1609-24-P-00379", category: "AL6061 anode đen", supplier: "GTAM", quantity: 2, visiblePartSize: "13.0 x 10.0 x 28.0", scrapPercent: 3, note: "" },
  { id: "R15", depth: 2, kind: "fab", name: "Tấm đỡ trục 1", standardNumber: "C1609-24-P-00378", category: "AL6061 anode đen", supplier: "GTAM", quantity: 1, visiblePartSize: "30.0 x 95.0 x 60.0", scrapPercent: 3, note: "" },
  { id: "R16", depth: 2, kind: "fab", name: "Tấm đỡ trục 2", standardNumber: "C1609-24-P-00377", category: "AL6061 anode đen", supplier: "GTAM", quantity: 1, visiblePartSize: "30.0 x 95.0 x 60.0", scrapPercent: 3, note: "" },
  { id: "R17", depth: 2, kind: "com", name: "Dây đai HTBN1800S5M-150", standardNumber: "HTBN1800S5M-150", category: "Dây đai", supplier: "MI", quantity: 3, visiblePartSize: "873.0 x 53.0 x 15.0", scrapPercent: 0, note: "đã nhận hàng 27/3" },
  { id: "R18", depth: 2, kind: "fab", name: "Khối chặn AL6061", standardNumber: "C1609-24-P-00436", category: "AL6061 anode đen", supplier: "GTAM", quantity: 2, visiblePartSize: "30.0 x 110.0 x 49.0", scrapPercent: 3, note: "" },
];

/**
 * Thứ tự cột chuẩn BOM Grid (11 cột).
 * Freeze ở cột "Mã linh kiện" (index 1) khi scroll ngang.
 */
export const BOM_COLUMN_HEADERS = [
  "Ảnh",             // 0
  "Mã linh kiện",    // 1 ← FREEZE từ đây
  "Tên / Mô tả",     // 2
  "Loại",            // 3 ← 🔧 Gia công / 🛒 Thương mại
  "Vật liệu / Nhóm", // 4
  "NCC",             // 5
  "SL/bộ",           // 6
  "Kích thước (mm)", // 7
  "Tổng SL",         // 8 ← formula
  "Hao hụt %",       // 9 ← editable, format percent
  "Ghi chú",         // 10
] as const;
