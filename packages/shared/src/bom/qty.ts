/**
 * Ngữ nghĩa số lượng dòng BOM — MỘT nguồn sự thật cho web + worker.
 *
 *   bom_line.qty_per_parent = số lượng cho 1 BỘ (1 thành phẩm cha) — "Hệ số".
 *   bom_template.target_qty = số bộ cần làm.
 *   Tổng SL của dòng = qty_per_parent × target_qty.
 *
 * Mẫu "BOM TRIỂN KHAI": cột N "Hệ số" = SL / 1 bộ, cột O "SL" = Hệ số × Số bộ
 * (giá trị tĩnh trong file), dòng 2 có "Số bộ = N". Trước 20/11/2026 commit ghi
 * qty_per_parent = SL (đã nhân số bộ) → lưới hiển thị SL × số bộ lần nữa.
 */

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
/** Sai số so sánh SL (file Excel hay có số thực 0.1+0.2). */
const QTY_CMP_EPS = 1e-6;

const pos = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

export type SetCountSource = "NOTE" | "INFERRED" | "DEFAULT";

export interface SetCountResult {
  /** Số bộ dùng cho BOM (luôn ≥ 1). */
  setCount: number;
  source: SetCountSource;
  /** Số dòng dùng để suy ra (source = INFERRED). */
  basisRows: number;
}

/**
 * Số bộ: ưu tiên ghi chú "Số bộ = N"; thiếu → suy ra khi MỌI dòng có cả
 * Hệ số > 0 và SL > 0 cho cùng 1 tỉ lệ nguyên SL ÷ Hệ số; còn lại → 1.
 */
export function inferSetCount(
  noteSetCount: number | null | undefined,
  rows: ReadonlyArray<{ coef: number | null; qty: number | null }>,
): SetCountResult {
  if (pos(noteSetCount)) return { setCount: noteSetCount, source: "NOTE", basisRows: 0 };
  let ratio: number | null = null;
  let basis = 0;
  for (const r of rows) {
    if (!pos(r.coef) || !pos(r.qty)) continue;
    const k = r.qty / r.coef;
    if (ratio === null) ratio = k;
    else if (Math.abs(k - ratio) > QTY_CMP_EPS) return { setCount: 1, source: "DEFAULT", basisRows: 0 };
    basis++;
  }
  if (ratio !== null) {
    const n = Math.round(ratio);
    if (n >= 1 && Math.abs(ratio - n) <= QTY_CMP_EPS) {
      return { setCount: n, source: "INFERRED", basisRows: basis };
    }
  }
  return { setCount: 1, source: "DEFAULT", basisRows: 0 };
}

export type QtyPerSetSource = "COEF" | "SL_DIV_SETS" | "SL" | "DEFAULT";

/**
 * SL / 1 bộ ghi vào qty_per_parent: Hệ số (> 0) → SL ÷ Số bộ → SL → 1.
 * `setCount` ≤ 0 / thiếu coi như 1.
 */
export function resolveQtyPerSet(
  row: { coef: number | null; qty: number | null },
  setCount: number | null | undefined,
): { qtyPerSet: number; source: QtyPerSetSource } {
  if (pos(row.coef)) return { qtyPerSet: row.coef, source: "COEF" };
  const sets = pos(setCount) ? setCount : 1;
  if (pos(row.qty)) {
    return sets > 1
      ? { qtyPerSet: round6(row.qty / sets), source: "SL_DIV_SETS" }
      : { qtyPerSet: row.qty, source: "SL" };
  }
  return { qtyPerSet: 1, source: "DEFAULT" };
}

export interface TrienKhaiQtyRow {
  rowNumber: number;
  position: string;
  coef: number | null;
  /** SL ghi trong file (cột "SL"). */
  fileQty: number | null;
  /** SL / bộ hệ thống lưu (qty_per_parent). */
  qtyPerSet: number;
  /** SL hệ thống sẽ tính = qtyPerSet × số bộ. */
  systemQty: number;
  source: QtyPerSetSource;
  /** SL file ≠ Hệ số × Số bộ, hoặc thiếu cả Hệ số lẫn SL. */
  mismatch: boolean;
}

