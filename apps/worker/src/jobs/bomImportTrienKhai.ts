import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import {
  bomLine,
  bomSheet,
  bomTemplate,
  importBatch,
  item,
  itemSupplier,
  supplier,
} from "@iot/db/schema";
import {
  buildBomLineValues,
  buildNewItemValues,
  newItemKey,
  newItemSkuBase,
  planTrienKhaiRows,
  resolveSupplierName,
  uniqueSku,
  type CommitDecision,
  type CommitMatch,
  type CommitRow,
} from "@iot/shared";
import { db } from "../db.js";
import { ensureMaterialSheetWithCatalog } from "./bomImport.js";

/**
 * BOM V5 WP4b — commit mẫu "BOM triển khai". Worker KHÔNG đọc/ghi file ảnh:
 * chỉ dùng assetId/fullUrl đã có trong previewJson (app lưu ảnh lúc upload).
 */
export interface BomImportTrienKhaiJob {
  batchId: string;
  actorId: string;
  duplicateMode: "skip" | "upsert" | "error";
  decisions: CommitDecision[];
}

interface TkPreview {
  template?: string;
  trienKhai?: {
    sheetName: string;
    projectCode: string | null;
    title: string | null;
    setCount: number | null;
    rows: Array<CommitRow & { match: CommitMatch }>;
  };
}

export interface TrienKhaiCommitResult {
  success: number;
  fail: number;
  templatesCreated: number;
  itemsCreated: number;
  skipped?: boolean;
}

