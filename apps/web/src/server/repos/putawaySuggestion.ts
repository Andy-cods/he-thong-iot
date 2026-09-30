import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { uuidArray } from "./stockGuard";
import {
  STAGING_BIN_CODE,
  STAGING_BIN_WAREHOUSE_CODE,
  STAGING_BIN_ZONE,
} from "./stagingBin";

/**
 * V4.3 — Gợi ý vị trí putaway (mục 4.1 `WAREHOUSE_UX_AND_FLOW.md`).
 *
 * Thứ tự ưu tiên:
 *   (a) Bin đang chứa CÙNG item, còn đủ chỗ (`capacity`) — sắp theo còn nhiều
 *       chỗ trống hơn trước (giảm số lần chia nhỏ 1 SKU ra nhiều bin).
 *   (b) `item.default_bin_id` (nếu có, còn đủ chỗ).
 *   (c) Bin TRỐNG (0 tồn) cùng khu/kệ với bin đang chứa item KHÁC cùng
 *       `item.category` — ưu tiên cùng kệ (rack) trước, cùng khu (zone) sau.
 *   (d) Sức chứa còn lại lớn nhất (tie-break cuối, theo SỐ LƯỢNG — chưa có dữ
 *       liệu khối lượng/kích thước bin).
 *   Luôn kèm bin hệ thống "Chờ xếp kệ" làm lựa chọn cuối cùng (fallback), kể
 *   cả khi đã có gợi ý khác — Kho có thể chủ động chọn để xử lý sau.
 *
 * Dùng `app.bin_inventory` (KHÔNG dùng `v_lot_stock` đã lọc AVAILABLE) để tính
 * sức chứa còn lại — tránh gợi ý vượt sức chứa vật lý thật kể cả khi có lô
 * đang HOLD trong bin.
 *
 * Tách hàm THUẦN `scorePutawayCandidates` để vitest không cần DB.
 */

export type PutawayReasonCode =
  | "SAME_ITEM"
  | "DEFAULT_BIN"
  | "SAME_ZONE_CATEGORY"
  | "MOST_CAPACITY"
  | "STAGING_FALLBACK";

export interface PutawaySuggestion {
  binId: string;
  binFullCode: string;
  reasonCode: PutawayReasonCode;
  reason: string;
  remainingCapacity: number | null;
}

/** Dữ liệu thô 1 bin ứng viên — lấy từ DB, đưa vào hàm chấm điểm THUẦN. */
export interface PutawayCandidate {
  binId: string;
  binFullCode: string;
  /** Khu (area) — dùng hiện lý do "Cùng khu A". */
  zone: string | null;
  /** true nếu đây là bin hệ thống "Chờ xếp kệ". */
  isStaging: boolean;
  /** null = không khai capacity (không giới hạn). */
  capacity: number | null;
  /** Tổng qty đang có trong bin (MỌI item, kể cả lô HOLD) — app.bin_inventory. */
  currentQty: number;
  /** Qty của CHÍNH item đang xét hiện có trong bin này. */
  sameItemQty: number;
  /** true nếu bin này = item.default_bin_id. */
  isDefaultBin: boolean;
  /** true nếu bin TRỐNG (currentQty = 0) và cùng khu với bin khác đang chứa item cùng category. */
  sameZoneCategoryMatch: boolean;
  /** true nếu (thêm) cùng kệ (rack) với bin khác đang chứa item cùng category — tie-break trong (c). */
  sameRackCategoryMatch: boolean;
}

function remainingOf(c: PutawayCandidate): number | null {
  return c.capacity == null ? null : c.capacity - c.currentQty;
}

function fmtQty(n: number): string {
  const rounded = Number(n.toFixed(4));
  return rounded.toLocaleString("vi-VN");
}

