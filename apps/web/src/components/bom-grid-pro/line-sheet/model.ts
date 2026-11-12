/**
 * BomLineSheet — logic thuần (không React/IO): form state, validate, dựng metadata,
 * chọn hành động theo ngữ cảnh, gộp dòng thời gian hoạt động.
 */
import { stageLabel, stagesFor, type BomCategory } from "@iot/shared";
import { resolveLineSupplier } from "../../../lib/bom-line-supplier";
import type { BomTreeNodeRaw } from "../../../hooks/useBom";
import type { StageBuckets } from "../../../lib/bom-stage-ledger";
import { defaultMove } from "../../../lib/bom-stage-journey";
import { PROCESSES, PROCESS_MAP } from "./constants";

export type KindMode = "com" | "fab";
export type CategoryCode = "GTAM" | "OUTSOURCED" | "COMMERCIAL";

export const CATEGORY_OPTIONS: Array<{ code: CategoryCode; label: string }> = [
  { code: "GTAM", label: "GTAM gia công" },
  { code: "OUTSOURCED", label: "Gia công ngoài" },
  { code: "COMMERCIAL", label: "Thương mại" },
];

/** Nhãn Excel lưu trong metadata.category (tương thích dữ liệu cũ). */
export const CATEGORY_TO_LABEL: Record<CategoryCode, string> = {
  GTAM: "GTAM",
  OUTSOURCED: "Đặt gia công ngoài",
  COMMERCIAL: "Thương mại",
};
const LABEL_TO_CATEGORY: Record<string, CategoryCode> = {
  GTAM: "GTAM",
  "Đặt gia công ngoài": "OUTSOURCED",
  "Thương mại": "COMMERCIAL",
};

/** Loại suy từ category: GTAM/OUTSOURCED → gia công (fab), COMMERCIAL → thương mại (com). */
export function kindOfCategory(c: CategoryCode): KindMode {
  return c === "COMMERCIAL" ? "com" : "fab";
}

export interface FormState {
  category: CategoryCode;
  qtyPerParent: string;
  scrapPercent: string;
  uom: string;
  description: string;
  supplierPartNumber: string;
  leadTimeDays: string;
  moq: string;
  estimatedPrice: string;
  paymentTerms: string;
  materialCode: string;
  materialName: string;
  blankSize: string;
  processRoute: string[];
  estimatedHours: string;
  technicalNotes: string;
}

export type FormErrors = Partial<Record<keyof FormState, string>>;

function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function partNumberFromLegacy(node: BomTreeNodeRaw): string {
  const raw = (node.supplierItemCode ?? "").trim();
  if (!raw) return "";
  const r = resolveLineSupplier(node);
  const same = [r.name, r.code, r.pending].some(
    (v) => v && v.trim().toLowerCase() === raw.toLowerCase(),
  );
  return same ? "" : raw;
}

