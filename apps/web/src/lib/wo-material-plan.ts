/**
 * V4.4 (Việc 1) — "Xin vật tư theo BOM" cho Lệnh sản xuất (WO).
 *
 * THUẦN (không đụng DB) → test được bằng vitest, dùng chung giữa API route và
 * repo `workOrderMaterialPlan.ts`.
 *
 * Bối cảnh dữ liệu thật (audit staging 2026-09-30, xem báo cáo cuối task):
 *   - `work_order.material_requirements` (jsonb) là BOM THẬT của LSX kiểu mới
 *     (form GTAM Section II) — mỗi dòng `{item_id, sku, name, uom, qty,
 *     allocated_qty, warehouse_code}`. `qty` = "Định mức" (tham khảo/đơn vị),
 *     `allocated_qty` = "SL cấp" — tổng SL cần cho CẢ lệnh do người lập gõ tay
 *     (KHÔNG phải qty × plannedQty tự động). Dòng có `item_id = null` là
 *     placeholder chưa gắn vật tư (ví dụ khi mới thêm dòng chưa chọn item) —
 *     BỎ QUA khi tính nhu cầu (không thể tạo ISR/PR cho item không xác định).
 *   - `work_order.bom_template_id`/`bom_line_id` (SX-16/17) hiện 0/4 WO thật
 *     trên staging có set — cơ chế còn sống về code nhưng chưa ai dùng. BOM
 *     thật trong hệ thống là DANH SÁCH PHẲNG (100% bom_line có
 *     `parent_line_id IS NULL` trên mọi template đã kiểm — không có BOM lồng
 *     nhiều cấp trong dữ liệu thực), nên dùng làm fallback khi
 *     `materialRequirements` rỗng/toàn dòng chưa gắn item: lấy toàn bộ dòng
 *     gốc (root) của `bomTemplateId`, quy đổi theo `plannedQty / targetQty`.
 */

const EPS = 1e-6;

/** Làm tròn 4 chữ số (khớp numeric(18,4) toàn hệ thống). */
export function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10_000) / 10_000;
}

export interface ResolvedMaterialRequirement {
  itemId: string;
  sku: string | null;
  name: string | null;
  uom: string | null;
  /** Tổng cần cho CẢ lệnh (đã quy đổi theo plannedQty). */
  required: number;
}

export interface WoBomLineInput {
  componentItemId: string;
  qtyPerParent: number;
  scrapPercent: number;
  sku: string | null;
  name: string | null;
  uom: string | null;
}

/** 1 dòng thô của `work_order.material_requirements` (chấp cả 2 kiểu khoá). */
export interface RawMaterialRequirementRow {
  item_id?: string | null;
  itemId?: string | null;
  sku?: string | null;
  name?: string | null;
  uom?: string | null;
  qty?: number | string | null;
  allocated_qty?: number | string | null;
  allocatedQty?: number | string | null;
}

export type WoMaterialSource = "MANUAL" | "BOM_TEMPLATE" | "NONE";

export interface ResolveMaterialRequirementInput {
  plannedQty: number;
  /** `work_order.material_requirements` (đã JSON.parse nếu là chuỗi). */
  materialRequirements: unknown;
  /** Fallback khi materialRequirements không có dòng hợp lệ nào. */
  bomLines?: WoBomLineInput[];
  /** `bom_template.target_qty` — mặc định 1. */
  bomTargetQty?: number | null;
}