/** Hash chuỗi ổn định (không phụ thuộc runtime) — dùng để phân tán tie-break theo itemId. */
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Xoay vòng 1 nhóm ứng viên ĐÃ ĐỒNG HẠNG theo hash(itemId) — nhiều vật tư
 * khác nhau rơi vào cùng nhóm (vd cùng "bin trống, cùng khu, không phân biệt
 * gì thêm") sẽ được rải đều ra các bin trong nhóm thay vì luôn nhận bin ĐẦU
 * TIÊN theo thứ tự sắp xếp cố định. Cùng itemId gọi lại nhiều lần vẫn ra
 * cùng 1 thứ tự (ổn định/idempotent) — không phải ngẫu nhiên.
 */
function rotateGroup<T>(group: T[], itemId: string | undefined): T[] {
  if (!itemId || group.length <= 1) return group;
  const offset = stableHash(itemId) % group.length;
  return offset === 0 ? group : [...group.slice(offset), ...group.slice(0, offset)];
}

/**
 * Gom các phần tử LIÊN TIẾP có cùng `keyFn` thành từng nhóm (đầu vào PHẢI đã
 * sắp xếp sao cho các phần tử đồng hạng đứng cạnh nhau). Dùng để tìm nhóm
 * "đồng điểm" rồi xoay vòng riêng từng nhóm — không đụng thứ tự ưu tiên giữa
 * các nhóm khác điểm.
 */
function groupConsecutiveBy<T>(items: T[], keyFn: (item: T) => string): T[][] {
  const groups: T[][] = [];
  let currentKey: string | null = null;
  for (const item of items) {
    const k = keyFn(item);
    if (k !== currentKey || groups.length === 0) {
      groups.push([item]);
      currentKey = k;
    } else {
      groups[groups.length - 1]!.push(item);
    }
  }
  return groups;
}

/**
 * THUẦN — chấm điểm + xếp hạng danh sách bin ứng viên. Không chạm DB.
 * Luôn trả về >= 1 phần tử NẾU `candidates` có bin `isStaging` (fallback).
 *
 * `itemId` (tuỳ chọn) dùng để PHÂN TÁN các ứng viên đồng hạng ở tiêu chí (c)
 * và (d) — trước đây khi nhiều bin trống ngang điểm nhau (capacity bằng
 * nhau), sort ổn định luôn trả về bin ĐẦU TIÊN theo thứ tự SQL cố định
 * (area, rack, level_no, position) cho MỌI vật tư khác nhau → dồn hết hàng
 * mới vào 1 ô trống (đúng vấn đề audit `WAREHOUSE_UX_AND_FLOW.md` mục 4.1 ghi
 * nhận). Thứ tự ưu tiên GIỮ NGUYÊN (cùng kệ > cùng khu > mã ô), chỉ xoay vòng
 * NỘI BỘ nhóm đồng hạng để rải đều.
 */
export function scorePutawayCandidates(
  candidates: PutawayCandidate[],
  qty: number,
  itemId?: string,
): PutawaySuggestion[] {
  const staging = candidates.find((c) => c.isStaging) ?? null;
  const eligible = candidates.filter((c) => {
    const remaining = remainingOf(c);
    return remaining == null || remaining >= qty;
  });

  const used = new Set<string>();
  const out: PutawaySuggestion[] = [];

  // (a) Cùng vật tư, còn chỗ — sắp theo còn nhiều chỗ trống hơn trước.
  const sameItem = eligible
    .filter((c) => c.sameItemQty > 0)
    .sort((x, y) => (remainingOf(y) ?? Infinity) - (remainingOf(x) ?? Infinity));
  for (const c of sameItem) {
    const remaining = remainingOf(c);
    out.push({
      binId: c.binId,
      binFullCode: c.binFullCode,
      reasonCode: "SAME_ITEM",
      reason:
        remaining == null
          ? `Cùng vật tư, đang có ${fmtQty(c.sameItemQty)}, bin không giới hạn sức chứa`
          : `Cùng vật tư, còn ${fmtQty(remaining)}/${fmtQty(c.capacity ?? 0)}`,
      remainingCapacity: remaining,
    });
    used.add(c.binId);
  }

  // (b) default_bin_id của item.
  const defaultBin = eligible.find((c) => c.isDefaultBin && !used.has(c.binId));
  if (defaultBin) {
    out.push({
      binId: defaultBin.binId,
      binFullCode: defaultBin.binFullCode,
      reasonCode: "DEFAULT_BIN",
      reason: "Vị trí mặc định của vật tư",
      remainingCapacity: remainingOf(defaultBin),
    });
    used.add(defaultBin.binId);
  }

  // (c) Bin trống cùng khu/nhóm vật tư — ưu tiên cùng kệ (rack) trước. Nhóm
  // ĐỒNG HẠNG (cùng rack-match + cùng sức chứa còn lại) được xoay vòng theo
  // itemId để rải đều nhiều vật tư ra nhiều bin trống thay vì luôn cùng 1 ô.
  const sameZoneSorted = eligible
    .filter((c) => c.sameZoneCategoryMatch && !used.has(c.binId))
    .sort((x, y) => {
      if (x.sameRackCategoryMatch !== y.sameRackCategoryMatch) {
        return x.sameRackCategoryMatch ? -1 : 1;
      }
      return (remainingOf(y) ?? Infinity) - (remainingOf(x) ?? Infinity);
    });
  const sameZone = groupConsecutiveBy(
    sameZoneSorted,
    (c) => `${c.sameRackCategoryMatch}|${remainingOf(c) ?? "inf"}`,
  ).flatMap((g) => rotateGroup(g, itemId));
  for (const c of sameZone) {
    out.push({
      binId: c.binId,
      binFullCode: c.binFullCode,
      reasonCode: "SAME_ZONE_CATEGORY",
      reason: c.sameRackCategoryMatch
        ? `Cùng kệ với vật tư cùng nhóm, đang trống`
        : `Cùng khu ${c.zone ?? ""}, đang trống`.trim(),
      remainingCapacity: remainingOf(c),
    });
    used.add(c.binId);
  }

  // (d) Sức chứa còn lại lớn nhất (tie-break cuối, KHÔNG tính bin "Chờ xếp kệ").
  // Nhiều bin trống CÙNG sức chứa còn lại (vd 90 bin trống, capacity bằng
  // nhau) trước đây luôn trả về bin ĐẦU TIÊN theo thứ tự SQL cố định cho MỌI
  // vật tư → dồn hết vào 1 ô. Xoay vòng theo itemId trong nhóm đồng hạng.
  const restSorted = eligible
    .filter((c) => !used.has(c.binId) && !c.isStaging)
    .sort((x, y) => (remainingOf(y) ?? Infinity) - (remainingOf(x) ?? Infinity));
  const rest = groupConsecutiveBy(restSorted, (c) => `${remainingOf(c) ?? "inf"}`).flatMap(
    (g) => rotateGroup(g, itemId),
  );
  for (const c of rest) {
    const remaining = remainingOf(c);
    out.push({
      binId: c.binId,
      binFullCode: c.binFullCode,
      reasonCode: "MOST_CAPACITY",
      reason:
        remaining == null
          ? "Còn trống, không giới hạn sức chứa"
          : `Còn trống ${fmtQty(remaining)} (theo số lượng, chưa có dữ liệu khối lượng/kích thước bin)`,
      remainingCapacity: remaining,
    });
    used.add(c.binId);
  }

  // Fallback "Chờ xếp kệ" — luôn có mặt (nếu candidates có), kể cả đã có gợi ý
  // khác ở trên; là gợi ý DUY NHẤT nếu không tiêu chí nào ở trên ra kết quả.
  if (staging && !used.has(staging.binId)) {
    out.push({
      binId: staging.binId,
      binFullCode: staging.binFullCode,
      reasonCode: "STAGING_FALLBACK",
      reason: "Bin hệ thống dùng chung khi chưa xác định vị trí — xếp kệ sau.",
      remainingCapacity: remainingOf(staging),
    });
  }

  return out;
}

type CandidateRow = {
  bin_id: string;
  full_code: string | null;
  bin_code: string;
  zone: string;
  warehouse_code: string;
  capacity: string | null;
  current_qty: string | null;
  same_item_qty: string | null;
  is_default_bin: boolean;
  same_zone_category_match: boolean;
  same_rack_category_match: boolean;
};

/**
 * Gợi ý vị trí putaway cho `itemId` cần cất `qty` — truy DB rồi chấm điểm
 * bằng `scorePutawayCandidates`. Luôn trả về >= 1 phần tử (fallback "Chờ xếp
 * kệ") NẾU bin hệ thống này còn tồn tại + active.
 */
export async function suggestPutawayBins(
  itemId: string,
  qty: number,
  opts: { excludeBinIds?: string[] } = {},
): Promise<PutawaySuggestion[]> {
  const excludeClause =
    opts.excludeBinIds && opts.excludeBinIds.length > 0
      ? sql`AND lb.id <> ALL(${uuidArray(opts.excludeBinIds)})`
      : sql``;

  const rows = await db.execute<CandidateRow>(sql`
    WITH item_info AS (
      SELECT category, default_bin_id FROM app.item WHERE id = ${itemId}::uuid
    ),
    same_category_zones AS (
      SELECT DISTINCT lb.area
      FROM app.bin_inventory bi
      JOIN app.item i2 ON i2.id = bi.item_id
      JOIN app.location_bin lb ON lb.id = bi.bin_id
      WHERE i2.category IS NOT NULL
        AND i2.category = (SELECT category FROM item_info)
        AND i2.id <> ${itemId}::uuid
        AND lb.area IS NOT NULL
    ),
    same_category_racks AS (
      SELECT DISTINCT lb.area, lb.rack
      FROM app.bin_inventory bi
      JOIN app.item i2 ON i2.id = bi.item_id
      JOIN app.location_bin lb ON lb.id = bi.bin_id
      WHERE i2.category IS NOT NULL
        AND i2.category = (SELECT category FROM item_info)
        AND i2.id <> ${itemId}::uuid
        AND lb.rack IS NOT NULL
    ),
    bin_totals AS (
      SELECT bin_id, SUM(qty_on_hand) AS total_qty
      FROM app.bin_inventory
      GROUP BY bin_id
    ),
    bin_item_qty AS (
      SELECT bin_id, SUM(qty_on_hand) AS item_qty
      FROM app.bin_inventory
      WHERE item_id = ${itemId}::uuid
      GROUP BY bin_id
    )
    SELECT
      lb.id AS bin_id,
      lb.full_code,
      lb.bin_code,
      lb.zone,
      lb.warehouse_code,
      lb.capacity::text AS capacity,
      COALESCE(bt.total_qty, 0)::text AS current_qty,
      COALESCE(biq.item_qty, 0)::text AS same_item_qty,
      (lb.id = (SELECT default_bin_id FROM item_info)) AS is_default_bin,
      (
        COALESCE(bt.total_qty, 0) = 0
        AND lb.area IS NOT NULL
        AND EXISTS (SELECT 1 FROM same_category_zones z WHERE z.area = lb.area)
      ) AS same_zone_category_match,
      (
        COALESCE(bt.total_qty, 0) = 0
        AND lb.area IS NOT NULL
        AND lb.rack IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM same_category_racks r
          WHERE r.area = lb.area AND r.rack = lb.rack
        )
      ) AS same_rack_category_match
    FROM app.location_bin lb
    LEFT JOIN bin_totals bt ON bt.bin_id = lb.id
    LEFT JOIN bin_item_qty biq ON biq.bin_id = lb.id
    WHERE lb.is_active = TRUE
      ${excludeClause}
    ORDER BY lb.area, lb.rack, lb.level_no, lb.position
  `);

  const candidates: PutawayCandidate[] = (
    rows as unknown as CandidateRow[]
  ).map((r) => ({
    binId: r.bin_id,
    binFullCode: r.full_code ?? `${r.zone}/${r.bin_code}`,
    zone: r.zone,
    isStaging:
      r.warehouse_code === STAGING_BIN_WAREHOUSE_CODE &&
      r.zone === STAGING_BIN_ZONE &&
      r.bin_code === STAGING_BIN_CODE,
    capacity: r.capacity == null ? null : Number(r.capacity),
    currentQty: Number(r.current_qty ?? "0"),
    sameItemQty: Number(r.same_item_qty ?? "0"),
    isDefaultBin: r.is_default_bin,
    sameZoneCategoryMatch: r.same_zone_category_match,
    sameRackCategoryMatch: r.same_rack_category_match,
  }));

  return scorePutawayCandidates(candidates, qty, itemId);
}
