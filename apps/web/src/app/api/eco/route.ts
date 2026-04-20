import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { createECO, listECO } from "@/server/repos/ecoChanges";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ECO_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "APPLIED",
  "REJECTED",
] as const;

const listSchema = z.object({
  q: z.string().optional(),
  status: z
    .union([z.enum(ECO_STATUSES), z.array(z.enum(ECO_STATUSES))])
    .optional()
    .transform((s) =>
      s === undefined ? undefined : Array.isArray(s) ? s : [s],
    ),
  bomTemplateId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const actionEnum = z.enum([
  "ADD_LINE",
  "REMOVE_LINE",
  "UPDATE_QTY",
  "UPDATE_SCRAP",
  "REPLACE_COMPONENT",
]);

const createSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().max(2000).nullish(),
  affectedTemplateId: z.string().uuid(),
  oldRevisionId: z.string().uuid().optional().nullable(),
  lines: z
    .array(
      z.object({
        action: actionEnum,
        targetLineId: z.string().uuid().optional().nullable(),
        componentItemId: z.string().uuid().optional().nullable(),
        qtyPerParent: z.number().optional().nullable(),
        scrapPercent: z.number().optional().nullable(),
        description: z.string().optional().nullable(),
      }),
    )
    .default([]),
});

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "eco");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, listSchema);
  if ("response" in q) return q.response;

  try {
    const res = await listECO(q.data);
    return NextResponse.json({
      data: res.rows,
      meta: { page: q.data.page, pageSize: q.data.pageSize, total: res.total },
    });
  } catch (err) {
    logger.error({ err }, "list ECO failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách ECO.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "eco");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  try {
    const eco = await createECO({
      ...body.data,
      description: body.data.description ?? null,
      userId: guard.session.userId,
    });
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "eco_change",
      objectId: eco.id,
      after: { code: eco.code, title: eco.title, lines: body.data.lines.length },
      ...meta,
    });
    return NextResponse.json({ data: eco }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create ECO failed");
    return jsonError("INTERNAL", "Lỗi tạo ECO.", 500);
  }
}