function parseRoute(routeRaw: unknown): string[] {
  if (Array.isArray(routeRaw)) {
    return routeRaw.filter((x): x is string => typeof x === "string");
  }
  if (typeof routeRaw === "string" && routeRaw.trim()) {
    // Back-compat: processRoute từng là free text.
    return routeRaw
      .split(/[\n/→>]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((txt) => {
        const upper = txt.toUpperCase();
        const found = PROCESSES.find(
          (p) => p.code === upper || p.name.toUpperCase() === upper || upper.includes(p.code),
        );
        return found?.code ?? "";
      })
      .filter(Boolean);
  }
  return [];
}

export function categoryOfNode(node: BomTreeNodeRaw): CategoryCode {
  const col = node.category as CategoryCode | null | undefined;
  if (col && col in CATEGORY_TO_LABEL) return col;
  const meta = (node.metadata ?? {}) as { category?: unknown };
  if (typeof meta.category === "string") {
    const c = LABEL_TO_CATEGORY[meta.category.trim()];
    if (c) return c;
  }
  return "COMMERCIAL";
}

export function buildInitial(node: BomTreeNodeRaw | null): FormState {
  const empty: FormState = {
    category: "COMMERCIAL",
    qtyPerParent: "1",
    scrapPercent: "0",
    uom: "",
    description: "",
    supplierPartNumber: "",
    leadTimeDays: "",
    moq: "",
    estimatedPrice: "",
    paymentTerms: "",
    materialCode: "",
    materialName: "",
    blankSize: "",
    processRoute: [],
    estimatedHours: "",
    technicalNotes: "",
  };
  if (!node) return empty;
  const meta = (node.metadata ?? {}) as {
    size?: unknown;
    sourcing?: Record<string, unknown>;
    routing?: Record<string, unknown>;
  };
  const sourcing = meta.sourcing ?? {};
  const routing = meta.routing ?? {};
  return {
    category: categoryOfNode(node),
    qtyPerParent: String(node.qtyPerParent ?? "1"),
    scrapPercent: String(node.scrapPercent ?? "0"),
    uom: node.uom ?? "",
    description: node.description ?? "",
    supplierPartNumber: toStr(sourcing.supplierPartNumber) || partNumberFromLegacy(node),
    leadTimeDays: toStr(sourcing.leadTimeDays),
    moq: toStr(sourcing.moq),
    estimatedPrice: toStr(sourcing.estimatedPrice),
    paymentTerms: toStr(sourcing.paymentTerms),
    materialCode: toStr(routing.materialCode) || (node.componentCategory ?? ""),
    materialName: toStr(routing.materialName),
    blankSize: toStr(routing.blankSize) || (typeof meta.size === "string" ? meta.size : ""),
    processRoute: parseRoute(routing.processRoute),
    estimatedHours: toStr(routing.estimatedHours),
    technicalNotes: toStr(routing.technicalNotes),
  };
}

export function validateForm(form: FormState): FormErrors {
  const next: FormErrors = {};
  const qty = Number(form.qtyPerParent);
  if (!Number.isFinite(qty) || qty < 0.01) next.qtyPerParent = "Số lượng phải ≥ 0.01";
  const scrap = Number(form.scrapPercent);
  if (!Number.isFinite(scrap) || scrap < 0 || scrap > 100) next.scrapPercent = "Hao hụt 0-100%";
  if (form.uom.length > 16) next.uom = "ĐVT tối đa 16 ký tự";
  if (form.description.length > 500) next.description = "Ghi chú tối đa 500 ký tự";

  if (kindOfCategory(form.category) === "com") {
    if (form.supplierPartNumber.length > 64) next.supplierPartNumber = "Mã NCC tối đa 64 ký tự";
    if (form.leadTimeDays !== "") {
      const n = Number(form.leadTimeDays);
      if (!Number.isFinite(n) || n < 0) next.leadTimeDays = "Lead time phải ≥ 0";
    }
    if (form.moq !== "") {
      const n = Number(form.moq);
      if (!Number.isFinite(n) || n < 1) next.moq = "MOQ phải ≥ 1";
    }
    if (form.estimatedPrice !== "") {
      const n = Number(form.estimatedPrice);
      if (!Number.isFinite(n) || n < 0) next.estimatedPrice = "Giá phải ≥ 0";
    }
    if (form.paymentTerms.length > 64) next.paymentTerms = "Điều khoản tối đa 64 ký tự";
  } else {
    if (form.materialCode.length > 64) next.materialCode = "Vật liệu tối đa 64 ký tự";
    if (form.blankSize.length > 64) next.blankSize = "Kích thước tối đa 64 ký tự";
    if (form.estimatedHours !== "") {
      const n = Number(form.estimatedHours);
      if (!Number.isFinite(n) || n < 0) next.estimatedHours = "Thời gian phải ≥ 0";
    }
    if (form.technicalNotes.length > 500) next.technicalNotes = "Ghi chú tối đa 500 ký tự";
  }
  return next;
}

/** Payload PATCH dòng — đúng các trường cũ (qtyPerParent, scrapPercent, uom, description,
 *  supplierItemCode, metadata, category). expectedVersion do caller thêm. */
export function buildSavePayload(form: FormState, node: BomTreeNodeRaw) {
  const kind = kindOfCategory(form.category);
  const nextMeta: Record<string, unknown> = { ...((node.metadata ?? {}) as Record<string, unknown>) };
  nextMeta.kind = kind;
  nextMeta.category = CATEGORY_TO_LABEL[form.category];

  if (kind === "com") {
    // NCC (supplierId/Name/Code) KHÔNG ghi từ form: đổi qua SupplierCell.
    const sourcing: Record<string, unknown> = {};
    if (form.supplierPartNumber.trim()) sourcing.supplierPartNumber = form.supplierPartNumber.trim();
    if (form.leadTimeDays !== "") sourcing.leadTimeDays = Number(form.leadTimeDays);
    if (form.moq !== "") sourcing.moq = Number(form.moq);
    if (form.estimatedPrice !== "") sourcing.estimatedPrice = Number(form.estimatedPrice);
    if (form.paymentTerms.trim()) sourcing.paymentTerms = form.paymentTerms.trim();
    if (Object.keys(sourcing).length > 0) nextMeta.sourcing = sourcing;
    else delete nextMeta.sourcing;
  } else {
    const routing: Record<string, unknown> = {};
    if (form.materialCode.trim()) routing.materialCode = form.materialCode.trim();
    if (form.materialName.trim()) routing.materialName = form.materialName.trim();
    if (form.blankSize.trim()) routing.blankSize = form.blankSize.trim();
    if (form.processRoute.length > 0) routing.processRoute = form.processRoute;
    if (form.estimatedHours !== "") routing.estimatedHours = Number(form.estimatedHours);
    if (form.technicalNotes.trim()) routing.technicalNotes = form.technicalNotes.trim();
    if (Object.keys(routing).length > 0) nextMeta.routing = routing;
    else delete nextMeta.routing;
    if (form.blankSize.trim()) nextMeta.size = form.blankSize.trim();
  }

  return {
    qtyPerParent: Number(form.qtyPerParent),
    scrapPercent: Number(form.scrapPercent),
    uom: form.uom.trim() || null,
    description: form.description.trim() || null,
    supplierItemCode:
      kind === "com" ? form.supplierPartNumber.trim() || null : (node.supplierItemCode ?? null),
    metadata: nextMeta,
    category: form.category,
  };
}

/** URL tạo Lệnh SX (new-lsx) với prefill từ dòng BOM. */
export function buildWorkOrderHref(
  form: FormState,
  node: BomTreeNodeRaw,
  lineId: string,
  templateId: string,
  templateCode: string,
): string {
  const names = form.processRoute.map((c) => PROCESS_MAP.get(c)?.name ?? c);
  const q = new URLSearchParams();
  q.set("bomLineId", lineId);
  q.set("bomTemplateId", templateId);
  if (node.componentSku) q.set("sku", node.componentSku);
  if (form.materialCode) q.set("materialCode", form.materialCode);
  if (form.processRoute.length > 0) q.set("processRoute", form.processRoute.join(","));
  if (node.componentItemId) q.set("productItemId", node.componentItemId);
  if (names.length > 0) q.set("processNames", names.join("|"));
  const note = [`Tạo từ BOM ${templateCode}`, `dòng ${node.componentSku ?? ""}`];
  if (form.materialCode) note.push(`Vật liệu: ${form.materialCode}`);
  if (names.length > 0) note.push(`Quy trình: ${names.join(" → ")}`);
  if (form.blankSize) note.push(`Phôi: ${form.blankSize}`);
  q.set("note", note.join(" · "));
  return `/work-orders/new-lsx?${q.toString()}`;
}

/* ───────────── Hành động theo ngữ cảnh (card "Đang ở đâu") ───────────── */

export type LineActionKind = "move" | "sendNtp" | "deliver";

export interface LineAction {
  kind: LineActionKind;
  label: string;
  qty: number;
}

const EPS = 5e-5;

/**
 * Tối đa 2 hành động, hành động đầu là chính:
 *  - GTAM còn hàng ở Gia công → "Gửi nhà thầu phụ" (phiếu SURFACE).
 *  - Còn hàng ở QC → "Giao lắp ráp" (phiếu ASSEMBLY).
 *  - Còn hàng ở bước chưa cuối → "Chuyển sang <bước kế> (N)" (dialog chuyển bước).
 * Hết hàng / đã giao đủ / chưa có số liệu → [].
 */
export function pickLineActions(
  category: BomCategory,
  buckets: StageBuckets | null,
): LineAction[] {
  if (!buckets) return [];
  const out: LineAction[] = [];
  const qtyAt = (code: string) => buckets[code] ?? 0;
  if (category === "GTAM" && qtyAt("MACHINING") > EPS) {
    out.push({ kind: "sendNtp", label: "Gửi nhà thầu phụ", qty: qtyAt("MACHINING") });
  }
  if (qtyAt("QC") > EPS) {
    out.push({ kind: "deliver", label: "Giao lắp ráp", qty: qtyAt("QC") });
  }
  const dm = defaultMove(category, buckets);
  if (dm.ok) {
    out.push({
      kind: "move",
      label: `Chuyển sang ${stageLabel(category, dm.to)} (${dm.qty})`,
      qty: dm.qty,
    });
  }
  return out.slice(0, 2);
}

/** Vị trí bước hiện tại (xa nhất còn hàng) — để tô sáng thanh bước. */
export function currentStageIndex(category: BomCategory, buckets: StageBuckets | null): number {
  if (!buckets) return -1;
  const codes = stagesFor(category);
  for (let i = codes.length - 1; i >= 0; i--) if ((buckets[codes[i]!] ?? 0) > EPS) return i;
  return -1;
}

/* ───────────── Dòng thời gian hoạt động ───────────── */

export interface SupplierChangeInput {
  id: number;
  oldValue: { name?: string | null; pending?: string } | null;
  newValue: { name?: string | null } | null;
  actorName: string | null;
  at: string;
}

export interface StageMoveInput {
  id: number;
  fromStage: string | null;
  toStage: string;
  qty: string;
  docType: string;
  actorName: string | null;
  at: string;
  reversesId: number | null;
  reversedById: number | null;
}

export interface ActivityItem {
  key: string;
  kind: "supplier" | "move" | "reverse" | "slip";
  text: string;
  actor: string | null;
  at: string;
  /** Có thể đảo (move MANUAL chưa đảo, không phải bút toán đảo). */
  reversibleMoveId: number | null;
}

/** Gộp đổi NCC + chuyển bước thành 1 dòng thời gian, mới nhất trước. */
export function mergeActivity(
  category: BomCategory | null,
  history: readonly SupplierChangeInput[],
  moves: readonly StageMoveInput[],
): ActivityItem[] {
  const stage = (c: string | null) => (c ? (category ? stageLabel(category, c) : c) : "—");
  const items: ActivityItem[] = [];
  for (const h of history) {
    const from = h.oldValue?.name ?? h.oldValue?.pending ?? "(trống)";
    const to = h.newValue?.name ?? "(trống)";
    items.push({
      key: `s${h.id}`,
      kind: "supplier",
      text: `Đổi NCC: ${from} → ${to}`,
      actor: h.actorName,
      at: h.at,
      reversibleMoveId: null,
    });
  }
  for (const m of moves) {
    const qty = Number(m.qty);
    const isReverse = m.reversesId != null;
    const fromSlip = m.docType !== "MANUAL" && !isReverse;
    const text = isReverse
      ? `Đảo bút toán #${m.reversesId}: ${stage(m.fromStage)} → ${stage(m.toStage)} · ${qty}`
      : `Chuyển ${stage(m.fromStage)} → ${stage(m.toStage)} · ${qty}${fromSlip ? " (theo phiếu giao)" : ""}${
          m.reversedById != null ? " · đã bị đảo" : ""
        }`;
    items.push({
      key: `m${m.id}`,
      kind: isReverse ? "reverse" : fromSlip ? "slip" : "move",
      text,
      actor: m.actorName,
      at: m.at,
      reversibleMoveId:
        m.docType === "MANUAL" && !isReverse && m.reversedById == null ? m.id : null,
    });
  }
  return items.sort((a, b) => {
    const d = new Date(b.at).getTime() - new Date(a.at).getTime();
    return d !== 0 ? d : b.key.localeCompare(a.key);
  });
}

/* ───────────── Thông số kỹ thuật (chế độ xem) ───────────── */

export interface SpecRow {
  label: string;
  value: string;
  mono?: boolean;
}

/** Hàng nhãn–giá trị; ô trống bị bỏ. `dims` = lineDimsText(node). */
export function buildSpecRows(node: BomTreeNodeRaw, dims: string | null): SpecRow[] {
  const f = buildInitial(node);
  const kind = kindOfCategory(f.category);
  const rows: Array<SpecRow & { show?: boolean }> = [
    { label: "Vật liệu / Ghi chú", value: f.description },
    { label: "Mã vật liệu", value: node.materialCode || f.materialCode, mono: true },
    { label: "Quy cách D×R×C", value: dims ?? f.blankSize, mono: true },
    { label: "PP gia công", value: node.processMethod ?? "" },
    { label: "Xử lý bề mặt", value: node.surfaceTreatment ?? "" },
    { label: "Phôi / Mã đặt hàng", value: node.blankSpec ?? "", mono: true },
    { label: "ĐVT", value: f.uom },
    {
      label: "Hao hụt",
      value: Number(f.scrapPercent) > 0 ? `${f.scrapPercent}%` : "",
    },
  ];
  if (kind === "com") {
    rows.push(
      { label: "Mã NCC", value: f.supplierPartNumber, mono: true },
      { label: "Lead time", value: f.leadTimeDays ? `${f.leadTimeDays} ngày` : "" },
      { label: "MOQ", value: f.moq },
      { label: "Giá mua ước tính", value: f.estimatedPrice ? `${Number(f.estimatedPrice).toLocaleString("vi-VN")} ₫` : "" },
      { label: "Thanh toán", value: f.paymentTerms },
    );
  }
  return rows.filter((r) => r.value && r.value.trim() !== "").map(({ label, value, mono }) => ({ label, value, mono }));
}

/** Thông tin gia công (routing) có dữ liệu để hiện trong card thu gọn không. */
export function hasRoutingData(form: FormState): boolean {
  return !!(
    form.materialCode ||
    form.processRoute.length > 0 ||
    form.estimatedHours ||
    form.technicalNotes
  );
}
