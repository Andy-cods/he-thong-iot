import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { bomLine } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { requireSession } from "@/server/session";
import { writeAudit } from "@/server/services/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.19 — POST /api/bom-lines/[id]/pic-update
 *
 * PIC update tiến độ row mình phụ trách:
 *   - received_qty (SL đã về)
 *   - expected_eta (ngày NCC giao)
 *   - status_note (note ngắn)
 *
 * RBAC:
 *   - admin: full access
 *   - assigned_to_user_id == current user: được update row đó
 *   - khác: 403
 */
const schema = z.object({
  receivedQty: z.coerce.number().nonnegative().optional(),
  expectedEta: z.string().nullable().optional(),
  statusNote: z.string().trim().max(255).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "Bom line id không hợp lệ", 400);
  }

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  // Load row to check permission
  const [line] = await db
    .select({
      id: bomLine.id,
      assignedToUserId: bomLine.assignedToUserId,
      assignedToName: bomLine.assignedToName,
      receivedQty: bomLine.receivedQty,
      qtyPerParent: bomLine.qtyPerParent,
    })
    .from(bomLine)
    .where(eq(bomLine.id, params.id))
    .limit(1);

  if (!line) return jsonError("NOT_FOUND", "Không tìm thấy dòng BOM", 404);

  // RBAC: admin OR assigned PIC
  const isAdmin = guard.session.roles.includes("admin");
  const isPic = line.assignedToUserId === guard.session.userId;
  if (!isAdmin && !isPic) {
    return jsonError(
      "FORBIDDEN",
      `Chỉ PIC (${line.assignedToName ?? "?"}) hoặc admin được update dòng này.`,
      403,
    );
  }

  // Build update patch (only fields provided)
  const patch: Record<string, unknown> = {
    picUpdatedAt: new Date(),
    picUpdatedBy: guard.session.userId,
    updatedAt: new Date(),
  };
  if (body.data.receivedQty !== undefined) {
    patch.receivedQty = String(body.data.receivedQty);
  }
  if (body.data.expectedEta !== undefined) {
    patch.expectedEta = body.data.expectedEta || null;
  }
  if (body.data.statusNote !== undefined) {
    patch.statusNote = body.data.statusNote || null;
  }

  const [updated] = await db
    .update(bomLine)
    .set(patch)
    .where(eq(bomLine.id, params.id))
    .returning({
      id: bomLine.id,
      receivedQty: bomLine.receivedQty,
      expectedEta: bomLine.expectedEta,
      statusNote: bomLine.statusNote,
      picUpdatedAt: bomLine.picUpdatedAt,
    });

  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "bom_line",
    objectId: params.id,
    before: {
      receivedQty: line.receivedQty,
    },
    after: {
      receivedQty: updated?.receivedQty,
      expectedEta: updated?.expectedEta,
      statusNote: updated?.statusNote,
    },
    notes: `PIC update bởi ${guard.session.username ?? "?"}`,
  });

  return NextResponse.json({ data: updated });
}