export interface TrienKhaiQtyCheck {
  setCount: number;
  rows: TrienKhaiQtyRow[];
  mismatches: TrienKhaiQtyRow[];
}

/** Đối chiếu từng dòng: Hệ số / SL file / SL hệ thống sẽ tính. */
export function buildTrienKhaiQtyCheck(
  rows: ReadonlyArray<{ rowNumber: number; position: string; coef: number | null; qty: number | null }>,
  setCount: number,
): TrienKhaiQtyCheck {
  const sets = pos(setCount) ? setCount : 1;
  const out = rows.map((r): TrienKhaiQtyRow => {
    const { qtyPerSet, source } = resolveQtyPerSet(r, sets);
    const systemQty = round4(qtyPerSet * sets);
    const mismatch =
      source === "DEFAULT" ||
      (source === "COEF" && r.qty !== null && Math.abs(r.qty - systemQty) > QTY_CMP_EPS);
    return {
      rowNumber: r.rowNumber,
      position: r.position,
      coef: r.coef,
      fileQty: r.qty,
      qtyPerSet,
      systemQty,
      source,
      mismatch,
    };
  });
  return { setCount: sets, rows: out, mismatches: out.filter((r) => r.mismatch) };
}

const fmt = (n: number) => String(round4(n));

/** Câu cảnh báo cho 1 dòng lệch (tiếng Việt). */
export function trienKhaiQtyWarningText(r: TrienKhaiQtyRow, setCount: number): string {
  const label = `Dòng ${r.rowNumber}${r.position ? ` (${r.position})` : ""}`;
  if (r.source === "DEFAULT") {
    return `${label}: thiếu cả Hệ số và SL — hệ thống tạm dùng 1/bộ (tổng ${fmt(r.systemQty)}).`;
  }
  return (
    `${label}: SL file ${fmt(r.fileQty ?? 0)} ≠ Hệ số ${fmt(r.coef ?? 0)} × Số bộ ${setCount} = ` +
    `${fmt(r.systemQty)} — hệ thống dùng Hệ số ${fmt(r.qtyPerSet)}/bộ (tổng ${fmt(r.systemQty)}).`
  );
}

/** Câu giải thích Số bộ đã dùng (null khi lấy từ ghi chú). */
export function setCountNoticeText(res: SetCountResult): string | null {
  if (res.source === "INFERRED") {
    return (
      `Không thấy "Số bộ = N" ở dòng 2 — suy ra Số bộ = ${res.setCount} ` +
      `từ SL ÷ Hệ số (đồng nhất ở ${res.basisRows} dòng).`
    );
  }
  if (res.source === "DEFAULT") {
    return (
      `Không thấy "Số bộ = N" ở dòng 2 và không suy ra được từ SL ÷ Hệ số — ` +
      `tạm dùng Số bộ = 1. Kiểm tra lại số bộ của BOM sau khi tạo.`
    );
  }
  return null;
}

/**
 * Tổng SL cần của 1 dòng BOM — dùng cho cột "SL" của lưới, SL cần ở sổ bước /
 * phiếu giao, SL mặc định khi tạo PR / YCSX / PO gia công từ dòng.
 *
 * metadata.totalQty (> 0): chỉ có ở BOM nhập theo mẫu CŨ (map cột "SL/Tổng SL"),
 * nơi target_qty = 1 và tổng nằm ở metadata — giữ để không đổi số các BOM đó.
 * Mẫu TRIỂN KHAI KHÔNG ghi totalQty (chỉ metadata.fileQty để truy vết, KHÔNG dùng
 * hiển thị) → tổng = qty_per_parent × target_qty.
 */
export function bomLineTotalQty(
  metadata: unknown,
  qtyPerParent: unknown,
  targetQty: unknown,
): number {
  const md = (metadata ?? null) as { totalQty?: unknown } | null;
  const legacy = md && md.totalQty != null && md.totalQty !== "" ? Number(md.totalQty) : NaN;
  if (Number.isFinite(legacy) && legacy > 0) return round4(legacy);
  return round4((Number(qtyPerParent) || 0) * (Number(targetQty) || 0));
}
