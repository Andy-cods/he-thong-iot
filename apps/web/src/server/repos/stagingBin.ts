import { and, eq } from "drizzle-orm";
import { locationBin } from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V4.3 — Hằng số + resolver bin hệ thống "Chờ xếp kệ" (migration 0058), tách
 * riêng để dùng chung ở nhiều repo (putawaySuggestion, workOrders, warehouseToday)
 * mà KHÔNG đụng `receivingEvents.ts` (giữ nguyên logic resolve bin lúc nhận
 * hàng — xem `plans/v4.3-warehouse/WAREHOUSE_UX_AND_FLOW.md` mục 4.1.5).
 */
export const STAGING_BIN_WAREHOUSE_CODE = "WH-01";
export const STAGING_BIN_ZONE = "STAGING";
export const STAGING_BIN_CODE = "CHO-XEP-KE";

type Queryable = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

let cachedStagingBinId: string | null = null;

/**
 * Resolve id bin "Chờ xếp kệ". Cache trong module (bin này bất biến — tạo 1
 * lần bởi migration 0058). Throw rõ ràng nếu không tìm thấy (thà fail to còn
 * hơn mất hàng âm thầm), cùng nguyên tắc với `receivingEvents.ts`.
 */
export async function resolveStagingBinId(exec: Queryable): Promise<string> {
  if (cachedStagingBinId) return cachedStagingBinId;
  const [bin] = await exec
    .select({ id: locationBin.id })
    .from(locationBin)
    .where(
      and(
        eq(locationBin.warehouseCode, STAGING_BIN_WAREHOUSE_CODE),
        eq(locationBin.zone, STAGING_BIN_ZONE),
        eq(locationBin.binCode, STAGING_BIN_CODE),
      ),
    )
    .limit(1);
  if (!bin) {
    throw new Error(
      "STAGING_BIN_NOT_FOUND: Không tìm thấy bin hệ thống 'Chờ xếp kệ' " +
        `(warehouse_code=${STAGING_BIN_WAREHOUSE_CODE}, zone=${STAGING_BIN_ZONE}, bin_code=${STAGING_BIN_CODE}).`,
    );
  }
  cachedStagingBinId = bin.id;
  return cachedStagingBinId;
}
