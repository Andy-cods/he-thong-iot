import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SKU_REGEX } from "@iot/shared";
import { checkSkuExists } from "@/server/repos/items";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  sku: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .transform((v) => v.toUpperCase())
    .refine((v) => SKU_REGEX.test(v), {
      message: "Mã không hợp lệ",
    }),
});

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;

  const parsed = parseSearchParams(req, querySchema);
  if ("response" in parsed) return parsed.response;
  try {
    const exists = await checkSkuExists(parsed.data.sku);
    return NextResponse.json({ data: { exists } });
  } catch {
    return jsonError("INTERNAL", "Lỗi khi kiểm tra SKU.", 500);
  }
}
