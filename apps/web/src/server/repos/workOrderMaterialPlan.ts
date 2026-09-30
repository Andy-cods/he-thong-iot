/**
 * V4.4 (Việc 1) — "Xin vật tư theo BOM": tính nhu cầu vật tư của 1 WO, trừ
 * phần đã xin (ISR/PR gắn wo_id/linked_wo_id), tách phần kho đủ (→ ISR) và
 * phần thiếu (→ PR), rồi tạo cả hai trong 1 lần bấm.
 *
 * Thuật toán THUẦN nằm ở `@/lib/wo-material-plan.ts` (test vitest riêng,
 * không đụng DB) — file này chỉ lo truy vấn + ghép dữ liệu + ghi.
 */
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  bomLine,
  bomTemplate,
  item,
  purchaseRequest,
  purchaseRequestLine,
  warehouseIssueRequest,
  workOrder,
  type PurchaseRequestStatus,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import {
  buildMaterialPlanRows,
  resolveMaterialRequirement,
  round4,
  splitConfirmLines,
  summarizeMaterialStatus,
  type MaterialPlanRow,
  type WoMaterialSource,
  type WoMaterialStatus,
} from "@/lib/wo-material-plan";
import { suggestFifoPicks } from "@/server/repos/warehouseLocation";
import { createPR, submitPR } from "@/server/repos/purchaseRequests";
import { currentYymm, genDocNo } from "@/server/repos/_docNumber";
import { uuidArray } from "@/server/repos/stockGuard";

export class WoMaterialPlanError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "WoMaterialPlanError";
  }
}

export interface WoMaterialPlan {
  woId: string;
  woNo: string;
  plannedQty: number;
  source: WoMaterialSource;
  skippedRows: number;
  status: WoMaterialStatus;
  rows: MaterialPlanRow[];
}

interface PicksJsonLine {
  itemId: string;
  sku?: string | null;
  picks: Array<{ lotSerialId: string; lotCode?: string | null; binId: string; binCode?: string | null; qty: number }>;
}

/** PR không còn "đang mở" nữa — không tính vào phần "đã xin". */
const PR_INACTIVE_STATUSES: PurchaseRequestStatus[] = ["REJECTED", "CANCELLED"];

/** ISR đang tính là "đã xin" (chưa bị từ chối). */
const ISR_REQUESTED_STATUSES = ["PENDING", "COMPLETED"] as const;

