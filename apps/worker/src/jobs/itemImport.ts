import type { Job } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import {
  importBatch,
  item,
  itemBarcode,
  supplier,
  itemSupplier,
} from "@iot/db/schema";
import type { ItemImportRow, ImportDuplicateMode } from "@iot/shared";
import { db } from "../db.js";

export interface ItemImportCommitJob {
  batchId: string;
  fileHash: string;
  actorId: string;
  duplicateMode: ImportDuplicateMode;
}

interface StoredRow {
  rowNumber: number;
  data: ItemImportRow;
}

const CHUNK_SIZE = 500;

/**
 * Worker xử lý item-import-commit:
 * - Đọc previewJson.allRows (đã validate lúc upload)
 * - Chunk 500 rows, transaction per chunk
 * - duplicateMode: skip | upsert | error
 * - Cập nhật row_success / row_fail, errorJson nếu có
 */
export async function processItemImportCommit(
  job: Job<ItemImportCommitJob>,
): Promise<{ success: number; fail: number }> {
  const { batchId, duplicateMode, actorId } = job.data;

  const [batch] = await db
    .select()
    .from(importBatch)
    .where(eq(importBatch.id, batchId))
    .limit(1);

  if (!batch) {
    throw new Error(`Import batch ${batchId} không tồn tại`);
  }

  const preview = batch.previewJson as {
    allRows?: StoredRow[];
  } | null;
  const allRows = preview?.allRows ?? [];

  if (allRows.length === 0) {
    await db
      .update(importBatch)
      .set({
        status: "done",
        finishedAt: new Date(),
        errorMessage: "Không có dòng hợp lệ để commit.",
      })
      .where(eq(importBatch.id, batchId));
    return { success: 0, fail: 0 };
  }

  // Reset counters (commit có thể retry từ đầu)
  await db
    .update(importBatch)
    .set({
      status: "committing",
      rowSuccess: 0,
      rowFail: 0,
      startedAt: batch.startedAt ?? new Date(),
    })
    .where(eq(importBatch.id, batchId));

  const errors: Array<{
    rowNumber: number;
    sku: string;
    reason: string;
  }> = [];
  let totalSuccess = 0;
  let totalFail = 0;

  for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
    const chunk = allRows.slice(i, i + CHUNK_SIZE);
    const result = await processChunk(chunk, duplicateMode, actorId);
    totalSuccess += result.success;
    totalFail += result.fail;
    errors.push(...result.errors);

    await db
      .update(importBatch)
      .set({
        rowSuccess: totalSuccess,
        rowFail: totalFail,
      })
      .where(eq(importBatch.id, batchId));

    await job.updateProgress(
      Math.min(100, Math.round(((i + CHUNK_SIZE) / allRows.length) * 100)),
    );
  }

  const existingErrors =
    (batch.errorJson as Array<{ rowNumber: number; reason: string }>) ?? [];

  await db
    .update(importBatch)
    .set({
      status: "done",
      finishedAt: new Date(),
      rowSuccess: totalSuccess,
      rowFail: totalFail,
      errorJson: [
        ...existingErrors,
        ...errors.map((e) => ({
          rowNumber: e.rowNumber,
          field: "_commit",
          reason: e.reason,
          rawValue: e.sku,
        })),
      ].slice(0, 1000),
    })
    .where(eq(importBatch.id, batchId));

  return { success: totalSuccess, fail: totalFail };
}

async function processChunk(
  chunk: StoredRow[],
  duplicateMode: ImportDuplicateMode,
  actorId: string,
): Promise<{
  success: number;
  fail: number;
  errors: Array<{ rowNumber: number; sku: string; reason: string }>;
}> {
  let success = 0;
  let fail = 0;
  const errors: Array<{ rowNumber: number; sku: string; reason: string }> = [];

  await db.transaction(async (tx) => {
    for (const row of chunk) {
      try {
        await upsertOneItem(tx, row, duplicateMode, actorId);
        success++;
      } catch (err) {
        fail++;
        const reason =
          err instanceof Error ? err.message : "Lỗi không xác định";
        errors.push({
          rowNumber: row.rowNumber,
          sku: row.data.sku,
          reason,
        });
      }
    }
  });

  return { success, fail, errors };
}

