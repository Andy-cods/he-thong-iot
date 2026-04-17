import { and, asc, desc, eq } from "drizzle-orm";
import { itemBarcode, type ItemBarcode } from "@iot/db/schema";
import type { BarcodeCreate, BarcodeUpdate } from "@iot/shared";
import { db } from "@/lib/db";

export async function listBarcodes(itemId: string): Promise<ItemBarcode[]> {
  return db
    .select()
    .from(itemBarcode)
    .where(eq(itemBarcode.itemId, itemId))
    .orderBy(desc(itemBarcode.isPrimary), asc(itemBarcode.createdAt));
}

export async function getBarcodeByValue(barcode: string) {
  const [row] = await db
    .select()
    .from(itemBarcode)
    .where(eq(itemBarcode.barcode, barcode))
    .limit(1);
  return row ?? null;
}

export async function getBarcode(id: string) {
  const [row] = await db
    .select()
    .from(itemBarcode)
    .where(eq(itemBarcode.id, id))
    .limit(1);
  return row ?? null;
}

/** Tạo barcode; nếu primary → unset primary cũ trong transaction. */
export async function createBarcode(itemId: string, input: BarcodeCreate) {
  return db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx
        .update(itemBarcode)
        .set({ isPrimary: false })
        .where(eq(itemBarcode.itemId, itemId));
    }
    const [row] = await tx
      .insert(itemBarcode)
      .values({
        itemId,
        barcode: input.barcode,
        barcodeType: input.barcodeType,
        source: input.source,
        isPrimary: input.isPrimary,
      })
      .returning();
    return row;
  });
}

export async function updateBarcode(
  itemId: string,
  barcodeId: string,
  input: BarcodeUpdate,
) {
  return db.transaction(async (tx) => {
    if (input.isPrimary === true) {
      await tx
        .update(itemBarcode)
        .set({ isPrimary: false })
        .where(
          and(
            eq(itemBarcode.itemId, itemId),
            // partial unique đã chặn duplicate primary, vẫn set để an toàn.
          ),
        );
    }
    const patch: Record<string, unknown> = {};
    if (input.barcodeType !== undefined) patch.barcodeType = input.barcodeType;
    if (input.source !== undefined) patch.source = input.source;
    if (input.isPrimary !== undefined) patch.isPrimary = input.isPrimary;
    const [row] = await tx
      .update(itemBarcode)
      .set(patch)
      .where(
        and(eq(itemBarcode.id, barcodeId), eq(itemBarcode.itemId, itemId)),
      )
      .returning();
    return row ?? null;
  });
}

export async function deleteBarcode(itemId: string, barcodeId: string) {
  const [row] = await db
    .delete(itemBarcode)
    .where(and(eq(itemBarcode.id, barcodeId), eq(itemBarcode.itemId, itemId)))
    .returning();
  return row ?? null;
}

export async function setPrimaryBarcode(itemId: string, barcodeId: string) {
  return db.transaction(async (tx) => {
    await tx
      .update(itemBarcode)
      .set({ isPrimary: false })
      .where(eq(itemBarcode.itemId, itemId));
    const [row] = await tx
      .update(itemBarcode)
      .set({ isPrimary: true })
      .where(
        and(eq(itemBarcode.id, barcodeId), eq(itemBarcode.itemId, itemId)),
      )
      .returning();
    return row ?? null;
  });
}
