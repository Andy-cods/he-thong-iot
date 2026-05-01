/**
 * V3.7.43 — POST /api/purchase-orders/from-bom-line/[lineId]
 * Tạo PO subcontract từ BOM line "Đặt gia công ngoài".
 *
 * Body:
 *   - supplierId: required UUID (NCC gia công)
 *   - orderedQty: positive number (default = bom_line.metadata.totalQty)
 *   - unitPrice: optional (default 0 — TM-A chốt sau)
 *   - spec: optional string (Vật liệu/Quy cách)
 *   - expectedEta: optional ISO date
 *   - notes: optional
 *
 * Output: PO mới với poType="SUBCONTRACT" status="DRAFT".
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { item as itemTable } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { getLineById } from "@/server/repos/bomLines";
import { createPO } from "@/server/repos/purchaseOrders";
import { writeAudit } from "@/server/services/audit";
import { emitNotification } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  supplierId: z.string().uuid(),
  orderedQty: z.coerce.number().positive().optional(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  spec: z.string().trim().max(255).optional().nullable(),
  expectedEta: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { lineId: string } },
) {
  // RBAC: planner + admin được tạo PO subcontract trực tiếp từ BOM line.
  // (Purchaser cũng có thể tạo PO commercial nhưng subcontract thường do
  // planner đề xuất.)
  const guard = await requireCan(req, "create", "po");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;

  const line = await getLineById(params.lineId);
  if (!line) return jsonError("NOT_FOUND", "Không tìm thấy BOM line.", 404);
  if (!line.componentItemId) {
    return jsonError("INVALID_LINE", "BOM line chưa link item.", 400);
  }

  // Lấy metadata để default qty + spec
  const meta = (line.metadata ?? {}) as {
    totalQty?: string | number;
    size?: string;
    category?: string;
  };
  const defaultQty =
    body.data.orderedQty ??
    (Number(meta.totalQty ?? 0) || Number(line.qtyPerParent ?? 0));
  if (defaultQty <= 0) {
    return jsonError(
      "INVALID_QTY",
      "Số lượng phải > 0 (cung cấp orderedQty hoặc set metadata.totalQty).",
      400,
    );
  }

  // Verify item exists
  const [it] = await db
    .select({ id: itemTable.id, sku: itemTable.sku, name: itemTable.name })
    .from(itemTable)
    .where(eq(itemTable.id, line.componentItemId))
    .limit(1);
  if (!it) return jsonError("ITEM_NOT_FOUND", "Item không tồn tại.", 404);

  // Compose spec từ body hoặc metadata.size
  const composedSpec =
    body.data.spec ??
    (meta.size ? `Quy cách: ${meta.size}` : null);

  try {
    const po = await createPO({
      supplierId: body.data.supplierId,
      poType: "SUBCONTRACT",
      expectedEta: body.data.expectedEta
        ? new Date(body.data.expectedEta)
        : null,
      notes:
        body.data.notes ??
        `Đặt gia công ngoài cho linh kiện ${it.sku}${
          line.description ? ` — ${line.description}` : ""
        }`,
      createdBy: guard.session.userId,
      lines: [
        {
          itemId: line.componentItemId,
          orderedQty: defaultQty,
          unitPrice: body.data.unitPrice ?? 0,
          taxRate: 8,
          spec: composedSpec,
          notes: body.data.notes ?? null,
        },
      ],
    });

    // Audit
    const reqMeta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "purchase_order",
      objectId: po.id,
      after: {
        poNo: po.poNo,
        poType: "SUBCONTRACT",
        supplierId: body.data.supplierId,
        bomLineId: params.lineId,
      },
      notes: `Subcontract PO from BOM line ${it.sku}`,
      ...reqMeta,
    });

    // Notify TM-A (purchaser) về PO subcontract DRAFT cần chốt giá + duyệt.
    await emitNotification({
      recipientRole: "purchaser",
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      eventType: "PO_SUBCONTRACT_DRAFT",
      entityType: "purchase_order",
      entityId: po.id,
      entityCode: po.poNo,
      title: `Đơn gia công ngoài: ${po.poNo}`,
      message: `Linh kiện ${it.sku} qty=${defaultQty}. Cần chốt đơn giá + duyệt.`,
      link: `/procurement/purchase-orders/${po.id}`,
      severity: "info",
    }).catch((err) => {
      logger.warn({ err, poId: po.id }, "notify subcontract PO failed");
    });

    return NextResponse.json({ data: po }, { status: 201 });
  } catch (err) {
    logger.error(
      { err, lineId: params.lineId },
      "create subcontract PO from BOM line failed",
    );
    return jsonError(
      "INTERNAL",
      `Không tạo được PO gia công ngoài: ${(err as Error).message}`,
      500,
    );
  }
}
