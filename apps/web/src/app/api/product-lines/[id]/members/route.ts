import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCan } from "@/server/session";
import { jsonError } from "@/server/http";
import {
  getProductLineById,
  getProductLineMembers,
  addProductLineMember,
} from "@/server/repos/productLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const pl = await getProductLineById(params.id);
  if (!pl) return jsonError("NOT_FOUND", "Không tìm thấy dòng sản phẩm.", 404);

  const members = await getProductLineMembers(params.id);
  return NextResponse.json({ data: members });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("INVALID_BODY", "Body không hợp lệ.", 400);
  }

  const parsed = z.object({ bomTemplateId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) {
    return jsonError("VALIDATION", "Thiếu bomTemplateId.", 400);
  }

  const pl = await getProductLineById(params.id);
  if (!pl) return jsonError("NOT_FOUND", "Không tìm thấy dòng sản phẩm.", 404);

  const member = await addProductLineMember(params.id, parsed.data.bomTemplateId);
  return NextResponse.json({ data: member }, { status: 201 });
}
