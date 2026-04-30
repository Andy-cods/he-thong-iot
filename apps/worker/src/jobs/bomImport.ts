import type { Job } from "bullmq";
import { asc, eq, sql } from "drizzle-orm";
import {
  bomLine,
  bomSheet,
  bomSheetMaterialRow,
  bomSheetProcessRow,
  bomTemplate,
  importBatch,
  item,
  itemSupplier,
  materialMaster,
  processMaster,
  supplier,
  userAccount,
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
    let isNewTemplate = false;
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
      isNewTemplate = true;
    }

    // V3.7.27 — Auto-create MATERIAL sheet + populate full catalog cho template mới.
    // Bằng với behavior của manual createTemplate (apps/web bomTemplates.ts).
    // User feedback 2026-04-30: "sheet Vật liệu phải tự động tạo khi tạo BOM list".
    if (isNewTemplate) {
      await ensureMaterialSheetWithCatalog(templateId, actorId);
    }

    // Tìm hoặc tạo bom_sheet kind=PROJECT (mọi bom_line phải có sheet_id NOT NULL).
    const [existingSheet] = await db
      .select({ id: bomSheet.id })
      .from(bomSheet)
      .where(
        sql`${bomSheet.templateId} = ${templateId} AND ${bomSheet.kind} = 'PROJECT'`,
      )
      .limit(1);

    let sheetId: string;
    if (existingSheet) {
      sheetId = existingSheet.id;
    } else {
      const [createdSheet] = await db
        .insert(bomSheet)
        .values({
          templateId,
          name: sheetName.slice(0, 250),
          kind: "PROJECT",
          position: 1,
          createdBy: actorId,
          metadata: { sourceSheetName: sheetName, importedFromBatch: batchId },
        })
        .returning({ id: bomSheet.id });
      if (!createdSheet)
        throw new Error(`Không tạo được bom_sheet cho ${sheetName}`);
      sheetId = createdSheet.id;
    }

    // Process rows per chunk 100
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const result = await processChunk({
        chunk,
        templateId,
        sheetId,
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

/**
 * V3.7.27 — Tạo MATERIAL sheet + populate toàn bộ material_master/process_master
 * giống manual createTemplate (apps/web/src/server/repos/bomTemplates.ts).
 * Idempotent: nếu sheet MATERIAL đã có, skip.
 */
async function ensureMaterialSheetWithCatalog(
  templateId: string,
  actorId: string,
): Promise<void> {
  const [existingMat] = await db
    .select({ id: bomSheet.id })
    .from(bomSheet)
    .where(
      sql`${bomSheet.templateId} = ${templateId} AND ${bomSheet.kind} = 'MATERIAL'`,
    )
    .limit(1);
  if (existingMat) return;

  const [created] = await db
    .insert(bomSheet)
    .values({
      templateId,
      name: "Material & Process",
      kind: "MATERIAL",
      position: 2,
      metadata: { defaultSheet: true, combined: true },
      createdBy: actorId,
    })
    .returning({ id: bomSheet.id });
  if (!created) return;

  const allMaterials = await db
    .select({
      code: materialMaster.code,
      nameVn: materialMaster.nameVn,
      pricePerKg: materialMaster.pricePerKg,
    })
    .from(materialMaster)
    .where(eq(materialMaster.isActive, true))
    .orderBy(asc(materialMaster.category), asc(materialMaster.code));

  if (allMaterials.length > 0) {
    await db.insert(bomSheetMaterialRow).values(
      allMaterials.map((m, idx) => ({
        sheetId: created.id,
        materialCode: m.code,
        nameOverride: m.nameVn,
        pricePerKg: m.pricePerKg,
        status: "PLANNED" as const,
        position: idx + 1,
        blankSize: {} as Record<string, unknown>,
        createdBy: actorId,
      })),
    );
  }

  const allProcesses = await db
    .select({
      code: processMaster.code,
      nameVn: processMaster.nameVn,
      pricePerUnit: processMaster.pricePerUnit,
      pricingUnit: processMaster.pricingUnit,
    })
    .from(processMaster)
    .where(eq(processMaster.isActive, true))
    .orderBy(asc(processMaster.code));

  if (allProcesses.length > 0) {
    await db.insert(bomSheetProcessRow).values(
      allProcesses.map((p, idx) => ({
        sheetId: created.id,
        processCode: p.code,
        nameOverride: p.nameVn,
        pricePerUnit: p.pricePerUnit,
        pricingUnit: p.pricingUnit as string,
        position: idx + 1,
        createdBy: actorId,
      })),
    );
  }
}

/**
 * V3.7.27 — Lookup supplier by name (case-insensitive) hoặc tạo mới.
 * Code auto-derive từ name (UPPER + slug). Race-safe via onConflictDoNothing.
 * Trả supplier_id để link item_supplier.
 */
async function lookupOrCreateSupplier(
  tx: typeof db,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const [existingSup] = await tx
    .select({ id: supplier.id })
    .from(supplier)
    .where(sql`LOWER(${supplier.name}) = LOWER(${trimmed})`)
    .limit(1);
  if (existingSup) return existingSup.id;

  const code = (
    trimmed
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `NCC-${Date.now()}`
  ).slice(0, 64);

  const [created] = await tx
    .insert(supplier)
    .values({
      code,
      name: trimmed.slice(0, 255),
      isActive: true,
    })
    .onConflictDoNothing({ target: supplier.code })
    .returning({ id: supplier.id });
  if (created) return created.id;

  // Conflict by code: tên khác nhau nhưng slug trùng → re-lookup by code
  const [byCode] = await tx
    .select({ id: supplier.id })
    .from(supplier)
    .where(eq(supplier.code, code))
    .limit(1);
  return byCode?.id ?? null;
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
  sheetId: string;
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
          // Auto-create item (race-safe): ON CONFLICT (sku) DO UPDATE RETURNING id.
          // 2 sheet cùng SKU mới chạy song song (hoặc 2 chunk) → sheet đầu INSERT,
          // sheet sau UPDATE updated_by/updated_at và vẫn trả id. Không unique_violation.
          const nameFromDesc =
            String(row.data[invMapping.description ?? ""] ?? "").trim() ||
            skuNorm;
          const [upserted] = await tx
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
            .onConflictDoUpdate({
              target: item.sku,
              set: {
                updatedBy: input.actorId,
                updatedAt: new Date(),
              },
            })
            .returning({ id: item.id });
          if (!upserted)
            throw new Error(`Không upsert được item SKU ${skuNorm}`);
          componentItemId = upserted.id;
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
        // V3.7.18 — Extended fields: PIC, category, totalQty
        const categoryMeta =
          invMapping.category && row.data[invMapping.category]
            ? String(row.data[invMapping.category]).slice(0, 64)
            : null;
        const totalQtyMeta =
          invMapping.totalQty && row.data[invMapping.totalQty]
            ? String(row.data[invMapping.totalQty])
            : null;
        const picRaw =
          invMapping.assignedToName && row.data[invMapping.assignedToName]
            ? String(row.data[invMapping.assignedToName]).trim().slice(0, 255)
            : null;

        // V3.7.18 — Lookup PIC user theo full_name (ILIKE substring match).
        // Nếu không match → giữ raw text trong assigned_to_name để resolve sau.
        let assignedToUserId: string | null = null;
        if (picRaw) {
          const [user] = await tx
            .select({ id: userAccount.id })
            .from(userAccount)
            .where(sql`${userAccount.fullName} ILIKE ${"%" + picRaw + "%"}`)
            .limit(1);
          if (user) assignedToUserId = user.id;
        }

        // V3.7.27 — NCC text → lookup/create supplier + link item_supplier.
        // Giữ supplierItemCode (snapshot text cho UI filter NCC) + thêm
        // supplier_id vào metadata cho procurement module sau dùng.
        let supplierIdResolved: string | null = null;
        if (supplierItemCode) {
          supplierIdResolved = await lookupOrCreateSupplier(
            tx as typeof db,
            supplierItemCode,
          );
          if (supplierIdResolved) {
            // Link item ↔ supplier (idempotent — uniqueIndex(item_id, supplier_id))
            await tx
              .insert(itemSupplier)
              .values({
                itemId: componentItemId,
                supplierId: supplierIdResolved,
              })
              .onConflictDoNothing({
                target: [itemSupplier.itemId, itemSupplier.supplierId],
              });
          }
        }

        const metadata: Record<string, unknown> = {};
        if (sizeMeta) metadata.size = sizeMeta;
        if (seqMeta) metadata.seq = seqMeta;
        if (notesMeta) metadata.note = notesMeta;
        if (categoryMeta) metadata.category = categoryMeta;
        if (totalQtyMeta) metadata.totalQty = totalQtyMeta;
        if (picRaw) metadata.picRaw = picRaw;
        if (supplierIdResolved) metadata.supplierId = supplierIdResolved;
        metadata.importedFromSheet = input.sheetName;
        metadata.importedRow = row.rowNumber;

        await tx.insert(bomLine).values({
          templateId: input.templateId,
          sheetId: input.sheetId,
          parentLineId: null, // V1.1-alpha: import flat level 1
          componentItemId,
          level: 1,
          position: position++,
          qtyPerParent: String(qty),
          scrapPercent: "0",
          description,
          supplierItemCode,
          assignedToUserId,
          assignedToName: picRaw,
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