export interface ResolveMaterialRequirementResult {
  source: WoMaterialSource;
  items: ResolvedMaterialRequirement[];
  /** Số dòng material_requirements bị bỏ qua vì chưa gắn item_id. */
  skippedRows: number;
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Tính nhu cầu vật tư của 1 WO — ưu tiên `materialRequirements` (BOM thật của
 * riêng lệnh này, xem comment đầu file); rỗng thì fallback bom_line gốc của
 * `bomTemplateId` (nếu WO có gắn BOM template).
 */
export function resolveMaterialRequirement(
  input: ResolveMaterialRequirementInput,
): ResolveMaterialRequirementResult {
  const plannedQty = Math.max(0, input.plannedQty || 0);
  const rawRows: RawMaterialRequirementRow[] = Array.isArray(
    input.materialRequirements,
  )
    ? (input.materialRequirements as RawMaterialRequirementRow[])
    : [];

  const validRows = rawRows.filter((r) => !!(r?.item_id ?? r?.itemId));
  const skippedRows = rawRows.length - validRows.length;

  if (validRows.length > 0) {
    const byItem = new Map<string, ResolvedMaterialRequirement>();
    for (const r of validRows) {
      const itemId = String(r.item_id ?? r.itemId);
      const allocated = num(r.allocated_qty ?? r.allocatedQty);
      const perUnit = num(r.qty);
      const amount = allocated > EPS ? allocated : round4(perUnit * plannedQty);
      const existing = byItem.get(itemId);
      if (existing) {
        existing.required = round4(existing.required + amount);
      } else {
        byItem.set(itemId, {
          itemId,
          sku: r.sku ?? null,
          name: r.name ?? null,
          uom: r.uom ?? null,
          required: round4(amount),
        });
      }
    }
    return { source: "MANUAL", items: [...byItem.values()], skippedRows };
  }

  const bomLines = input.bomLines ?? [];
  if (bomLines.length > 0) {
    const targetQty = input.bomTargetQty && input.bomTargetQty > 0 ? input.bomTargetQty : 1;
    const multiplier = plannedQty / targetQty;
    const byItem = new Map<string, ResolvedMaterialRequirement>();
    for (const l of bomLines) {
      const amount = round4(l.qtyPerParent * (1 + l.scrapPercent / 100) * multiplier);
      const existing = byItem.get(l.componentItemId);
      if (existing) {
        existing.required = round4(existing.required + amount);
      } else {
        byItem.set(l.componentItemId, {
          itemId: l.componentItemId,
          sku: l.sku,
          name: l.name,
          uom: l.uom,
          required: amount,
        });
      }
    }
    return { source: "BOM_TEMPLATE", items: [...byItem.values()], skippedRows };
  }

  return { source: "NONE", items: [], skippedRows };
}

export interface MaterialPlanRow extends ResolvedMaterialRequirement {
  /** Đã xin (ISR PENDING/COMPLETED gắn wo_id + PR chưa REJECTED/CANCELLED gắn linked_wo_id). */
  alreadyRequested: number;
  /** Đã THỰC XUẤT từ kho (ISR COMPLETED gắn wo_id) — khác "đã xin". */
  alreadyIssued: number;
  /** required − alreadyRequested, không âm. */
  remaining: number;
  /** Tồn khả dụng hiện tại (v_item_stock.issuable_qty), không tính HOLD/giữ chỗ. */
  availableStock: number;
  /** min(remaining, availableStock) — phần sẽ xuất từ kho nếu bấm "Xin vật tư". */
  toIssueFromStock: number;
  /** remaining − toIssueFromStock — phần phải đề xuất mua. */
  shortToBuy: number;
}

/**
 * Ghép nhu cầu (required) với phần đã xin/đã xuất/tồn khả dụng → bảng hiển
 * thị + căn cứ tách ISR/PR. THUẦN — input là các Map đã truy vấn sẵn.
 */
export function buildMaterialPlanRows(
  required: ResolvedMaterialRequirement[],
  alreadyRequestedByItem: Map<string, number>,
  alreadyIssuedByItem: Map<string, number>,
  availableByItem: Map<string, number>,
): MaterialPlanRow[] {
  return required.map((r) => {
    const alreadyRequested = round4(alreadyRequestedByItem.get(r.itemId) ?? 0);
    const alreadyIssued = round4(alreadyIssuedByItem.get(r.itemId) ?? 0);
    const remaining = Math.max(0, round4(r.required - alreadyRequested));
    const availableStock = round4(availableByItem.get(r.itemId) ?? 0);
    const toIssueFromStock = round4(Math.min(remaining, Math.max(0, availableStock)));
    const shortToBuy = Math.max(0, round4(remaining - toIssueFromStock));
    return {
      ...r,
      alreadyRequested,
      alreadyIssued,
      remaining,
      availableStock,
      toIssueFromStock,
      shortToBuy,
    };
  });
}

export type WoMaterialStatus = "NONE" | "SHORTAGE" | "REQUESTED" | "ISSUED";

/** Trạng thái cấp vật tư tổng hợp hiển thị trên trang WO. */
export function summarizeMaterialStatus(rows: MaterialPlanRow[]): WoMaterialStatus {
  if (rows.length === 0) return "NONE";
  const totalRequired = rows.reduce((s, r) => s + r.required, 0);
  if (totalRequired <= EPS) return "NONE";
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  if (totalRemaining > EPS) return "SHORTAGE";
  const totalIssued = rows.reduce((s, r) => s + r.alreadyIssued, 0);
  if (totalIssued >= totalRequired - EPS) return "ISSUED";
  return "REQUESTED";
}

export interface MaterialConfirmLine {
  itemId: string;
  sku: string | null;
  name: string | null;
  uom: string | null;
  qty: number;
}

/** Tách phần "sẽ xuất từ kho" (→ ISR) và phần "thiếu phải mua" (→ PR). */
export function splitConfirmLines(rows: MaterialPlanRow[]): {
  toIsr: MaterialConfirmLine[];
  toPr: MaterialConfirmLine[];
} {
  const toIsr: MaterialConfirmLine[] = [];
  const toPr: MaterialConfirmLine[] = [];
  for (const r of rows) {
    if (r.toIssueFromStock > EPS) {
      toIsr.push({ itemId: r.itemId, sku: r.sku, name: r.name, uom: r.uom, qty: r.toIssueFromStock });
    }
    if (r.shortToBuy > EPS) {
      toPr.push({ itemId: r.itemId, sku: r.sku, name: r.name, uom: r.uom, qty: r.shortToBuy });
    }
  }
  return { toIsr, toPr };
}
