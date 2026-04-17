import { and, asc, desc, eq } from "drizzle-orm";
import { itemSupplier, supplier } from "@iot/db/schema";
import type {
  ItemSupplierCreate,
  ItemSupplierUpdate,
} from "@iot/shared";
import { db } from "@/lib/db";

export async function listItemSuppliers(itemId: string) {
  return db
    .select({
      id: itemSupplier.id,
      supplierId: itemSupplier.supplierId,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      supplierSku: itemSupplier.supplierSku,
      vendorItemCode: itemSupplier.vendorItemCode,
      priceRef: itemSupplier.priceRef,
      currency: itemSupplier.currency,
      leadTimeDays: itemSupplier.leadTimeDays,
      moq: itemSupplier.moq,
      packSize: itemSupplier.packSize,
      isPreferred: itemSupplier.isPreferred,
      createdAt: itemSupplier.createdAt,
    })
    .from(itemSupplier)
    .innerJoin(supplier, eq(supplier.id, itemSupplier.supplierId))
    .where(eq(itemSupplier.itemId, itemId))
    .orderBy(desc(itemSupplier.isPreferred), asc(itemSupplier.createdAt));
}

export async function getItemSupplierPair(
  itemId: string,
  supplierId: string,
) {
  const [row] = await db
    .select()
    .from(itemSupplier)
    .where(
      and(
        eq(itemSupplier.itemId, itemId),
        eq(itemSupplier.supplierId, supplierId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getItemSupplier(itemId: string, id: string) {
  const [row] = await db
    .select()
    .from(itemSupplier)
    .where(and(eq(itemSupplier.id, id), eq(itemSupplier.itemId, itemId)))
    .limit(1);
  return row ?? null;
}

export async function createItemSupplier(
  itemId: string,
  input: ItemSupplierCreate,
) {
  return db.transaction(async (tx) => {
    if (input.isPreferred) {
      await tx
        .update(itemSupplier)
        .set({ isPreferred: false })
        .where(eq(itemSupplier.itemId, itemId));
    }
    const [row] = await tx
      .insert(itemSupplier)
      .values({
        itemId,
        supplierId: input.supplierId,
        supplierSku: input.supplierSku ?? null,
        vendorItemCode: input.vendorItemCode ?? null,
        priceRef:
          input.priceRef === null || input.priceRef === undefined
            ? null
            : String(input.priceRef),
        currency: input.currency,
        leadTimeDays: input.leadTimeDays,
        moq: String(input.moq),
        packSize: String(input.packSize),
        isPreferred: input.isPreferred,
      })
      .returning();
    return row;
  });
}

export async function updateItemSupplier(
  itemId: string,
  id: string,
  input: ItemSupplierUpdate,
) {
  return db.transaction(async (tx) => {
    if (input.isPreferred === true) {
      await tx
        .update(itemSupplier)
        .set({ isPreferred: false })
        .where(eq(itemSupplier.itemId, itemId));
    }
    const patch: Record<string, unknown> = {};
    if (input.supplierSku !== undefined) patch.supplierSku = input.supplierSku;
    if (input.vendorItemCode !== undefined)
      patch.vendorItemCode = input.vendorItemCode;
    if (input.priceRef !== undefined)
      patch.priceRef = input.priceRef === null ? null : String(input.priceRef);
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.leadTimeDays !== undefined) patch.leadTimeDays = input.leadTimeDays;
    if (input.moq !== undefined) patch.moq = String(input.moq);
    if (input.packSize !== undefined) patch.packSize = String(input.packSize);
    if (input.isPreferred !== undefined) patch.isPreferred = input.isPreferred;

    const [row] = await tx
      .update(itemSupplier)
      .set(patch)
      .where(and(eq(itemSupplier.id, id), eq(itemSupplier.itemId, itemId)))
      .returning();
    return row ?? null;
  });
}

export async function deleteItemSupplier(itemId: string, id: string) {
  const [row] = await db
    .delete(itemSupplier)
    .where(and(eq(itemSupplier.id, id), eq(itemSupplier.itemId, itemId)))
    .returning();
  return row ?? null;
}

export async function setPreferredItemSupplier(itemId: string, id: string) {
  return db.transaction(async (tx) => {
    await tx
      .update(itemSupplier)
      .set({ isPreferred: false })
      .where(eq(itemSupplier.itemId, itemId));
    const [row] = await tx
      .update(itemSupplier)
      .set({ isPreferred: true })
      .where(and(eq(itemSupplier.id, id), eq(itemSupplier.itemId, itemId)))
      .returning();
    return row ?? null;
  });
}