async function upsertOneItem(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: StoredRow,
  duplicateMode: ImportDuplicateMode,
  actorId: string,
) {
  const d = row.data;

  const [existing] = await tx
    .select({ id: item.id })
    .from(item)
    .where(eq(item.sku, d.sku))
    .limit(1)
    .for("update");

  let itemId: string;

  if (existing) {
    if (duplicateMode === "skip") {
      return;
    }
    if (duplicateMode === "error") {
      throw new Error(`SKU "${d.sku}" đã tồn tại`);
    }
    // upsert
    await tx
      .update(item)
      .set({
        name: d.name,
        itemType: d.itemType,
        uom: d.uom,
        category: d.category ?? null,
        description: d.description ?? null,
        minStockQty: String(d.minStockQty),
        reorderQty: String(d.reorderQty),
        leadTimeDays: d.leadTimeDays,
        isLotTracked: d.isLotTracked,
        isSerialTracked: d.isSerialTracked,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(eq(item.id, existing.id));
    itemId = existing.id;
  } else {
    const [created] = await tx
      .insert(item)
      .values({
        sku: d.sku,
        name: d.name,
        itemType: d.itemType,
        uom: d.uom,
        category: d.category ?? null,
        description: d.description ?? null,
        minStockQty: String(d.minStockQty),
        reorderQty: String(d.reorderQty),
        leadTimeDays: d.leadTimeDays,
        isLotTracked: d.isLotTracked,
        isSerialTracked: d.isSerialTracked,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ id: item.id });
    if (!created) throw new Error("Không tạo được item mới");
    itemId = created.id;
  }

  // Barcode: insert nếu có, set primary nếu item chưa có primary
  if (d.barcode) {
    const [existingBc] = await tx
      .select({ id: itemBarcode.id })
      .from(itemBarcode)
      .where(eq(itemBarcode.barcode, d.barcode))
      .limit(1);

    if (!existingBc) {
      const [existingPrimary] = await tx
        .select({ id: itemBarcode.id })
        .from(itemBarcode)
        .where(
          and(eq(itemBarcode.itemId, itemId), eq(itemBarcode.isPrimary, true)),
        )
        .limit(1);

      await tx.insert(itemBarcode).values({
        itemId,
        barcode: d.barcode,
        barcodeType: d.barcodeType,
        source: "vendor",
        isPrimary: !existingPrimary,
      });
    }
  }

  // Supplier mapping: tạo supplier nếu chưa có, link item_supplier
  if (d.supplierCode) {
    const [existingSup] = await tx
      .select({ id: supplier.id })
      .from(supplier)
      .where(eq(supplier.code, d.supplierCode))
      .limit(1);

    let supplierId: string;
    if (!existingSup) {
      const [createdSup] = await tx
        .insert(supplier)
        .values({
          code: d.supplierCode,
          name: d.supplierCode,
        })
        .returning({ id: supplier.id });
      if (!createdSup) throw new Error("Không tạo được supplier mới");
      supplierId = createdSup.id;
    } else {
      supplierId = existingSup.id;
    }

    const [existingMap] = await tx
      .select({ id: itemSupplier.id })
      .from(itemSupplier)
      .where(
        and(
          eq(itemSupplier.itemId, itemId),
          eq(itemSupplier.supplierId, supplierId),
        ),
      )
      .limit(1);

    if (!existingMap) {
      await tx.insert(itemSupplier).values({
        itemId,
        supplierId,
        supplierSku: d.supplierSku ?? null,
        priceRef: d.priceRef != null ? String(d.priceRef) : null,
        leadTimeDays: d.leadTimeDaysSupplier ?? d.leadTimeDays,
        moq: String(d.moq),
        packSize: String(d.packSize),
        isPreferred: true,
      });
    } else {
      await tx
        .update(itemSupplier)
        .set({
          supplierSku: d.supplierSku ?? null,
          priceRef: d.priceRef != null ? String(d.priceRef) : null,
          leadTimeDays: d.leadTimeDaysSupplier ?? d.leadTimeDays,
          moq: String(d.moq),
          packSize: String(d.packSize),
        })
        .where(eq(itemSupplier.id, existingMap.id));
    }
  }

  // touch updatedAt
  void sql;
}
