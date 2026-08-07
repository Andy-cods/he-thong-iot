/**
 * V3.16 — Sinh nhãn hiển thị ngắn gọn cho 1 phiếu (PR/MR) từ dòng vật tư đầu
 * tiên. Dùng cho tiêu đề hiển thị trong danh sách / tên sheet Excel / tên
 * file khi phiếu chưa có `title` thủ công. KHÔNG dùng cho số hiệu văn bản
 * chính thức (paperFormNo/code) — các giá trị đó giữ nguyên, không qua hàm này.
 */

export interface DisplayLabelLine {
  name: string | null;
  sku?: string | null;
}

/** Trả về khi phiếu chưa có dòng vật tư nào (hoặc dòng đầu thiếu tên) — caller
 * có thể so sánh với hằng số này để tự quyết fallback riêng (vd dùng paperFormNo). */
export const NO_LINE_LABEL = "Chưa có vật tư";

/**
 * Lấy `name` của dòng ĐẦU TIÊN trong `lines` (đúng thứ tự truyền vào, không
 * tự sort lại) làm gốc, prefix `[sku]` nếu dòng có sku không rỗng, thêm hậu
 * tố ` +N` khi có nhiều hơn 1 dòng (N = số dòng còn lại). Phần tên (kèm
 * prefix sku nếu có) bị cắt theo `maxLen` ký tự kèm "…" nếu quá dài; hậu tố
 * "+N" luôn được giữ nguyên vẹn — cắt phần tên trước, ghép hậu tố sau.
 *
 * `totalCountOverride` — dùng khi caller CHỈ có dòng đầu tiên (vd list API
 * không muốn JOIN hết mọi dòng để tránh tải nặng) nhưng vẫn biết tổng số
 * dòng qua 1 subquery COUNT riêng — truyền số đó vào đây thay vì phải nhồi
 * mảng `lines` cho đủ độ dài. Mặc định (không truyền) = `lines.length`, đúng
 * hành vi cũ khi caller có sẵn TOÀN BỘ mảng dòng (vd export Excel).
 */
export function deriveDisplayLabel(
  lines: DisplayLabelLine[],
  maxLen = 60,
  totalCountOverride?: number,
): string {
  const first = lines[0];
  if (!first) return NO_LINE_LABEL;
  const name = first.name?.trim();
  if (!name) return NO_LINE_LABEL;

  const sku = first.sku?.trim();
  const base = sku ? `[${sku}] ${name}` : name;
  const count = totalCountOverride ?? lines.length;
  const suffix = count > 1 ? ` +${count - 1}` : "";
  const truncatedBase =
    base.length > maxLen ? `${base.slice(0, maxLen)}…` : base;

  return `${truncatedBase}${suffix}`;
}
