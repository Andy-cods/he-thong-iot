import { item, supplier } from "@iot/db/schema";
import { eq } from "drizzle-orm";
import { toDims, type SupplierRef } from "@iot/shared";
import { db } from "@/lib/db";
import type { MatchItemInput } from "./bomMatch";

/** Nạp 1 lần danh mục item + NCC cho bước khớp (V5 WP4b). */
export async function loadMatchCatalog(): Promise<{
  items: MatchItemInput[];
  suppliers: SupplierRef[];
}> {
  const [itemRows, supRows] = await Promise.all([
    db
      .select({
        id: item.id,
        sku: item.sku,
        name: item.name,
        description: item.description,
        materialCode: item.materialCode,
        dimensions: item.dimensions,
      })
      .from(item),
    db
      .select({ id: supplier.id, code: supplier.code, name: supplier.name })
      .from(supplier)
      .where(eq(supplier.isActive, true)),
  ]);
  return {
    items: itemRows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      description: r.description,
      materialCode: r.materialCode,
      dimensions: toDims(r.dimensions),
    })),
    suppliers: supRows,
  };
}
