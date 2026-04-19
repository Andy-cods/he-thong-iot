import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  addCheck,
  listChecks,
  seedDefaultCheckpoints,
} from "@/server/repos/qcChecks";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listSchema = z.object({
  woId: z.string().uuid(),
  seedDefaults: z.coerce.boolean().optional(),
});

const createSchema = z.object({
  woId: z.string().uuid(),
  checkpointName: z.string().min(1).max(128),
  checkpoint: z.enum(["PRE_ASSEMBLY", "MID_PRODUCTION", "PRE_FG"]).optional(),
  result: z.enum(["PASS", "FAIL", "NA"]).optional(),
  note: z.string().max(1024).optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, listSchema);
  if ("response" in q) return q.response;

  try {
    let checks = await listChecks(q.data.woId);
    // Auto-seed 3 preset nếu chưa có và flag seedDefaults=true
    if (checks.length === 0 && q.data.seedDefaults) {
      checks = await seedDefaultCheckpoints(
        q.data.woId,
        guard.session.userId,
      );
    }
    return NextResponse.json({ data: checks });
  } catch (err) {
    logger.error({ err }, "list QC checks failed");
    return jsonError("INTERNAL", "Lỗi tải QC checks.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(
    req,
    "admin",
    "planner",
    "operator",
    "warehouse",
  );
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, createSchema);
  if ("response" in body) return body.response;

  try {
    const check = await addCheck({
      ...body.data,
      userId: guard.session.userId,
    });
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "QC_CHECK",
      objectType: "qc_check",
      objectId: check.id,
      after: {
        woId: body.data.woId,
        checkpoint: body.data.checkpoint,
        result: body.data.result,
      },
      notes: `QC ${body.data.checkpointName}: ${body.data.result ?? "PENDING"}`,
      ...meta,
    });
    return NextResponse.json({ data: check }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create QC check failed");
    return jsonError("INTERNAL", "Lỗi tạo QC check.", 500);
  }
}
