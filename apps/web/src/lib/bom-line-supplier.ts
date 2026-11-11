/**
 * BOM V5 / WP2 — đọc NCC của 1 dòng BOM qua MỘT hàm duy nhất (thuần, không IO,
 * dùng được cả server lẫn client).
 *
 * Thứ tự ưu tiên:
 *   1. cột `supplier_id` (nguồn chuẩn từ V5)
 *   2. `metadata.sourcing.supplierId` (BomLineSheet cũ / import cũ)
 *   3. `metadata.supplierId`
 *   4. `supplier_pending` (text gốc từ Excel, chưa chốt 1 NCC)
 *
 * Tên/mã NCC KHÔNG nằm trong dòng → caller truyền sẵn tên đã join
 * (`supplierName/Code` cho cột chuẩn, `legacySupplierName` cho id lấy từ
 * metadata); nếu thiếu, fallback `metadata.sourcing.supplierName/Code`.
 */

export type LineSupplierSource = "column" | "metadata" | "pending" | "none";

export interface LineSupplierInput {
  supplierId?: string | null;
  supplierName?: string | null;
  supplierCode?: string | null;
  /** Tên NCC join theo id lấy từ metadata (khi supplier_id NULL). */
  legacySupplierName?: string | null;
  legacySupplierCode?: string | null;
  supplierPending?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ResolvedLineSupplier {
  source: LineSupplierSource;
  id: string | null;
  name: string | null;
  code: string | null;
  /** Text gốc cần chốt (chỉ khi source = "pending"). */
  pending: string | null;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export function resolveLineSupplier(line: LineSupplierInput): ResolvedLineSupplier {
  const meta = (line.metadata ?? {}) as Record<string, unknown>;
  const sourcing = (
    meta.sourcing && typeof meta.sourcing === "object" ? meta.sourcing : {}
  ) as Record<string, unknown>;

  const colId = str(line.supplierId);
  if (colId) {
    return {
      source: "column",
      id: colId,
      name: str(line.supplierName) ?? str(sourcing.supplierName),
      code: str(line.supplierCode) ?? str(sourcing.supplierCode),
      pending: null,
    };
  }

  const metaId = str(sourcing.supplierId) ?? str(meta.supplierId);
  if (metaId) {
    return {
      source: "metadata",
      id: metaId,
      name:
        str(line.legacySupplierName) ??
        str(sourcing.supplierName) ??
        str(meta.supplierName),
      code:
        str(line.legacySupplierCode) ??
        str(sourcing.supplierCode) ??
        str(meta.supplierCode),
      pending: null,
    };
  }

  const pending = str(line.supplierPending);
  if (pending) {
    return { source: "pending", id: null, name: null, code: null, pending };
  }
  return { source: "none", id: null, name: null, code: null, pending: null };
}

/** Chuỗi tìm kiếm/lọc NCC của 1 dòng: tên + mã + text chờ chốt + part number. */
export function lineSupplierSearchText(
  line: LineSupplierInput & { supplierItemCode?: string | null },
): string {
  const r = resolveLineSupplier(line);
  return [r.name, r.code, r.pending, str(line.supplierItemCode)]
    .filter(Boolean)
    .join(" ");
}

/** Nhãn ngắn để hiển thị / gom NCC trong bộ lọc. */
export function lineSupplierLabel(
  line: LineSupplierInput & { supplierItemCode?: string | null },
): string {
  const r = resolveLineSupplier(line);
  return r.name ?? r.code ?? r.pending ?? str(line.supplierItemCode) ?? "";
}
