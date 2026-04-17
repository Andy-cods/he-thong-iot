import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import {
  bomLine,
  bomTemplate,
  importBatch,
  item,
} from "@iot/db/schema";
import { db } from "../db.js";

export interface BomImportCommitJob {
  batchId: string;
  fileHash: string;
  actorId: string;
  selectedSheets: string[];
  mappings: Record<string, Record<string, string | null>>;
  autoCreateMissingItems: boolean;
  duplicateMode: "skip" | "upsert" | "error";
}

interface StoredRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

interface SheetMeta {
  sheetName: string;
  rowCount: number;
  headerRow: number;
  headersDetected: string[];
}

interface BomPreview {
  sheets?: SheetMeta[];
  allRowsBySheet?: Record<string, StoredRow[]>;
  autoMappings?: Record<string, Record<string, string | null>>;
}

interface RowError {
  rowNumber: number;
  sheet: string;
  field: string;
  reason: string;
  rawValue?: unknown;
}

const CHUNK_SIZE = 100;

export async function processBomImportCommit(
  job: Job<BomImportCommitJob>,
): Promise<{ success: number; fail: number; templatesCreated: number }> {
  const { batchId, selectedSheets, mappings, autoCreateMissingItems, actorId } =
    job.data;

  const [batch] = await db
    .select()
    .from(importBatch)
    .where(eq(importBatch.id, batchId))
    .limit(1);
  if (!batch) throw new Error(`Import batch ${batchId} không tồn tại`);

  const preview = (batch.previewJson ?? {}) as BomPreview;
  const allRowsBySheet = preview.allRowsBySheet ?? {};

  await db
    .update(importBatch)
    .set({
      status: "committing",
      rowSuccess: 0,
      rowFail: 0,
      startedAt: batch.startedAt ?? new Date(),
    })
    .where(eq(importBatch.id, batchId));

  let totalSuccess = 0;
  let totalFail = 0;
  let templatesCreated = 0;
  const errors: RowError[] = [];

  const totalRowsToProcess = selectedSheets.reduce(
    (acc, s) => acc + (allRowsBySheet[s]?.length ?? 0),
    0,
  );
  let processed = 0;

  for (const sheetName of selectedSheets) {
    const rows = allRowsBySheet[sheetName] ?? [];
    const sheetMapping = mappings[sheetName] ?? {};

    if (rows.length === 0) continue;

    // Sanitize sheet name → BOM code
    const baseCode = sheetName
      .toUpperCase()
      .replace(/[^A-Z0-9_\-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const bomCode = baseCode.length >= 2 ? baseCode : `BOM-${sheetName}`;

    // Create BOM template per sheet (SKIP nếu code đã tồn tại)
    const [existing] = await db
      .select({ id: bomTemplate.id })
      .from(bomTemplate)
      .where(eq(bomTemplate.code, bomCode))
      .limit(1);

    let templateId: string;
    if (existing) {
      templateId = existing.id;
    } else {
      const [created] = await db
        .insert(bomTemplate)
        .values({
          code: bomCode,
          name: sheetName.slice(0, 250),
          status: "DRAFT",
          targetQty: "1",
          createdBy: actorId,
          description: `Imported từ batch ${batchId}`,
        })
        .returning({ id: bomTemplate.id });
      if (!created) throw new Error(`Không tạo được template cho sheet ${sheetName}`);
      templateId = created.id;
      templatesCreated++;
    }

    // Process rows per chunk 100
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const result = await processChunk({
        chunk,
        templateId,
        sheetName,
        mapping: sheetMapping,
        autoCreateMissingItems,
        actorId,
        startPosition:
          (await nextRootPosition(templateId)) + (i === 0 ? 0 : 0),
      });
      totalSuccess += result.success;
      totalFail += result.fail;
      errors.push(...result.errors);
      processed += chunk.length;

      await db
        .update(importBatch)
        .set({ rowSuccess: totalSuccess, rowFail: totalFail })
        .where(eq(importBatch.id, batchId));

      await job.updateProgress(
        Math.min(100, Math.round((processed / Math.max(1, totalRowsToProcess)) * 100)),
      );
    }
  }

  await db
    .update(importBatch)
    .set({
      status: "done",
      finishedAt: new Date(),
      rowSuccess: totalSuccess,
      rowFail: totalFail,
      errorJson: errors.slice(0, 1000),
    })
    .where(eq(importBatch.id, batchId));

  return { success: totalSuccess, fail: totalFail, templatesCreated };
}

async function nextRootPosition(templateId: string): Promise<number> {
  const [r] = await db
    .select({
      next: sql<number>`COALESCE(MAX(position), 0) + 1`,
    })
    .from(bomLine)
    .where(
      sql`${bomLine.templateId} = ${templateId} AND ${bomLine.parentLineId} IS NULL`,
    );
  return Number(r?.next ?? 1);
}

interface ProcessChunkInput {
  chunk: StoredRow[];
  templateId: string;
  sheetName: string;
  mapping: Record<string, string | null>;
  autoCreateMissingItems: boolean;
  actorId: string;
  startPosition: number;
}

async function processChunk(
  input: ProcessChunkInput,
): Promise<{ success: number; fail: number; errors: RowError[] }> {
  let success = 0;
  let fail = 0;
  const errors: RowError[] = [];

  // Invert mapping: target → source header
  const invMapping: Record<string, string> = {};
  for (const [sourceHeader, target] of Object.entries(input.mapping)) {
    if (target) invMapping[target] = sourceHeader;
  }

  await db.transaction(async (tx) => {
    let position = input.startPosition;
    for (const row of input.chunk) {
      try {
        const skuHeader = invMapping.componentSku;
        const qtyHeader = invMapping.qtyPerParent;

        if (!skuHeader || !qtyHeader) {
          throw new Error(
            "Thiếu mapping cột bắt buộc: componentSku hoặc qtyPerParent",
          );
        }

        const skuRaw = String(row.data[skuHeader] ?? "").trim();
        const qtyRaw = String(row.data[qtyHeader] ?? "").trim();

        if (!skuRaw) throw new Error("SKU trống");
        const qty = Number(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error(`Số lượng không hợp lệ: "${qtyRaw}"`);
        }

        // Lookup item theo SKU (normalize UPPER)
        const skuNorm = skuRaw.toUpperCase();
        const [existingItem] = await tx
          .select({ id: item.id })
          .from(item)
          .where(eq(item.sku, skuNorm))
          .limit(1);

        let componentItemId: string;
        if (existingItem) {
          componentItemId = existingItem.id;
        } else if (input.autoCreateMissingItems) {
          // Auto-create item: type=PURCHASED default (raw material Excel thường là mua ngoài)
          const nameFromDesc =
            String(row.data[invMapping.description ?? ""] ?? "").trim() ||
            skuNorm;
          const [created] = await tx
            .insert(item)
            .values({
              sku: skuNorm,
              name: nameFromDesc.slice(0, 250),
              itemType: "PURCHASED",
              uom: "PCS",
              status: "ACTIVE",
              isActive: true,
              createdBy: input.actorId,
              updatedBy: input.actorId,
            })
            .returning({ id: item.id });
          if (!created) throw new Error(`Không tạo được item SKU ${skuNorm}`);
          componentItemId = created.id;
        } else {
          errors.push({
            rowNumber: row.rowNumber,
            sheet: input.sheetName,
            field: "componentSku",
            reason: `SKU "${skuNorm}" chưa có trong master. Bật "Tự tạo item thiếu" để auto-tạo.`,
            rawValue: skuNorm,
          });
          fail++;
          continue;
        }

        // Optional fields
        const description =
          invMapping.description && row.data[invMapping.description]
            ? String(row.data[invMapping.description]).slice(0, 2000)
            : null;
        const supplierItemCode =
          invMapping.supplierItemCode && row.data[invMapping.supplierItemCode]
            ? String(row.data[invMapping.supplierItemCode]).slice(0, 128)
            : null;
        const sizeMeta =
          invMapping.size && row.data[invMapping.size]
            ? String(row.data[invMapping.size])
            : null;
        const seqMeta =
          invMapping.componentSeq && row.data[invMapping.componentSeq]
            ? String(row.data[invMapping.componentSeq])
            : null;
        const notesMeta =
          invMapping.notes && row.data[invMapping.notes]
            ? String(row.data[invMapping.notes])
            : null;

        const metadata: Record<string, unknown> = {};
        if (sizeMeta) metadata.size = sizeMeta;
        if (seqMeta) metadata.seq = seqMeta;
        if (notesMeta) metadata.note = notesMeta;
        metadata.importedFromSheet = input.sheetName;
        metadata.importedRow = row.rowNumber;

        await tx.insert(bomLine).values({
          templateId: input.templateId,
          parentLineId: null, // V1.1-alpha: import flat level 1
          componentItemId,
          level: 1,
          position: position++,
          qtyPerParent: String(qty),
          scrapPercent: "0",
          description,
          supplierItemCode,
          metadata,
        });

        success++;
      } catch (err) {
        fail++;
        errors.push({
          rowNumber: row.rowNumber,
          sheet: input.sheetName,
          field: "_commit",
          reason: err instanceof Error ? err.message : "Lỗi không xác định",
        });
      }
    }
  });

  return { success, fail, errors };
}
