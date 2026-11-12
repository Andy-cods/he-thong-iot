import { inArray, eq } from "drizzle-orm";
import { bomLine, bomTemplate, item } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/server/services/notifications";
import {
  planSlipAssemblyCreated,
  planSlipSurfaceCreated,
  planSlipSurfaceReceived,
  planStageMoved,
  type HandoffLine,
} from "@/server/services/bom-stage-notify";
import type { NotifyPlan } from "@/server/services/notification-plans";

/**
 * BOM V5 — lớp DB mỏng quanh bom-stage-notify.ts (thuần). Gọi SAU khi
 * transaction thành công; mọi lỗi chỉ log (không làm fail request).
 */

interface Actor {
  userId: string;
  fullName?: string | null;
  username?: string | null;
}

async function loadTemplateCode(templateId: string): Promise<string> {
  const [t] = await db
    .select({ code: bomTemplate.code })
    .from(bomTemplate)
    .where(eq(bomTemplate.id, templateId))
    .limit(1);
  return t?.code ?? "BOM";
}

async function loadLineLabels(lineIds: readonly string[]): Promise<Map<string, string>> {
  if (lineIds.length === 0) return new Map();
  const rows = await db
    .select({ id: bomLine.id, pos: bomLine.positionCode, name: item.name })
    .from(bomLine)
    .innerJoin(item, eq(item.id, bomLine.componentItemId))
    .where(inArray(bomLine.id, [...new Set(lineIds)]));
  return new Map(rows.map((r) => [r.id, r.pos || r.name || r.id.slice(0, 8)]));
}

const actorFields = (a: Actor) => ({
  actorUserId: a.userId,
  actorUsername: a.fullName ?? a.username ?? null,
});

async function send(tag: string, build: () => Promise<NotifyPlan | null>): Promise<void> {
  try {
    const plan = await build();
    if (plan) await dispatchNotification(plan);
  } catch (err) {
    logger.warn({ err, tag }, "bom stage notify failed");
  }
}

/** Chuyển bước thủ công (single/bulk) — theo bước ĐÍCH. */
export function notifyBomStageMoved(
  templateId: string,
  items: ReadonlyArray<{ lineId: string; to: string; qty: number }>,
  actor: Actor,
): Promise<void> {
  return send("stage-moved", async () => {
    const [code, labels] = await Promise.all([
      loadTemplateCode(templateId),
      loadLineLabels(items.map((i) => i.lineId)),
    ]);
    return planStageMoved({
      templateId,
      templateCode: code,
      ...actorFields(actor),
      moves: items.map((i) => ({
        lineId: i.lineId,
        label: labels.get(i.lineId) ?? "",
        qty: i.qty,
        toStage: i.to,
      })),
    });
  });
}

interface SlipLike {
  id: string;
  slipNo: string;
  templateId: string;
}
interface SlipLineLike {
  id: string;
  lineId: string;
  qtyDoc: string;
  snap: unknown;
}

const snapOf = (l: SlipLineLike) =>
  (l.snap ?? {}) as { positionCode?: string | null; name?: string; recipient?: { name?: string } };

function slipCtx(
  slip: SlipLike,
  code: string,
  lines: HandoffLine[],
  supplierName: string | null,
  actor: Actor,
) {
  return {
    templateId: slip.templateId,
    templateCode: code,
    slipId: slip.id,
    slipNo: slip.slipNo,
    lines,
    supplierName,
    ...actorFields(actor),
  };
}

/** Tạo phiếu giao: SURFACE → Kho; ASSEMBLY → Vận hành + Kế hoạch. */
export function notifySlipCreated(
  kind: "SURFACE" | "ASSEMBLY",
  slip: SlipLike,
  lines: readonly SlipLineLike[],
  actor: Actor,
): Promise<void> {
  return send("slip-created", async () => {
    const code = await loadTemplateCode(slip.templateId);
    const hl = lines.map((l) => ({
      lineId: l.lineId,
      label: snapOf(l).positionCode || snapOf(l).name || "",
      qty: Number(l.qtyDoc) || 0,
    }));
    const supplier = lines[0] ? (snapOf(lines[0]).recipient?.name ?? null) : null;
    const ctx = slipCtx(slip, code, hl, supplier, actor);
    return kind === "SURFACE" ? planSlipSurfaceCreated(ctx) : planSlipAssemblyCreated(ctx);
  });
}

/** Nhận hàng về phiếu SURFACE → QC. `received` = SL nhận THÊM lần này theo slipLineId. */
export function notifySlipReceived(
  slip: SlipLike,
  lines: readonly SlipLineLike[],
  received: ReadonlyArray<{ slipLineId: string; qty: number }>,
  actor: Actor,
): Promise<void> {
  return send("slip-received", async () => {
    const code = await loadTemplateCode(slip.templateId);
    const qtyBy = new Map<string, number>();
    for (const r of received) qtyBy.set(r.slipLineId, (qtyBy.get(r.slipLineId) ?? 0) + r.qty);
    const hl: HandoffLine[] = [];
    for (const l of lines) {
      const q = qtyBy.get(l.id);
      if (!q) continue;
      hl.push({ lineId: l.lineId, label: snapOf(l).positionCode || snapOf(l).name || "", qty: q });
    }
    if (hl.length === 0) return null;
    const first = lines[0];
    const supplier = first ? (snapOf(first).recipient?.name ?? null) : null;
    return planSlipSurfaceReceived(slipCtx(slip, code, hl, supplier, actor));
  });
}
