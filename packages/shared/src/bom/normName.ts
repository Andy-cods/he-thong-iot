/**
 * Chuẩn hoá tên file 3D / vật liệu / quy cách cho khớp BOM mẫu TRIỂN KHAI (V5 WP0).
 * Hàm thuần, dùng chung web + worker.
 */

/** Bỏ dấu tiếng Việt + đ→d. */
export function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Tên để so khớp: bỏ tiền tố ngoặc đầu chuỗi (vd "(bổ sung) "), bỏ hậu tố `_\d+`,
 * trim, gộp khoảng trắng, UPPERCASE.
 * Lưu ý: có thể cắt nhầm hậu tố mã thật (vd `AB_2024`) — preview nên hiển thị tên gốc.
 */
export function normName(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  let s = String(input).trim();
  // tiền tố ngoặc ở đầu chuỗi (lặp được: "(a) (b) X")
  for (;;) {
    const next = s.replace(/^\([^)]*\)\s*/, "");
    if (next === s) break;
    s = next;
  }
  s = s.trim().replace(/_\d+$/, "").trim();
  return s.replace(/\s+/g, " ").toUpperCase();
}

export interface Dims {
  l: number;
  w: number;
  h: number;
}

/** Parse "56 × 26.5 × 18" (× x X *; dấu phẩy thập phân chấp nhận) → {l,w,h} hoặc null. */
export function parseDims(input: string | null | undefined): Dims | null {
  if (input === null || input === undefined) return null;
  const parts = String(input)
    .trim()
    .split(/\s*[×xX*]\s*/);
  if (parts.length !== 3) return null;
  const nums = parts.map((p) => {
    const t = p.trim().replace(",", ".");
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  });
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return { l: nums[0]!, w: nums[1]!, h: nums[2]! };
}

/** Mã vật liệu để so: không dấu, bỏ mọi khoảng trắng, UPPERCASE. */
export function normMaterial(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  return stripDiacritics(String(input)).replace(/\s+/g, "").toUpperCase();
}