function templateCode(projectCode: string | null, batchId: string): string {
  const base = (projectCode ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base.length >= 2 ? base : `TK-${batchId.slice(0, 8).toUpperCase()}`;
}

export async function processBomImportTrienKhai(
  job: Job<BomImportTrienKhaiJob>,
): Promise<TrienKhaiCommitResult> {
  const { batchId, actorId, duplicateMode, decisions } = job.data;

  const [batch] = await db.select().from(importBatch).where(eq(importBatch.id, batchId)).limit(1);
  if (!batch) throw new Error(`Import batch ${batchId} không tồn tại`);
  // Retry sau khi đã hoàn tất → không làm lại.
  if (batch.status === "done") {
    return {
      success: batch.rowSuccess ?? 0,
      fail: batch.rowFail ?? 0,
      templatesCreated: 0,
      itemsCreated: 0,
      skipped: true,
    };
  }

  const preview = (batch.previewJson ?? {}) as TkPreview;
  const tk = preview.trienKhai;
  if (preview.template !== "TRIEN_KHAI" || !tk) {
    throw new Error(`Batch ${batchId} không phải mẫu BOM triển khai`);
  }
  const rows = tk.rows;

  const { plan, undecided } = planTrienKhaiRows(rows, decisions);
  if (undecided.length > 0) {
    throw new Error(`Còn dòng chưa quyết định vật tư: ${undecided.slice(0, 10).join(", ")}`);
  }

  await db
    .update(importBatch)
    .set({ status: "committing", rowSuccess: 0, rowFail: 0, rowTotal: rows.length, startedAt: batch.startedAt ?? new Date() })
    .where(eq(importBatch.id, batchId));

  // --- Template + sheet (idempotent theo code / importedFromBatch) ---
  const code = templateCode(tk.projectCode, batchId);
  const [existing] = await db
    .select({ id: bomTemplate.id, metadata: bomTemplate.metadata })
    .from(bomTemplate)
    .where(eq(bomTemplate.code, code))
    .limit(1);

  let templateId: string;
  let templatesCreated = 0;
  const ownTemplate =
    !!existing && (existing.metadata as Record<string, unknown>)?.importedFromBatch === batchId;
  if (existing) {
    templateId = existing.id;
    if (!ownTemplate && (duplicateMode === "error" || duplicateMode === "skip")) {
      const [other] = await db
        .select({ id: bomLine.id })
        .from(bomLine)
        .where(
          sql`${bomLine.templateId} = ${templateId}
            AND (${bomLine.metadata} ->> 'importedFromBatch') IS DISTINCT FROM ${batchId}`,
        )
        .limit(1);
      if (other) {
        if (duplicateMode === "error") {
          throw new Error(
            `BOM "${code}" đã có dữ liệu (duplicateMode=error). Đổi mã dự án hoặc chọn chế độ khác.`,
          );
        }
        await db
          .update(importBatch)
          .set({
            status: "done",
            finishedAt: new Date(),
            errorJson: [
              { rowNumber: 0, sheet: tk.sheetName, field: "_duplicate", reason: `Bỏ qua: BOM "${code}" đã có dữ liệu (duplicateMode=skip).` },
            ],
          })
          .where(eq(importBatch.id, batchId));
        return { success: 0, fail: 0, templatesCreated: 0, itemsCreated: 0, skipped: true };
      }
    }
  } else {
    const [created] = await db
      .insert(bomTemplate)
      .values({
        code,
        name: (tk.title ?? code).slice(0, 250),
        status: "DRAFT",
        targetQty: String(tk.setCount && tk.setCount > 0 ? tk.setCount : 1),
        createdBy: actorId,
        description: `Imported từ batch ${batchId} (mẫu BOM triển khai)`,
        metadata: { importedFromBatch: batchId, template: "TRIEN_KHAI" },
      })
      .returning({ id: bomTemplate.id });
    if (!created) throw new Error("Không tạo được bom_template");
    templateId = created.id;
    templatesCreated = 1;
    await ensureMaterialSheetWithCatalog(templateId, actorId);
  }

  const [existingSheet] = await db
    .select({ id: bomSheet.id })
    .from(bomSheet)
    .where(sql`${bomSheet.templateId} = ${templateId} AND ${bomSheet.kind} = 'PROJECT'`)
    .limit(1);
  let sheetId: string;
  if (existingSheet) sheetId = existingSheet.id;
  else {
    const [cs] = await db
      .insert(bomSheet)
      .values({
        templateId,
        name: tk.sheetName.slice(0, 250),
        kind: "PROJECT",
        position: 1,
        createdBy: actorId,
        metadata: { sourceSheetName: tk.sheetName, importedFromBatch: batchId },
      })
      .returning({ id: bomSheet.id });
    if (!cs) throw new Error("Không tạo được bom_sheet");
    sheetId = cs.id;
  }

  // --- Ghi item + bom_line trong 1 transaction ---
  const suppliers = (
    await db
      .select({ id: supplier.id, code: supplier.code, name: supplier.name })
      .from(supplier)
      .where(eq(supplier.isActive, true))
  ).map((s) => ({ id: s.id, code: s.code, name: s.name }));

  let itemsCreated = 0;
  await db.transaction(async (tx) => {
    // Retry: xoá line đã ghi bởi chính batch này (không nhân đôi).
    await tx.execute(sql`DELETE FROM app.bom_line WHERE metadata ->> 'importedFromBatch' = ${batchId}`);

    const [pos] = await tx
      .select({ next: sql<number>`COALESCE(MAX(position), 0) + 1` })
      .from(bomLine)
      .where(sql`${bomLine.templateId} = ${templateId} AND ${bomLine.parentLineId} IS NULL`);
    let position = Number(pos?.next ?? 1);

    const newItemByKey = new Map<string, string>();
    const takenSku = new Set<string>();

    for (const row of rows) {
      const p = plan.get(row.position)!;
      let itemId: string;
      if (p.action === "USE") {
        itemId = p.itemId;
        // Chỉ gán ảnh khi item chưa có (không đè ảnh người dùng đặt tay).
        if (row.fullUrl) {
          await tx
            .update(item)
            .set({ imageUrl: row.fullUrl, updatedAt: new Date(), updatedBy: actorId })
            .where(sql`${item.id} = ${itemId} AND ${item.imageUrl} IS NULL`);
        }
      } else {
        const key = newItemKey(row);
        const shared = newItemByKey.get(key);
        if (shared) itemId = shared;
        else {
          const base = newItemSkuBase(row);
          // Nạp các sku trùng/bắt đầu bằng base (không phân biệt hoa/thường).
          const likePattern = base.toUpperCase().replace(/[\\%_]/g, "\\$&") + "%";
          const clash = await tx
            .select({ sku: item.sku })
            .from(item)
            .where(sql`UPPER(${item.sku}) LIKE ${likePattern}`);
          for (const c of clash) takenSku.add(c.sku.toUpperCase());
          const sku = uniqueSku(base, takenSku);
          takenSku.add(sku.toUpperCase());
          const [ins] = await tx
            .insert(item)
            .values({ ...buildNewItemValues(row, sku), createdBy: actorId, updatedBy: actorId })
            .returning({ id: item.id });
          if (!ins) throw new Error(`Không tạo được item ${sku}`);
          itemId = ins.id;
          itemsCreated++;
          newItemByKey.set(key, itemId);
        }
      }

      // NCC: chỉ gán supplier_id khi 1 nhà khớp chắc; ngược lại để supplier_pending.
      let supplierId: string | null = null;
      const names = row.supplierNames.filter((n) => n.trim());
      if (!row.supplierPending && names.length === 1) {
        const rs = resolveSupplierName(names[0]!, suppliers);
        if (rs.state === "MATCHED") supplierId = rs.supplierId;
      }
      if (supplierId) {
        await tx
          .insert(itemSupplier)
          .values({ itemId, supplierId })
          .onConflictDoNothing({ target: [itemSupplier.itemId, itemSupplier.supplierId] });
      }

      await tx
        .insert(bomLine)
        .values(buildBomLineValues(row, { templateId, sheetId, componentItemId: itemId, position: position++, batchId, supplierId }));
    }
  });

  await db
    .update(importBatch)
    .set({ status: "done", finishedAt: new Date(), rowSuccess: rows.length, rowFail: 0, errorJson: [] })
    .where(eq(importBatch.id, batchId));
  await job.updateProgress(100);

  return { success: rows.length, fail: 0, templatesCreated, itemsCreated };
}
