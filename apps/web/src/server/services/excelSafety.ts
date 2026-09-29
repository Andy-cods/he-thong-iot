/**
 * V4.2 audit S14 — chống CSV/Excel formula injection khi export dữ liệu người
 * dùng nhập (tên NCC, ghi chú, lý do đề xuất...) ra file .xlsx.
 *
 * Chỉ áp dụng cho GIÁ TRỊ CHUỖI (free-text). Số và `Date` object giữ nguyên —
 * không bao giờ đi qua hàm này với kiểu khác string nên không ảnh hưởng công
 * thức thật (`=IF(...)`) hay định dạng ngày/số trong các template.
 *
 * Quy tắc: nếu KÝ TỰ ĐẦU TIÊN của chuỗi là `= + - @` hoặc tab/CR → thêm tiền
 * tố `'` (Excel hiển thị nguyên văn, không còn bị hiểu là công thức khi
 * paste/import sang ngữ cảnh khác). Chỉ xét ký tự đầu — mã có dấu `-` ở giữa
 * (vd "PR-2607-0001") hay số âm dạng chuỗi ("-1234", vốn không nên tồn tại vì
 * số thật luôn được gán kiểu `number`) KHÔNG bị ảnh hưởng trừ khi bản thân ký
 * tự đầu tiên là 1 trong các ký tự trên.
 */
const DANGEROUS_LEADING_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** true nếu chuỗi cần thêm tiền tố chống formula injection. */
export function isDangerousExcelText(value: string): boolean {
  return value.length > 0 && DANGEROUS_LEADING_CHARS.has(value[0]!);
}

/**
 * Sanitize 1 giá trị trước khi gán vào cell Excel. Chỉ biến đổi khi `value`
 * là `string` — number/Date/null/undefined/boolean đi qua nguyên vẹn.
 */
export function sanitizeExcelCellValue<T>(value: T): T {
  if (typeof value !== "string") return value;
  if (!isDangerousExcelText(value)) return value;
  return (`'${value}`) as unknown as T;
}

/** Sanitize từng phần tử của 1 hàng (dùng trước `worksheet.addRow(row)`). */
export function sanitizeExcelRow<T extends readonly unknown[]>(row: T): T {
  return row.map((v) => sanitizeExcelCellValue(v)) as unknown as T;
}
