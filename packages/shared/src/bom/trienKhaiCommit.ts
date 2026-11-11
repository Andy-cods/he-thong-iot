/**
 * BOM V5 WP4b — logic thuần cho preview/commit mẫu TRIỂN KHAI (dùng chung web + worker).
 * Không I/O: worker chỉ ghép dữ liệu đã có trong previewJson (assetId/fullUrl).
 */
import { normName, stripDiacritics, type Dims } from "./normName";
import type { BomCategory } from "./stages";

export interface SupplierRef {
  id: string;
  code: string;
  name: string;
}

export type SupplierResolve =
  | { state: "MATCHED"; supplierId: string }
  | { state: "MISSING" }
  | { state: "AMBIGUOUS" };

const foldSup = (s: string) => stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();

/** NCC text → supplier danh mục: khớp chính xác (tên/mã) trước, rồi "chứa" nếu duy nhất. */
export function resolveSupplierName(
  name: string,
  suppliers: readonly SupplierRef[],
): SupplierResolve {
  const q = foldSup(name);
  if (!q) return { state: "MISSING" };
  const exact = suppliers.filter((s) => foldSup(s.name) === q || foldSup(s.code) === q);
  if (exact.length === 1) return { state: "MATCHED", supplierId: exact[0]!.id };
  if (exact.length > 1) return { state: "AMBIGUOUS" };
  if (q.length < 3) return { state: "MISSING" };
  const part = suppliers.filter((s) => {
    const n = foldSup(s.name);
    return n.length >= 3 && (n.includes(q) || q.includes(n));
  });
  if (part.length === 1) return { state: "MATCHED", supplierId: part[0]!.id };
  if (part.length > 1) return { state: "AMBIGUOUS" };
  return { state: "MISSING" };
}

/** Item.dimensions jsonb ({length,width,height} hoặc {l,w,h}) → Dims. */
export function toDims(v: unknown): Dims | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const pick = (a: string, b: string) => {
    const raw = o[a] ?? o[b];
    if (raw === null || raw === undefined || raw === "") return NaN;
    return Number(raw);
  };
  const l = pick("l", "length");
  const w = pick("w", "width");
  const h = pick("h", "height");
  if ([l, w, h].some((n) => Number.isNaN(n))) return null;
  return { l, w, h };
}

/** Quy ước hiện có của item.dimensions: {length,width,height,unit}. */
export function dimsToItemJson(d: Dims | null): Record<string, unknown> | null {
  return d ? { length: d.l, width: d.w, height: d.h, unit: "mm" } : null;
}

export interface CommitMatch {
  status: "MATCH" | "CONFIRM" | "NEW";
  itemId?: string;
  candidates: Array<{ itemId: string }>;
}

export interface CommitDecision {
  position: string;
  action: "USE_ITEM" | "NEW";
  itemId?: string;
}

export type RowPlan = { action: "USE"; itemId: string } | { action: "NEW" };

export interface PlanResult {
  plan: Map<string, RowPlan>;
  /** CONFIRM chưa có quyết định hợp lệ. */
  undecided: string[];
}

/** Gộp kết quả khớp + quyết định người dùng → kế hoạch từng dòng. */
export function planTrienKhaiRows(
  rows: ReadonlyArray<{ position: string; match: CommitMatch }>,
  decisions: readonly CommitDecision[],
): PlanResult {
  const dec = new Map(decisions.map((d) => [d.position, d]));
  const plan = new Map<string, RowPlan>();
  const undecided: string[] = [];
  for (const r of rows) {
    const m = r.match;
    if (m.status === "MATCH" && m.itemId) plan.set(r.position, { action: "USE", itemId: m.itemId });
    else if (m.status === "NEW") plan.set(r.position, { action: "NEW" });
    else {
      const d = dec.get(r.position);
      if (d?.action === "NEW") plan.set(r.position, { action: "NEW" });
      else if (
        d?.action === "USE_ITEM" &&
        d.itemId &&
        m.candidates.some((c) => c.itemId === d.itemId)
      )
        plan.set(r.position, { action: "USE", itemId: d.itemId });
      else undecided.push(r.position);
    }
  }
  return { plan, undecided };
}

