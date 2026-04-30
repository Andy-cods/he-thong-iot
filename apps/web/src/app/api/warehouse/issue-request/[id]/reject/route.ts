import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { warehouseIssueRequest } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyIssueRequestRejected } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  reason: z.string().trim().min(1, "Cần nhập lý do từ chối").max(500),
});

/** POST /api/warehouse/issue-request/[id]/reject — Kho từ chối yêu cầu. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "po");
  if ("response" in guard) return guard.response;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return jsonError("INVALID_ID", "ID không hợp lệ", 400);
  }

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  const [current] = await db
    .select({
      id: warehouseIssueRequest.id,
      requestNo: warehouseIssueRequest.requestNo,
      status: warehouseIssueRequest.status,
      requestedBy: warehouseIssueRequest.requestedBy,
    })
    .from(warehouseIssueRequest)
    .where(eq(warehouseIssueRequest.id, params.id))
    .limit(1);

  if (!current) return jsonError("NOT_FOUND", "Không tìm thấy", 404);
  if (current.status !== "PENDING") {
    return jsonError(
      "INVALID_STATUS",
      `Yêu cầu đã ${current.status}`,
      409,
    );
  }

  const now = new Date();
  await db
    .update(warehouseIssueRequest)
    .set({
      status: "REJECTED",
      rejectedBy: guard.session.userId,
      rejectReason: body.data.reason,
      rejectedAt: now,
      updatedAt: now,
    })
    .where(eq(warehouseIssueRequest.id, params.id));

  // V3.7.17 — Notify requester về reject
  void notifyIssueRequestRejected({
    requestId: current.id,
    requestNo: current.requestNo,
    actorUserId: guard.session.userId,
    actorUsername: guard.session.username,
    requesterUserId: current.requestedBy,
    reason: body.data.reason,
  });

  await writeAudit({
    actor: guard.session,
    action: "CANCEL",
    objectType: "warehouse_issue_request",
    objectId: params.id,
    after: { requestNo: current.requestNo, reason: body.data.reason },
    notes: `Từ chối ${current.requestNo}: ${body.data.reason}`,
  });

  return NextResponse.json({
    data: { id: params.id, status: "REJECTED" },
  });
}
