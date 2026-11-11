/**
 * V5 WP4b — dựng preview bước "Khớp" (hàm thuần): chạy matchBomRows + khớp NCC + thống kê.
 */
import {
  resolveSupplierName,
  type Dims,
  type SupplierRef,
  type SupplierResolve,
} from "@iot/shared";
import {
  buildItemIndex,
  matchBomRows,
  type MatchItemInput,
  type MatchResult,
  type MatchRowInput,
} from "./bomMatch";

export const TRIEN_KHAI_DISABLED_MESSAGE = "Mẫu BOM triển khai chưa bật";

/** null = được phép; ngược lại là lỗi trả về client. */
export function guardTrienKhaiEnabled(
  enabled: boolean,
): { code: string; message: string; status: number } | null {
  return enabled
    ? null
    : { code: "TRIEN_KHAI_DISABLED", message: TRIEN_KHAI_DISABLED_MESSAGE, status: 422 };
}

export interface PreviewRowIn extends MatchRowInput {
  position: string;
  supplierPending: boolean;
  supplierNames: string[];
}

export interface MatchStats {
  total: number;
  match: number;
  confirm: number;
  new: number;
  /** Số dòng NCC phải chốt tay (nhiều nhà / mơ hồ). */
  supplierPending: number;
  /** Tên NCC chưa có trong danh mục (đã bỏ trùng). */
  suppliersMissing: string[];
}

export interface RowSupplierInfo {
  state: "NONE" | "MATCHED" | "MISSING" | "PENDING";
  supplierId?: string;
}

export interface TrienKhaiMatchPreview {
  matches: Array<MatchResult & { supplier: RowSupplierInfo }>;
  stats: MatchStats;
}

export function buildTrienKhaiMatchPreview(
  rows: readonly PreviewRowIn[],
  items: readonly MatchItemInput[],
  suppliers: readonly SupplierRef[],
): TrienKhaiMatchPreview {
  const results = matchBomRows(rows, buildItemIndex(items));
  const missing = new Map<string, string>();
  let supplierPending = 0;

  const matches = rows.map((r, i) => {
    const res = results[i]!;
    let supplier: RowSupplierInfo = { state: "NONE" };
    const names = r.supplierNames.filter((n) => n.trim());
    for (const n of names) {
      const rs: SupplierResolve = resolveSupplierName(n, suppliers);
      if (rs.state === "MISSING") missing.set(n.trim().toLowerCase(), n.trim());
    }
    if (r.supplierPending || names.length > 1) {
      supplier = { state: "PENDING" };
      supplierPending++;
    } else if (names.length === 1) {
      const rs = resolveSupplierName(names[0]!, suppliers);
      if (rs.state === "MATCHED") supplier = { state: "MATCHED", supplierId: rs.supplierId };
      else if (rs.state === "AMBIGUOUS") {
        supplier = { state: "PENDING" };
        supplierPending++;
      } else supplier = { state: "MISSING" };
    }
    return { ...res, supplier };
  });

  return {
    matches,
    stats: {
      total: rows.length,
      match: matches.filter((m) => m.status === "MATCH").length,
      confirm: matches.filter((m) => m.status === "CONFIRM").length,
      new: matches.filter((m) => m.status === "NEW").length,
      supplierPending,
      suppliersMissing: [...missing.values()],
    },
  };
}

export type { Dims };