export interface CommitRow {
  rowNumber: number;
  stt: number | null;
  position: string;
  file3dName: string;
  materialNote: string | null;
  category: BomCategory;
  dims: Dims | null;
  dimsText: string | null;
  processMethod: string | null;
  materialCode: string | null;
  surfaceTreatment: string | null;
  blankSpec: string | null;
  supplierText: string | null;
  supplierPending: boolean;
  supplierNames: string[];
  picNames: string[];
  coef: number | null;
  qty: number | null;
  assetId?: string | null;
  fullUrl?: string | null;
}

/** sku ≤64 ký tự, không trùng `taken` (UPPER); trùng → hậu tố -2, -3... */
export function uniqueSku(base: string, taken: ReadonlySet<string>): string {
  const b = (base || "ITEM").slice(0, 64);
  if (!taken.has(b.toUpperCase())) return b;
  for (let n = 2; ; n++) {
    const suf = `-${n}`;
    const cand = b.slice(0, 64 - suf.length) + suf;
    if (!taken.has(cand.toUpperCase())) return cand;
  }
}

export function newItemSkuBase(row: Pick<CommitRow, "file3dName">): string {
  return normName(row.file3dName).slice(0, 64);
}

/** Cùng tên chuẩn hoá + vật liệu + quy cách → dùng chung 1 item mới trong file. */
export function newItemKey(
  row: Pick<CommitRow, "file3dName" | "materialCode" | "dimsText">,
): string {
  return [normName(row.file3dName), (row.materialCode ?? "").toUpperCase(), row.dimsText ?? ""].join(
    "|",
  );
}

export function buildNewItemValues(row: CommitRow, sku: string) {
  const processed = row.category === "GTAM" || row.category === "OUTSOURCED";
  return {
    sku,
    name: row.file3dName.trim().slice(0, 255),
    itemType: (processed ? "FABRICATED" : "PURCHASED") as "FABRICATED" | "PURCHASED",
    uom: "PCS" as const,
    status: "ACTIVE" as const,
    isActive: true,
    description: row.materialNote ? row.materialNote.slice(0, 2000) : null,
    materialCode: row.materialCode ? row.materialCode.slice(0, 64) : null,
    dimensions: dimsToItemJson(row.dims),
    imageUrl: row.fullUrl ?? null,
  };
}

export interface LineCtx {
  templateId: string;
  sheetId: string;
  componentItemId: string;
  /** Số thứ tự (cột position int). */
  position: number;
  batchId: string;
  supplierId: string | null;
}

/** Giá trị insert bom_line (đủ cột V5). NCC không chốt chắc → supplierPending = text gốc. */
export function buildBomLineValues(row: CommitRow, ctx: LineCtx) {
  const qty = row.qty !== null && row.qty > 0 ? row.qty : 1;
  const pendingText = ctx.supplierId ? null : row.supplierText?.trim() || null;
  return {
    templateId: ctx.templateId,
    sheetId: ctx.sheetId,
    parentLineId: null,
    componentItemId: ctx.componentItemId,
    level: 1,
    position: ctx.position,
    positionCode: row.position.slice(0, 16),
    qtyPerParent: String(qty),
    scrapPercent: "0",
    description: row.materialNote ? row.materialNote.slice(0, 2000) : null,
    assignedToName: row.picNames.length ? row.picNames.join("/").slice(0, 255) : null,
    supplierId: ctx.supplierId,
    supplierPending: pendingText,
    category: row.category,
    processMethod: row.processMethod,
    surfaceTreatment: row.surfaceTreatment,
    blankSpec: row.blankSpec,
    materialCode: row.materialCode,
    file3dName: row.file3dName,
    imageAssetId: row.assetId ?? null,
    coef: row.coef !== null ? String(row.coef) : null,
    picNames: row.picNames.length ? row.picNames : null,
    metadata: {
      seq: row.position,
      importedFromSheet: "TRIEN_KHAI",
      importedRow: row.rowNumber,
      importedFromBatch: ctx.batchId,
    } as Record<string, unknown>,
  };
}
