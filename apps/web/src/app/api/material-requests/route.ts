import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createMaterialRequest,
  listMaterialRequests,
  type MaterialRequestStatus,
} from "@/server/repos/materialRequests";
import { jsonError, parseJson } from "@/server/http";
import { requireSession } from "@/server/session";
import {
  notifyMaterialRequestNew,
  lookupUsername,
} from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALUES = ["PENDING", "PICKING", "READY", "DELIVERED", "CANCELLED"] as const;

const createSchema = z.object({
  bomTemplateId: z.string().uuid().nullable().optional(),
  woId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        requestedQty: z.coerce.number().positive(),
        notes: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1, "Cần ít nhất 1 dòng linh kiện"),
});

/** GET /api/material-requests — list theo filter status/requester. */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const statusParams = url.searchParams.getAll("status").filter((s) =>
    (STATUS_VALUES as readonly string[]).includes(s),
  ) as MaterialRequestStatus[];
  const requestedBy = url.searchParams.get("requestedBy");
  const bomTemplateId = url.searchParams.get("bomTemplateId");
  const myOnly = url.searchParams.get("mine") === "1";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "30")),
  );

  try {
    const result = await listMaterialRequests({
      status: statusParams.length > 0 ? statusParams : undefined,
      requestedBy: myOnly
        ? guard.session.userId
        : requestedBy ?? undefined,
      bomTemplateId: bomTemplateId ?? undefined,
      page,
      pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: { page, pageSize, total: result.total },
    });
  } catch (e) {
    return jsonError(
      "MR_LIST_FAILED",
      (e as Error).message ?? "Không lấy được danh sách yêu cầu",
      500,
    );
  }
}

/** POST /api/material-requests — engineer tạo yêu cầu. */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "admin", "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  try {
    const created = await createMaterialRequest({
      requestedBy: guard.session.userId,
      bomTemplateId: body.data.bomTemplateId ?? null,
      woId: body.data.woId ?? null,
      notes: body.data.notes ?? null,
      lines: body.data.lines,
    });

    // Emit notification (fire-and-forget)
    const actorUsername =
      guard.session.username ??
      (await lookupUsername(guard.session.userId)) ??
      "system";
    void notifyMaterialRequestNew({
      requestId: created.id,
      requestNo: created.requestNo,
      actorUserId: guard.session.userId,
      actorUsername,
      requesterUserId: guard.session.userId,
      itemSummary: `${body.data.lines.length} dòng linh kiện`,
    });

    return NextResponse.json({
      data: { id: created.id, requestNo: created.requestNo },
    });
  } catch (e) {
    return jsonError(
      "MR_CREATE_FAILED",
      (e as Error).message ?? "Không tạo được yêu cầu",
      500,
    );
  }
}
