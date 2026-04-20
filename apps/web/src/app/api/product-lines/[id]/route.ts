import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCan } from "@/server/session";
import { jsonError } from "@/server/http";
import {
  getProductLineById,
  updateProductLine,
} from "@/server/repos/productLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const row = await getProductLineById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy dòng sản phẩm.", 404);

  return NextResponse.json({ data: row });
}

export async function PATCH(
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("VALIDATION", parsed.error.message, 400);
  }

  const row = await getProductLineById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy dòng sản phẩm.", 404);

  const updated = await updateProductLine(params.id, parsed.data);
  if (!updated) return jsonError("NOT_FOUND", "Không tìm thấy dòng sản phẩm.", 404);

  return NextResponse.json({ data: updated });
}
