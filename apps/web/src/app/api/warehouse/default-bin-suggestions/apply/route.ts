import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { applyDefaultBinSuggestions } from "@/server/repos/defaultBinSuggestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, "Chọn ít nhất 1 vật tư").max(2000),
});

/**
 * V4.3 Việc 1 — POST /api/warehouse/default-bin-suggestions/apply
 *
 * Áp dụng hàng loạt các đề xuất Kho đã chọn (checkbox trên UI). Tính LẠI đề
 * xuất trên server (không tin `binId` client gửi) — item nào không còn suy ra
 * được (dữ liệu đổi giữa lúc xem và lúc áp dụng) sẽ nằm trong `skipped`.
 */
export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "update", "inventory");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const result = await applyDefaultBinSuggestions(body.data.itemIds, guard.session.userId);

    if (result.applied.length > 0) {
      await writeAudit({
        actor: guard.session,
        action: "UPDATE",
        objectType: "item_default_bin_bulk",
        after: { applied: result.applied, count: result.applied.length },
        notes: `Áp dụng đề xuất vị trí mặc định hàng loạt — ${result.applied.length} vật tư.`,
      });
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    return jsonError(
      "APPLY_DEFAULT_BIN_FAILED",
      (err as Error).message ?? "Không áp dụng được đề xuất",
      500,
    );
  }
}
