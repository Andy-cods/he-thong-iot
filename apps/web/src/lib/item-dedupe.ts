/**
 * V4.4 (Việc 3) — "Kiểm trùng tên gần giống" khi tạo vật tư nhanh từ form
 * Đề xuất vật tư (DNVT/YCVT). THUẦN (không đụng DB) → test vitest riêng.
 *
 * Bối cảnh lỗi gốc (LOOP_E2E.md #2): PR dòng nhập tay không gắn `itemId` →
 * khi Thu mua "Tạo PO", `findOrCreateItemForLine` so khớp tên bằng
 * `lower(name) = lower(name)` TUYỆT ĐỐI (không bỏ dấu, không bỏ khoảng
 * trắng thừa) → sai khác 1 ký tự/dấu cách/tiền tố "[DEMO]" là tạo item MỚI
 * âm thầm. Chuẩn hoá ở đây MẠNH hơn (bỏ dấu tiếng Việt + khoảng trắng thừa)
 * để bắt được nhiều ca trùng hơn khi CẢNH BÁO lúc tạo — không đổi
 * `findOrCreateItemForLine` (giữ nguyên hành vi cũ cho dòng PR cũ, đúng yêu
 * cầu "giữ tương thích phiếu cũ").
 */

/** Bỏ dấu tiếng Việt + hạ chữ thường + gộp khoảng trắng thừa. */
export function normalizeItemName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export interface ItemNameCandidate {
  id: string;
  sku: string;
  name: string;
}

/**
 * Tìm ứng viên TRÙNG TUYỆT ĐỐI (sau khi chuẩn hoá) trong danh sách candidates
 * (thường là kết quả tìm kiếm ILIKE rộng theo tên). `null` = không trùng hẳn
 * — vẫn có thể có ứng viên "gần giống" khác trong `candidates` để gợi ý.
 */
export function findExactNameDuplicate(
  name: string,
  candidates: readonly ItemNameCandidate[],
): ItemNameCandidate | null {
  const norm = normalizeItemName(name);
  if (!norm) return null;
  return candidates.find((c) => normalizeItemName(c.name) === norm) ?? null;
}
