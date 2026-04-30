import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  userAccount,
  warehouseIssueRequest,
} from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError, parseJson } from "@/server/http";
import { requireSession } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyIssueRequestNew } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V3.7.9 — Warehouse issue request endpoints.
 *
 * Workflow: bộ phận khác tạo PENDING → Kho duyệt APPROVED (auto execute OUT_ISSUE).
 */

const STATUS_VALUES = ["PENDING", "APPROVED", "REJECTED", "COMPLETED"] as const;
type IssueStatus = (typeof STATUS_VALUES)[number];

const pickSchema = z.object({
  lotSerialId: z.string().uuid(),
  lotCode: z.string().nullable().optional(),
  binId: z.string().uuid(),
  binCode: z.string().nullable().optional(),
  qty: z.coerce.number().positive(),
});

const lineSchema = z.object({
  itemId: z.string().uuid(),
  sku: z.string().nullable().optional(),
  picks: z.array(pickSchema).min(1),
});

const createSchema = z.object({
  reason: z
    .enum(["production", "sales", "manual", "loss", "return", "other"])
    .default("manual"),
  reference: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Cần ít nhất 1 dòng"),
});

/** GET /api/warehouse/issue-request — list. */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const statusParams = url.searchParams.getAll("status").filter((s) =>
    (STATUS_VALUES as readonly string[]).includes(s),
  ) as IssueStatus[];
  const myOnly = url.searchParams.get("mine") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "30")),
  );

  const conds = [];
  if (statusParams.length > 0) {
    conds.push(inArray(warehouseIssueRequest.status, statusParams));
  }
  if (myOnly) {
    conds.push(eq(warehouseIssueRequest.requestedBy, guard.session.userId));
  }
  const where = conds.length > 0 ? and(...conds) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: warehouseIssueRequest.id,
        requestNo: warehouseIssueRequest.requestNo,
        status: warehouseIssueRequest.status,
        reason: warehouseIssueRequest.reason,
        reference: warehouseIssueRequest.reference,
        notes: warehouseIssueRequest.notes,
        totalQty: warehouseIssueRequest.totalQty,
        picksJson: warehouseIssueRequest.picksJson,
        requestedBy: warehouseIssueRequest.requestedBy,
        requesterUsername: userAccount.username,
        approvedAt: warehouseIssueRequest.approvedAt,
        rejectedAt: warehouseIssueRequest.rejectedAt,
        rejectReason: warehouseIssueRequest.rejectReason,
        completedAt: warehouseIssueRequest.completedAt,
        createdAt: warehouseIssueRequest.createdAt,
      })
      .from(warehouseIssueRequest)
      .leftJoin(
        userAccount,
        eq(userAccount.id, warehouseIssueRequest.requestedBy),
      )
      .where(where ?? sql`true`)
      .orderBy(desc(warehouseIssueRequest.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(warehouseIssueRequest)
      .where(where ?? sql`true`),
  ]);

  return NextResponse.json({
    data: rows,
    meta: { page, pageSize, total: totalRows[0]?.count ?? 0 },
  });
}

/** POST /api/warehouse/issue-request — create new request. */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  const { reason, reference, notes, lines } = body.data;
  const totalQty = lines.reduce(
    (s, l) => s + l.picks.reduce((sp, p) => sp + p.qty, 0),
    0,
  );

  // Generate request_no
  const yymm = new Date().toISOString().slice(2, 7).replace("-", "");
  const cntRows = await db.execute<{ c: number }>(sql`
    SELECT COUNT(*)::int AS c FROM app.warehouse_issue_request
    WHERE request_no LIKE ${`ISR-${yymm}-%`}
  `);
  const cnt =
    (cntRows as unknown as Array<{ c: number }>)[0]?.c ?? 0;
  const requestNo = `ISR-${yymm}-${(cnt + 1).toString().padStart(4, "0")}`;

  try {
    const [created] = await db
      .insert(warehouseIssueRequest)
      .values({
        requestNo,
        status: "PENDING",
        reason,
        reference: reference ?? null,
        notes: notes ?? null,
        picksJson: lines,
        totalQty: String(totalQty),
        requestedBy: guard.session.userId,
      })
      .returning({
        id: warehouseIssueRequest.id,
        requestNo: warehouseIssueRequest.requestNo,
      });

    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "warehouse_issue_request",
      objectId: created!.id,
      after: { requestNo, reason, lines: lines.length, totalQty },
      notes: `Tạo yêu cầu xuất kho ${requestNo} · ${lines.length} SKU · ${totalQty} qty`,
    });

    // V3.7.17 — Notify warehouse role khi có ISR mới
    void notifyIssueRequestNew({
      requestId: created!.id,
      requestNo: created!.requestNo,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      reference: reference ?? null,
      totalQty,
    });

    return NextResponse.json({ data: created });
  } catch (e) {
    return jsonError(
      "ISR_CREATE_FAILED",
      (e as Error).message ?? "Không tạo được yêu cầu",
      500,
    );
  }
}
