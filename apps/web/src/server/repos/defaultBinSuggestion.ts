import { sql } from "drizzle-orm";
import { item } from "@iot/db/schema";
import { db } from "@/lib/db";
import {
  STAGING_BIN_CODE,
  STAGING_BIN_WAREHOUSE_CODE,
  STAGING_BIN_ZONE,
} from "./stagingBin";

/**
 * V4.3 Việc 1 — Suy vị trí mặc định (`item.default_bin_id`) từ dữ liệu tồn
 * THỰC TẾ hiện có (`app.bin_inventory`), KHÔNG tính bin hệ thống "Chờ xếp kệ"
 * (nếu vật tư chỉ đang ở đó thì chưa có gì để suy — vẫn cần Kho tự xếp lần
 * đầu). Quy tắc mục 1 đề bài: "vật tư đang nằm chủ yếu ở 1 ô → đề xuất ô đó".
 *
 * Ngưỡng "chủ yếu": CHỈ có đúng 1 bin chứa vật tư (share=100%), HOẶC 1 bin
 * chiếm ≥ 80% tổng tồn hiện có của vật tư đó (loại các trường hợp tồn dàn
 * trải nhiều nơi gần bằng nhau — suy nhầm sẽ khiến Kho mất niềm tin vào gợi
 * ý, ưu tiên KHÔNG đề xuất hơn là đề xuất sai).
 */

const CONCENTRATION_THRESHOLD = 0.8;

export interface ItemBinQty {
  binId: string;
  binFullCode: string;
  qty: number;
}

export interface DefaultBinSuggestionResult {
  binId: string;
  binFullCode: string;
  /** Tồn của vật tư tại bin được đề xuất. */
  qty: number;
  /** Tổng tồn của vật tư (mọi bin không phải Chờ xếp kệ). */
  totalQty: number;
  /** qty / totalQty — 1.0 = vật tư chỉ nằm ở đúng 1 bin. */
  share: number;
}

/** THUẦN — suy vị trí mặc định từ danh sách (bin, qty) của 1 vật tư. Không chạm DB. */
export function computeDefaultBinSuggestion(
  rows: ItemBinQty[],
): DefaultBinSuggestionResult | null {
  const positive = rows.filter((r) => r.qty > 0);
  if (positive.length === 0) return null;
  const totalQty = positive.reduce((s, r) => s + r.qty, 0);
  if (totalQty <= 0) return null;
  const top = [...positive].sort((a, b) => b.qty - a.qty)[0]!;
  const share = top.qty / totalQty;
  if (positive.length === 1 || share >= CONCENTRATION_THRESHOLD) {
    return {
      binId: top.binId,
      binFullCode: top.binFullCode,
      qty: top.qty,
      totalQty,
      share,
    };
  }
  return null;
}

export interface DefaultBinSuggestionRow {
  itemId: string;
  sku: string;
  name: string;
  currentDefaultBinId: string | null;
  currentDefaultBinCode: string | null;
  suggestedBinId: string;
  suggestedBinCode: string;
  suggestedQty: number;
  totalQty: number;
  share: number;
}

interface RawBinQtyRow {
  item_id: string;
  sku: string;
  name: string;
  current_default_bin_id: string | null;
  current_default_bin_code: string | null;
  bin_id: string;
  bin_full_code: string;
  qty: string;
}

/** Loại trừ bin "Chờ xếp kệ" khỏi mẫu số (KHÔNG dùng làm căn cứ suy vị trí mặc định). */
const excludeStagingClause = sql`
  NOT (lb.warehouse_code = ${STAGING_BIN_WAREHOUSE_CODE}
       AND lb.zone = ${STAGING_BIN_ZONE}
       AND lb.bin_code = ${STAGING_BIN_CODE})
`;

/**
 * Danh sách đề xuất CHỈ gồm vật tư ACTIONABLE — có suy ra được vị trí mặc
 * định VÀ khác vị trí mặc định hiện tại (hoặc chưa có vị trí mặc định).
 */
