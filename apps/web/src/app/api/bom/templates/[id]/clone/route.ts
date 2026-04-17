import { NextResponse, type NextRequest } from "next/server";
import { bomTemplateCloneSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  checkCodeAvailable,
  cloneTemplate,
} from "@/server/repos/bomTemplates";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bomTemplateCloneSchema);
  if ("response" in body) return body.response;

  const available = await checkCodeAvailable(body.data.newCode);
  if (!available) {
    return jsonError(
      "BOM_CODE_DUPLICATE",
      `Mã BOM "${body.data.newCode}" đã tồn tại.`,
      409,
    );
  }

  try {
    const result = await cloneTemplate(
      params.id,
      body.data.newCode,
      body.data.newName ?? null,
      guard.session.userId,
    );
    if (!result) return jsonError("NOT_FOUND", "Không tìm thấy BOM nguồn.", 404);

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "bom_template",
      objectId: result.template.id,
      after: {
        ...result.template,
        clonedFrom: params.id,
        lineCount: result.lineCount,
      },
      notes: `clone from ${params.id}`,
      ...meta,
    });
    return NextResponse.json(
      { data: { template: result.template, lineCount: result.lineCount } },
      { status: 201 },
    );
  } catch (err) {
    logger.error({ err, id: params.id }, "clone bom template failed");
    return jsonError("INTERNAL", "Không clone được BOM.", 500);
  }
}
