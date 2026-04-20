import { NextResponse, type NextRequest } from "next/server";
import { requireCan } from "@/server/session";
import { jsonError } from "@/server/http";
import {
  getGridSnapshot,
  getTemplateById,
  saveGridSnapshot,
} from "@/server/repos/bomTemplates";
import { insertActivityLog } from "@/server/repos/activityLogs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  const snapshot = await getGridSnapshot(params.id);
  return NextResponse.json({ data: snapshot });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  let body: { snapshot?: unknown };
  try {
    body = (await req.json()) as { snapshot?: unknown };
  } catch {
    return jsonError("INVALID_BODY", "Body không hợp lệ.", 400);
  }

  if (!body.snapshot || typeof body.snapshot !== "object" || Array.isArray(body.snapshot)) {
    return jsonError("INVALID_BODY", "Thiếu snapshot.", 400);
  }

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  if (template.status === "OBSOLETE") {
    return jsonError("FORBIDDEN", "Không thể sửa BOM đã ngừng dùng.", 403);
  }

  const ok = await saveGridSnapshot(params.id, body.snapshot as Record<string, unknown>);
  if (!ok) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  // Fire-and-forget activity log — don't block response
  void insertActivityLog({
    userId: guard.session.userId,
    entityType: "bom_template",
    entityId: params.id,
    action: "GRID_SAVE",
    diffJson: { savedAt: new Date().toISOString() },
    ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ data: { saved: true } });
}