export async function listDefaultBinSuggestions(): Promise<DefaultBinSuggestionRow[]> {
  const rows = (await db.execute(sql`
    SELECT it.id AS item_id, it.sku, it.name,
           it.default_bin_id::text AS current_default_bin_id,
           lbCur.full_code AS current_default_bin_code,
           bi.bin_id::text AS bin_id, lb.full_code AS bin_full_code,
           bi.qty_on_hand::text AS qty
    FROM app.item it
    JOIN app.bin_inventory bi ON bi.item_id = it.id
    JOIN app.location_bin lb ON lb.id = bi.bin_id
    LEFT JOIN app.location_bin lbCur ON lbCur.id = it.default_bin_id
    WHERE it.is_active = TRUE AND ${excludeStagingClause}
    ORDER BY it.sku
  `)) as unknown as RawBinQtyRow[];

  const byItem = new Map<
    string,
    { sku: string; name: string; currentDefaultBinId: string | null; currentDefaultBinCode: string | null; bins: ItemBinQty[] }
  >();
  for (const r of rows) {
    let g = byItem.get(r.item_id);
    if (!g) {
      g = {
        sku: r.sku,
        name: r.name,
        currentDefaultBinId: r.current_default_bin_id,
        currentDefaultBinCode: r.current_default_bin_code,
        bins: [],
      };
      byItem.set(r.item_id, g);
    }
    g.bins.push({ binId: r.bin_id, binFullCode: r.bin_full_code, qty: Number(r.qty) });
  }

  const out: DefaultBinSuggestionRow[] = [];
  for (const [itemId, g] of byItem) {
    const suggestion = computeDefaultBinSuggestion(g.bins);
    if (!suggestion) continue;
    if (suggestion.binId === g.currentDefaultBinId) continue; // đã đúng — không cần đề xuất lại
    out.push({
      itemId,
      sku: g.sku,
      name: g.name,
      currentDefaultBinId: g.currentDefaultBinId,
      currentDefaultBinCode: g.currentDefaultBinCode,
      suggestedBinId: suggestion.binId,
      suggestedBinCode: suggestion.binFullCode,
      suggestedQty: suggestion.qty,
      totalQty: suggestion.totalQty,
      share: suggestion.share,
    });
  }
  return out;
}

export interface DefaultBinExportSourceRow {
  sku: string;
  name: string;
  currentBinCode: string | null;
  suggestedBinCode: string | null;
  suggestedQty: number | null;
  totalQty: number | null;
}

/**
 * MỌI vật tư active (không chỉ vật tư actionable) kèm vị trí mặc định hiện
 * tại + đề xuất (nếu suy ra được) — dùng cho xuất Excel tham khảo/đối chiếu.
 */
export async function listAllItemsForExport(): Promise<DefaultBinExportSourceRow[]> {
  const rows = (await db.execute(sql`
    SELECT it.id AS item_id, it.sku, it.name,
           lbCur.full_code AS current_default_bin_code,
           bi.bin_id::text AS bin_id, lb.full_code AS bin_full_code,
           bi.qty_on_hand::text AS qty,
           (lb.warehouse_code = ${STAGING_BIN_WAREHOUSE_CODE}
            AND lb.zone = ${STAGING_BIN_ZONE}
            AND lb.bin_code = ${STAGING_BIN_CODE}) AS is_staging
    FROM app.item it
    LEFT JOIN app.location_bin lbCur ON lbCur.id = it.default_bin_id
    LEFT JOIN app.bin_inventory bi ON bi.item_id = it.id
    LEFT JOIN app.location_bin lb ON lb.id = bi.bin_id
    WHERE it.is_active = TRUE
    ORDER BY it.sku
  `)) as unknown as Array<{
    item_id: string;
    sku: string;
    name: string;
    current_default_bin_code: string | null;
    bin_id: string | null;
    bin_full_code: string | null;
    qty: string | null;
    is_staging: boolean | null;
  }>;

  const byItem = new Map<
    string,
    { sku: string; name: string; currentBinCode: string | null; bins: ItemBinQty[] }
  >();
  for (const r of rows) {
    let g = byItem.get(r.item_id);
    if (!g) {
      g = { sku: r.sku, name: r.name, currentBinCode: r.current_default_bin_code, bins: [] };
      byItem.set(r.item_id, g);
    }
    if (r.bin_id && !r.is_staging) {
      g.bins.push({ binId: r.bin_id, binFullCode: r.bin_full_code!, qty: Number(r.qty) });
    }
  }

  return [...byItem.values()].map((g) => {
    const s = computeDefaultBinSuggestion(g.bins);
    return {
      sku: g.sku,
      name: g.name,
      currentBinCode: g.currentBinCode,
      suggestedBinCode: s?.binFullCode ?? null,
      suggestedQty: s?.qty ?? null,
      totalQty: s?.totalQty ?? null,
    };
  });
}

