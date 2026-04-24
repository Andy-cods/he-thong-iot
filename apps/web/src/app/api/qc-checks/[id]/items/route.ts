import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  bulkCreateItems,
  listItemsByCheck,
} from "@/server/repos/qcCheckItems";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/qc-checks/[id]/items — list items của 1 stage. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "wo");
  if ("response" in guard) return guard.response;

  try {
    const rows = await listItemsByCheck(params.id);
    return NextResponse.json({ data: rows, meta: { total: rows.length } });
  } catch (err) {
    logger.error({ err, id: params.id }, "list QC items failed");
    return jsonError("INTERNAL", "Lỗi tải QC items.", 500);
  }
}

const postSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        checkType: z.enum(["BOOLEAN", "MEASUREMENT", "VISUAL"]).optional(),
        expectedValue: z.string().max(100).optional().nullable(),
        sortOrder: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(50),
});

/** POST /api/qc-checks/[id]/items — bulk thêm (1..50 items). */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, postSchema);
  if ("response" in body) return body.response;

  try {
    const rows = await bulkCreateItems({
      qcCheckId: params.id,
      items: body.data.items.map((i) => ({
        description: i.description,
        checkType: i.checkType,
        expectedValue: i.expectedValue ?? null,
        sortOrder: i.sortOrder,
      })),
    });
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "QC_CHECK",
      objectType: "qc_check",
      objectId: params.id,
      after: { bulkAddedItems: rows.length },
      notes: `QC items: thêm ${rows.length} mục`,
      ...meta,
    });
    return NextResponse.json({ data: rows }, { status: 201 });
  } catch (err) {
    logger.error({ err, id: params.id }, "bulk create QC items failed");
    return jsonError("INTERNAL", "Lỗi tạo QC items.", 500);
  }
}