export async function getWoMaterialPlan(woId: string): Promise<WoMaterialPlan | null> {
  const [wo] = await db
    .select({
      id: workOrder.id,
      woNo: workOrder.woNo,
      plannedQty: workOrder.plannedQty,
      materialRequirements: workOrder.materialRequirements,
      // Cố ý CHỈ dùng bomTemplateId cho fallback (đọc TOÀN BỘ dòng gốc của
      // BOM) — audit dữ liệu thật (2026-09-30) xác nhận 100% bom_line trên
      // staging là root (parent_line_id IS NULL), không có BOM lồng cấp nào
      // đang dùng thật; bomLineId (SX-16/17) hiện 0/4 WO có set nên chưa có
      // ca thật để phân biệt "children của 1 dòng cụ thể" — không cần thiết
      // kế phức tạp hơn cho trường hợp chưa xảy ra (YAGNI).
      bomTemplateId: workOrder.bomTemplateId,
    })
    .from(workOrder)
    .where(eq(workOrder.id, woId))
    .limit(1);
  if (!wo) return null;

  const plannedQty = Number(wo.plannedQty) || 0;

  let bomLines:
    | Array<{
        componentItemId: string;
        qtyPerParent: number;
        scrapPercent: number;
        sku: string | null;
        name: string | null;
        uom: string | null;
      }>
    | undefined;
  let bomTargetQty: number | null = null;

  // Fallback BOM template — chỉ query khi materialRequirements không đủ (tránh
  // query thừa cho case phổ biến nhất là LSX standalone đã có sẵn Section II).
  const resolvedFirstPass = resolveMaterialRequirement({
    plannedQty,
    materialRequirements: wo.materialRequirements,
  });
  if (resolvedFirstPass.items.length === 0 && wo.bomTemplateId) {
    const [tpl] = await db
      .select({ targetQty: bomTemplate.targetQty })
      .from(bomTemplate)
      .where(eq(bomTemplate.id, wo.bomTemplateId))
      .limit(1);
    bomTargetQty = tpl ? Number(tpl.targetQty) || 1 : 1;

    const lines = await db
      .select({
        componentItemId: bomLine.componentItemId,
        qtyPerParent: bomLine.qtyPerParent,
        scrapPercent: bomLine.scrapPercent,
        sku: item.sku,
        name: item.name,
        uom: item.uom,
      })
      .from(bomLine)
      .leftJoin(item, eq(item.id, bomLine.componentItemId))
      .where(
        and(
          eq(bomLine.templateId, wo.bomTemplateId),
          sql`${bomLine.parentLineId} IS NULL`,
        ),
      );
    bomLines = lines.map((l) => ({
      componentItemId: l.componentItemId,
      qtyPerParent: Number(l.qtyPerParent) || 0,
      scrapPercent: Number(l.scrapPercent) || 0,
      sku: l.sku,
      name: l.name,
      uom: l.uom,
    }));
  }

  const resolved =
    bomLines && bomLines.length > 0
      ? resolveMaterialRequirement({
          plannedQty,
          materialRequirements: wo.materialRequirements,
          bomLines,
          bomTargetQty,
        })
      : resolvedFirstPass;

  if (resolved.items.length === 0) {
    return {
      woId: wo.id,
      woNo: wo.woNo,
      plannedQty,
      source: resolved.source,
      skippedRows: resolved.skippedRows,
      status: "NONE",
      rows: [],
    };
  }

  const itemIds = resolved.items.map((i) => i.itemId);

  // ── Đã xin qua ISR (gắn wo_id) ─────────────────────────────────────────
  const isrRows = await db
    .select({ picksJson: warehouseIssueRequest.picksJson, status: warehouseIssueRequest.status })
    .from(warehouseIssueRequest)
    .where(
      and(
        eq(warehouseIssueRequest.woId, woId),
        inArray(warehouseIssueRequest.status, [...ISR_REQUESTED_STATUSES]),
      ),
    );

  const requestedByItem = new Map<string, number>();
  const issuedByItem = new Map<string, number>();
  for (const r of isrRows) {
    const lines = (r.picksJson as unknown as PicksJsonLine[]) ?? [];
    for (const l of lines) {
      const sum = l.picks.reduce((s, p) => s + (Number(p.qty) || 0), 0);
      requestedByItem.set(l.itemId, round4((requestedByItem.get(l.itemId) ?? 0) + sum));
      if (r.status === "COMPLETED") {
        issuedByItem.set(l.itemId, round4((issuedByItem.get(l.itemId) ?? 0) + sum));
      }
    }
  }

  // ── Đã xin qua PR (gắn linked_wo_id), loại phiếu đã huỷ/từ chối ────────
  const prLineRows = await db
    .select({ itemId: purchaseRequestLine.itemId, qty: purchaseRequestLine.qty })
    .from(purchaseRequestLine)
    .innerJoin(purchaseRequest, eq(purchaseRequest.id, purchaseRequestLine.prId))
    .where(
      and(
        eq(purchaseRequest.linkedWoId, woId),
        notInArray(purchaseRequest.status, PR_INACTIVE_STATUSES),
      ),
    );
  for (const r of prLineRows) {
    if (!r.itemId) continue;
    requestedByItem.set(
      r.itemId,
      round4((requestedByItem.get(r.itemId) ?? 0) + (Number(r.qty) || 0)),
    );
  }

  // ── Tồn khả dụng hiện tại ───────────────────────────────────────────────
  // `uuidArray` bọc ARRAY[...]::uuid[] — `= ANY(a, b, c)` (danh sách trần,
  // không bọc ARRAY[]) là cú pháp SAI, Postgres báo "requires array on right
  // side" (phát hiện qua kiểm E2E thật sau khi migration 0069 được áp).
  const stockRows = await db.execute<{ item_id: string; issuable_qty: string }>(sql`
    SELECT item_id::text AS item_id, issuable_qty::text AS issuable_qty
    FROM app.v_item_stock
    WHERE item_id = ANY(${uuidArray(itemIds)})
  `);
  const availableByItem = new Map(
    (stockRows as unknown as Array<{ item_id: string; issuable_qty: string }>).map((r) => [
      r.item_id,
      Number(r.issuable_qty) || 0,
    ]),
  );

  const rows = buildMaterialPlanRows(resolved.items, requestedByItem, issuedByItem, availableByItem);
  const status = summarizeMaterialStatus(rows);

  return {
    woId: wo.id,
    woNo: wo.woNo,
    plannedQty,
    source: resolved.source,
    skippedRows: resolved.skippedRows,
    status,
    rows,
  };
}

export interface CreateWoMaterialRequestsResult {
  isr: { id: string; requestNo: string; totalQty: number } | null;
  pr: { id: string; code: string; paperFormNo: string | null; totalQty: number } | null;
  plan: WoMaterialPlan;
}

