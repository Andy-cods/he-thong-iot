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

const FALLBACK_LABEL = "Chưa có vật tư";

/**
 * Lấy `name` của dòng ĐẦU TIÊN trong `lines` (đúng thứ tự truyền vào, không
 * tự sort lại) làm gốc, prefix `[sku]` nếu dòng có sku không rỗng, thêm hậu
 * tố ` +N` khi có nhiều hơn 1 dòng (N = số dòng còn lại). Phần tên (kèm
 * prefix sku nếu có) bị cắt theo `maxLen` ký tự kèm "…" nếu quá dài; hậu tố
 * "+N" luôn được giữ nguyên vẹn — cắt phần tên trước, ghép hậu tố sau.
 */
export function deriveDisplayLabel(
  lines: DisplayLabelLine[],
  maxLen = 60,
): string {
  const first = lines[0];
  if (!first) return FALLBACK_LABEL;
  const name = first.name?.trim();
  if (!name) return FALLBACK_LABEL;

  const sku = first.sku?.trim();
  const base = sku ? `[${sku}] ${name}` : name;
  const suffix = lines.length > 1 ? ` +${lines.length - 1}` : "";
  const truncatedBase =
    base.length > maxLen ? `${base.slice(0, maxLen)}…` : base;

  return `${truncatedBase}${suffix}`;
}
