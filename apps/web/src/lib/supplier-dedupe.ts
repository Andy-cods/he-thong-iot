/**
 * V4.5 QA-A P1 — "Kiểm trùng tên gần giống" khi tạo Nhà cung cấp (NCC). THUẦN
 * (không đụng DB) → test vitest riêng, dùng CHUNG cho:
 *   - `ConvertPRToPODialog.tsx` (chọn/gõ NCC khi tạo PO từ PR) — gợi ý NCC có
 *     sẵn "Dùng NCC này?" trước khi cho gõ tên mới.
 *   - `POST /api/suppliers` (tạo NCC) — chặn tạo mới (409) trừ khi `force`.
 *
 * Bối cảnh lỗi gốc (QA-A P1): `ConvertPRToPODialog` coi NCC "đã có" chỉ khi
 * tên/mã khớp CHÍNH XÁC 100% (`hasExact`). Gõ tên rút gọn (vd "Mạnh Hưng")
 * thay vì tên pháp lý đầy đủ ("CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI DỊCH VỤ MẠNH
 * HƯNG") → hệ thống coi là NCC MỚI dù NCC thật đã tồn tại → tạo trùng, gãy
 * tổng hợp công nợ theo NCC (1 NCC thật tách thành 2 hồ sơ riêng).
 *
 * Giống `lib/item-dedupe.ts` (chuẩn hoá bỏ dấu + khoảng trắng) nhưng THÊM bỏ
 * các từ chỉ LOẠI HÌNH DOANH NGHIỆP phổ biến ("Công ty", "TNHH", "Cổ phần"/
 * "CP", "MTV", "DNTN"…) — đây là phần khác biệt chính giữa tên rút gọn và tên
 * pháp lý đầy đủ. Sau khi chuẩn hoá, coi là TRÙNG nếu bằng nhau HOẶC một tên
 * là tên con của tên kia (bắt đúng ca "Mạnh Hưng" ⊂ "... Mạnh Hưng").
 */

/** Từ chỉ loại hình DN tiếng Việt hay gặp — bỏ khi so khớp (không phải nội dung phân biệt NCC). */
const LEGAL_ENTITY_TOKENS = [
  "cong ty co phan",
  "cong ty tnhh mot thanh vien",
  "cong ty tnhh mtv",
  "cong ty trach nhiem huu han",
  "cong ty tnhh",
  "cong ty",
  "tnhh mtv",
  "tnhh",
  "co phan",
  "mot thanh vien",
  "mtv",
  "dntn",
  "doanh nghiep tu nhan",
  "tap doan",
  "cp",
];

/** Bỏ dấu tiếng Việt + hạ chữ thường + gộp khoảng trắng thừa (giống item-dedupe). */
function toAsciiLower(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Chuẩn hoá tên NCC để so khớp trùng: bỏ dấu, hạ chữ thường, bỏ từ chỉ loại
 * hình DN ("Công ty"/"TNHH"/"Cổ phần"/"CP"/…), gộp khoảng trắng thừa.
 */
export function normalizeSupplierName(raw: string): string {
  let s = toAsciiLower(raw);
  for (const token of LEGAL_ENTITY_TOKENS) {
    s = s.replace(new RegExp(`\\b${token}\\b`, "g"), " ");
  }
  return s.replace(/\s+/g, " ").trim();
}

export interface SupplierNameCandidate {
  id: string;
  code: string;
  name: string;
  taxCode?: string | null;
  phone?: string | null;
}

/** Độ dài tối thiểu sau chuẩn hoá để tránh dương tính giả (vd tên 1-2 ký tự). */
const MIN_MATCH_LENGTH = 3;

/**
 * Tìm ứng viên NCC TRÙNG hoặc GẦN GIỐNG trong danh sách (thường là kết quả
 * tìm kiếm ILIKE rộng theo tên/mã). Coi là trùng khi, sau chuẩn hoá, 2 tên
 * BẰNG NHAU hoặc MỘT TÊN LÀ TÊN CON của tên kia (bắt ca tên rút gọn ⊂ tên
 * pháp lý đầy đủ). `null` = không có ứng viên nào đủ giống.
 */
export function findSimilarSupplier<T extends SupplierNameCandidate>(
  name: string,
  candidates: readonly T[],
): T | null {
  const norm = normalizeSupplierName(name);
  if (!norm || norm.length < MIN_MATCH_LENGTH) return null;
  return (
    candidates.find((c) => {
      const cNorm = normalizeSupplierName(c.name);
      if (!cNorm || cNorm.length < MIN_MATCH_LENGTH) return false;
      return cNorm === norm || cNorm.includes(norm) || norm.includes(cNorm);
    }) ?? null
  );
}
