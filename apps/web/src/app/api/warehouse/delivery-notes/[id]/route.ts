import { NextResponse, type NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { userAccount, warehouseIssueRequest } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import {
  getDeliveryNote,
  getDeliveryNoteLines,
} from "@/server/repos/deliveryNotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/warehouse/delivery-notes/[id] — chi tiết phiếu giao hàng + dòng hàng hoá. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "deliveryNote");
  if ("response" in guard) return guard.response;

  const row = await getDeliveryNote(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy phiếu giao hàng.", 404);

  const lines = await getDeliveryNoteLines(params.id);

  const [issueRequest] = await db
    .select({ requestNo: warehouseIssueRequest.requestNo })
    .from(warehouseIssueRequest)
    .where(eq(warehouseIssueRequest.id, row.issueRequestId))
    .limit(1);

  const userIds = [row.deliveredBy, row.confirmedBy, row.rejectedBy].filter(
    (x): x is string => !!x,
  );
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await db
      .select({ id: userAccount.id, fullName: userAccount.fullName })
      .from(userAccount)
      .where(inArray(userAccount.id, userIds));
    for (const u of users) nameMap.set(u.id, u.fullName);
  }

  return NextResponse.json({
    data: {
      ...row,
      lines,
      issueRequestNo: issueRequest?.requestNo ?? null,
      deliveredByName: nameMap.get(row.deliveredBy) ?? null,
      confirmedByName: row.confirmedBy ? nameMap.get(row.confirmedBy) ?? null : null,
      rejectedByName: row.rejectedBy ? nameMap.get(row.rejectedBy) ?? null : null,
    },
  });
}
