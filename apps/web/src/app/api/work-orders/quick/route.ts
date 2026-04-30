import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import {
  item as itemTable,
  warehouseIssueRequest,
  workOrder,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { suggestFifoPicks } from "@/server/repos/warehouseLocation";
import { jsonError, parseJson } from "@/server/http";
import { requireSession } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyIssueRequestNew } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.10 — POST /api/work-orders/quick
 *
 * Tạo WO nhanh không qua snapshot system:
 *   1. INSERT work_order (status RELEASED, materialRequirements=lines)
 *   2. Auto-FIFO computes picks cho từng material line
 *   3. INSERT warehouse_issue_request PENDING với picks_json
 *      → Kho duyệt → execute OUT_ISSUE
 *
 * Body:
 *   - productItemId: uuid
 *   - plannedQty: number > 0
 *   - woNo: string? (auto WO-YYMM-XXXX nếu để trống)
 *   - priority: LOW/NORMAL/HIGH/URGENT
 *   - plannedStart / plannedEnd: ISO date strings (optional)
 *   - notes: string?
 *   - materials: [{ itemId, qty }] (>= 1)
 */

const materialLine = z.object({
  itemId: z.string().uuid(),
  qty: z.coerce.number().positive(),
});

const schema = z.object({
  productItemId: z.string().uuid(),
  plannedQty: z.coerce.number().positive(),
  woNo: z.string().trim().max(64).optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  plannedStart: z.string().optional().nullable(),
  plannedEnd: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  materials: z.array(materialLine).min(1, "Cần ít nhất 1 vật tư"),
});

export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  const { productItemId, plannedQty, priority, plannedStart, plannedEnd, notes, materials } = body.data;

  // Validate product
  const [product] = await db
    .select({ id: itemTable.id, sku: itemTable.sku, name: itemTable.name })
    .from(itemTable)
    .where(eq(itemTable.id, productItemId))
    .limit(1);
  if (!product) {
    return jsonError("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm", 404);
  }

  // Generate woNo
  let woNo = body.data.woNo?.trim() ?? "";
  if (!woNo) {
    const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
    const cntRows = await db.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c FROM app.work_order
      WHERE wo_no LIKE ${`WO-${yymm}-%`}
    `);
    const cnt = (cntRows as unknown as Array<{ c: number }>)[0]?.c ?? 0;
    woNo = `WO-${yymm}-${(cnt + 1).toString().padStart(4, "0")}`;
  }

  // Auto-FIFO picks for each material line
  const picksJson: Array<{
    itemId: string;
    sku: string;
    requestedQty: number;
    picks: Array<{
      lotSerialId: string;
      lotCode: string | null;
      binId: string;
      binCode: string | null;
      qty: number;
    }>;
    shortage: number;
  }> = [];
  let totalQty = 0;
  let totalShortage = 0;

  for (const m of materials) {
    const [matItem] = await db
      .select({ sku: itemTable.sku })
      .from(itemTable)
      .where(eq(itemTable.id, m.itemId))
      .limit(1);
    if (!matItem) {
      return jsonError(
        "MATERIAL_NOT_FOUND",
        `Vật tư ${m.itemId.slice(0, 8)} không tồn tại`,
        404,
      );
    }
    const fifo = await suggestFifoPicks(m.itemId, m.qty);
    picksJson.push({
      itemId: m.itemId,
      sku: matItem.sku,
      requestedQty: m.qty,
      picks: fifo.picks.map((p) => ({
        lotSerialId: p.lotSerialId,
        lotCode: p.lotCode,
        binId: p.binId,
        binCode: p.binFullCode,
        qty: p.qty,
      })),
      shortage: fifo.shortage,
    });
    totalQty += fifo.covered;
    totalShortage += fifo.shortage;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // INSERT work_order
      const [wo] = await tx
        .insert(workOrder)
        .values({
          woNo,
          productItemId,
          plannedQty: String(plannedQty),
          status: "RELEASED",
          priority,
          plannedStart: plannedStart || null,
          plannedEnd: plannedEnd || null,
          notes: notes ?? null,
          materialRequirements: materials,
          releasedAt: new Date(),
          createdBy: guard.session.userId,
        })
        .returning({
          id: workOrder.id,
          woNo: workOrder.woNo,
        });

      // Generate ISR no
      const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
      const isrCnt = await tx.execute<{ c: number }>(sql`
        SELECT COUNT(*)::int AS c FROM app.warehouse_issue_request
        WHERE request_no LIKE ${`ISR-${yymm}-%`}
      `);
      const cnt =
        (isrCnt as unknown as Array<{ c: number }>)[0]?.c ?? 0;
      const requestNo = `ISR-${yymm}-${(cnt + 1)
        .toString()
        .padStart(4, "0")}`;

      // INSERT warehouse_issue_request linked to WO
      const [request] = await tx
        .insert(warehouseIssueRequest)
        .values({
          requestNo,
          status: "PENDING",
          reason: "production",
          reference: wo!.woNo,
          notes: `WO ${wo!.woNo} · ${product.sku} · ${plannedQty}`,
          picksJson: picksJson.map((l) => ({
            itemId: l.itemId,
            sku: l.sku,
            picks: l.picks,
          })),
          totalQty: String(totalQty),
          requestedBy: guard.session.userId,
        })
        .returning({
          id: warehouseIssueRequest.id,
          requestNo: warehouseIssueRequest.requestNo,
        });

      return { wo: wo!, request: request! };
    });

    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "work_order",
      objectId: result.wo.id,
      after: {
        woNo: result.wo.woNo,
        productSku: product.sku,
        plannedQty,
        materials: materials.length,
        requestNo: result.request.requestNo,
      },
      notes: `Tạo WO nhanh ${result.wo.woNo} → ${result.request.requestNo} (${materials.length} vật tư)`,
    });

    // V3.7.17 — Notify warehouse role có ISR mới chờ duyệt
    void notifyIssueRequestNew({
      requestId: result.request.id,
      requestNo: result.request.requestNo,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      reference: result.wo.woNo,
      totalQty,
    });

    return NextResponse.json({
      data: {
        woId: result.wo.id,
        woNo: result.wo.woNo,
        requestId: result.request.id,
        requestNo: result.request.requestNo,
        totalQty,
        totalShortage,
        materials: picksJson,
      },
    });
  } catch (e) {
    return jsonError(
      "WO_QUICK_FAILED",
      (e as Error).message ?? "Không tạo được WO",
      500,
    );
  }
}
