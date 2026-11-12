import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { readAsset } from "@/server/services/bomAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/bom/assets/[id]?size=thumb|full — ảnh BOM (địa chỉ theo nội dung → immutable). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  if (!UUID_RE.test(params.id)) return jsonError("NOT_FOUND", "Không tìm thấy ảnh.", 404);
  const size = req.nextUrl.searchParams.get("size") === "full" ? "full" : "thumb";
  const asset = await readAsset(params.id, size);
  if (!asset) return jsonError("NOT_FOUND", "Không tìm thấy ảnh.", 404);

  return new NextResponse(new Uint8Array(asset.data), {
    status: 200,
    headers: {
      "content-type": asset.mime,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
