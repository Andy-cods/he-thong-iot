import { NextResponse, type NextRequest } from "next/server";
import { STAGE_LABELS_BY_CATEGORY, stagesFor } from "@iot/shared";
import { logger } from "@/lib/logger";
import { jsonError } from "@/server/http";
import { getBucketsForTemplate } from "@/server/repos/bomStageMoves";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BOM V5 / WP6 — bucket theo bước của MỌI dòng trong template (1 query).
 * Quyền: read bomTemplate (ai xem được BOM thì thấy hành trình).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  try {
    const lines = await getBucketsForTemplate(params.id);
    const categories = Object.fromEntries(
      (["GTAM", "OUTSOURCED", "COMMERCIAL", "OTHER"] as const).map((c) => [
        c,
        stagesFor(c).map((code, i) => ({ code, label: STAGE_LABELS_BY_CATEGORY[c][i]! })),
      ]),
    );
    return NextResponse.json({ data: { lines, categories } });
  } catch (err) {
    logger.error({ err, templateId: params.id }, "get bom stages failed");
    return jsonError("INTERNAL", "Không tải được hành trình.", 500);
  }
}