/**
 * Bấm "Xin vật tư" — tính lại toàn bộ nhu cầu NGAY LÚC NÀY (không tin dữ liệu
 * client gửi lên) rồi tạo ISR (phần kho đủ) + PR (phần thiếu) trong 1 lần.
 * Bấm lần 2 chỉ còn phần chưa xin vì `getWoMaterialPlan` luôn trừ đi ISR/PR
 * đã tồn tại của chính WO này.
 */
export async function createWoMaterialRequests(
  woId: string,
  actorUserId: string,
): Promise<CreateWoMaterialRequestsResult> {
  const [woRow] = await db
    .select({ status: workOrder.status })
    .from(workOrder)
    .where(eq(workOrder.id, woId))
    .limit(1);
  if (!woRow) throw new WoMaterialPlanError("WO_NOT_FOUND", "Không tìm thấy lệnh sản xuất.", 404);
  if (woRow.status === "CANCELLED" || woRow.status === "COMPLETED") {
    throw new WoMaterialPlanError(
      "WO_NOT_ACTIVE",
      `Lệnh đã ${woRow.status === "CANCELLED" ? "huỷ" : "hoàn thành"} — không thể xin vật tư.`,
    );
  }

  const plan = await getWoMaterialPlan(woId);
  if (!plan) throw new WoMaterialPlanError("WO_NOT_FOUND", "Không tìm thấy lệnh sản xuất.", 404);

  const { toIsr, toPr } = splitConfirmLines(plan.rows);
  if (toIsr.length === 0 && toPr.length === 0) {
    throw new WoMaterialPlanError(
      "NO_REMAINING",
      plan.rows.length === 0
        ? "Lệnh này chưa có vật tư BOM để xin (chưa nhập Section II hoặc chưa gắn BOM)."
        : "Đã xin đủ vật tư theo BOM cho lệnh này — không còn phần nào cần xin thêm.",
      400,
    );
  }

  let isrResult: CreateWoMaterialRequestsResult["isr"] = null;
  if (toIsr.length > 0) {
    const isrLines: PicksJsonLine[] = [];
    for (const l of toIsr) {
      const suggestion = await suggestFifoPicks(l.itemId, l.qty);
      if (suggestion.picks.length === 0) continue; // race: tồn vừa hết giữa lúc tính plan và lúc tạo
      isrLines.push({
        itemId: l.itemId,
        sku: l.sku,
        picks: suggestion.picks.map((p) => ({
          lotSerialId: p.lotSerialId,
          lotCode: p.lotCode,
          binId: p.binId,
          binCode: p.binFullCode,
          qty: p.qty,
        })),
      });
    }
    const totalQty = round4(
      isrLines.reduce((s, l) => s + l.picks.reduce((sp, p) => sp + p.qty, 0), 0),
    );
    if (isrLines.length > 0 && totalQty > 0) {
      const created = await db.transaction(async (tx) => {
        const no = await genDocNo(tx, {
          table: "app.warehouse_issue_request",
          column: "request_no",
          prefix: `ISR-${currentYymm()}`,
          seqPart: 3,
        });
        const [row] = await tx
          .insert(warehouseIssueRequest)
          .values({
            requestNo: no,
            status: "PENDING",
            reason: "production",
            reference: plan.woNo,
            notes: `Tự động sinh từ "Xin vật tư theo BOM" — ${plan.woNo}`,
            picksJson: isrLines,
            totalQty: String(totalQty),
            requestedBy: actorUserId,
            woId,
          })
          .returning({ id: warehouseIssueRequest.id, requestNo: warehouseIssueRequest.requestNo });
        return row;
      });
      if (created) isrResult = { id: created.id, requestNo: created.requestNo, totalQty };
    }
  }

  let prResult: CreateWoMaterialRequestsResult["pr"] = null;
  if (toPr.length > 0) {
    const pr = await createPR({
      title: `Xin vật tư theo BOM — ${plan.woNo}`,
      source: "MANUAL",
      linkedWoId: woId,
      requestedBy: actorUserId,
      requestReason: `Thiếu vật tư cho lệnh sản xuất ${plan.woNo} (tự động từ "Xin vật tư theo BOM").`,
      formType: "DNVT",
      lines: toPr.map((l) => ({
        itemId: l.itemId,
        itemName: l.name,
        itemSku: l.sku,
        qty: l.qty,
        uom: l.uom,
        category: "MATERIAL",
      })),
    });
    const submitted = (await submitPR(pr.id)) ?? pr;
    prResult = {
      id: submitted.id,
      code: submitted.code,
      paperFormNo: submitted.paperFormNo,
      totalQty: round4(toPr.reduce((s, l) => s + l.qty, 0)),
    };
  }

  const finalPlan = (await getWoMaterialPlan(woId)) ?? plan;

  return { isr: isrResult, pr: prResult, plan: finalPlan };
}