/** Suy vị trí mặc định cho 1 item cụ thể — dùng khi apply hàng loạt (không tin binId client gửi). */
async function computeSuggestionForItems(
  itemIds: string[],
): Promise<Map<string, DefaultBinSuggestionResult>> {
  if (itemIds.length === 0) return new Map();
  const rows = (await db.execute(sql`
    SELECT bi.item_id::text AS item_id, bi.bin_id::text AS bin_id,
           lb.full_code AS bin_full_code, bi.qty_on_hand::text AS qty
    FROM app.bin_inventory bi
    JOIN app.location_bin lb ON lb.id = bi.bin_id
    WHERE bi.item_id = ANY(${sql.join(
      itemIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}) AND ${excludeStagingClause}
  `)) as unknown as Array<{ item_id: string; bin_id: string; bin_full_code: string; qty: string }>;

  const byItem = new Map<string, ItemBinQty[]>();
  for (const r of rows) {
    const list = byItem.get(r.item_id) ?? [];
    list.push({ binId: r.bin_id, binFullCode: r.bin_full_code, qty: Number(r.qty) });
    byItem.set(r.item_id, list);
  }
  const out = new Map<string, DefaultBinSuggestionResult>();
  for (const [itemId, bins] of byItem) {
    const s = computeDefaultBinSuggestion(bins);
    if (s) out.set(itemId, s);
  }
  return out;
}

export interface ApplySuggestionsResult {
  applied: Array<{ itemId: string; sku: string; binId: string; binCode: string }>;
  skipped: Array<{ itemId: string; reason: string }>;
}

/**
 * Áp dụng hàng loạt — tính LẠI đề xuất trên server (không tin binId client
 * gửi, tránh áp sai nếu dữ liệu đã đổi giữa lúc xem danh sách và lúc bấm áp
 * dụng). Ghi 1 audit event tổng hợp cho cả batch.
 */
export async function applyDefaultBinSuggestions(
  itemIds: string[],
  actorId: string,
): Promise<ApplySuggestionsResult> {
  const uniqueIds = [...new Set(itemIds)];
  if (uniqueIds.length === 0) return { applied: [], skipped: [] };

  const suggestions = await computeSuggestionForItems(uniqueIds);
  const itemsInfo = await db
    .select({ id: item.id, sku: item.sku, defaultBinId: item.defaultBinId })
    .from(item)
    .where(sql`${item.id} = ANY(${sql.join(
      uniqueIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`);
  const infoById = new Map(itemsInfo.map((i) => [i.id, i]));

  const applied: ApplySuggestionsResult["applied"] = [];
  const skipped: ApplySuggestionsResult["skipped"] = [];

  await db.transaction(async (tx) => {
    for (const itemId of uniqueIds) {
      const info = infoById.get(itemId);
      if (!info) {
        skipped.push({ itemId, reason: "Không tìm thấy vật tư." });
        continue;
      }
      const s = suggestions.get(itemId);
      if (!s) {
        skipped.push({ itemId, reason: "Không còn suy ra được vị trí tập trung (dữ liệu đã đổi)." });
        continue;
      }
      if (s.binId === info.defaultBinId) {
        skipped.push({ itemId, reason: "Đã đúng vị trí mặc định hiện tại." });
        continue;
      }
      await tx.update(item).set({ defaultBinId: s.binId, updatedBy: actorId, updatedAt: new Date() }).where(sql`${item.id} = ${itemId}::uuid`);
      applied.push({ itemId, sku: info.sku, binId: s.binId, binCode: s.binFullCode });
    }
  });

  return { applied, skipped };
}

export interface SetDefaultBinPair {
  itemId: string;
  /** null = xoá vị trí mặc định (dùng cho import Excel để trống). */
  binId: string | null;
}

/** Ghi trực tiếp — dùng bởi import Excel (đã validate SKU/mã ô trước đó). */
export async function setItemDefaultBins(
  pairs: SetDefaultBinPair[],
  actorId: string,
): Promise<number> {
  if (pairs.length === 0) return 0;
  await db.transaction(async (tx) => {
    for (const p of pairs) {
      await tx
        .update(item)
        .set({ defaultBinId: p.binId, updatedBy: actorId, updatedAt: new Date() })
        .where(sql`${item.id} = ${p.itemId}::uuid`);
    }
  });
  return pairs.length;
}
