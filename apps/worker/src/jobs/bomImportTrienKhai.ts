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
  effectiveDuplicateMode,
  inferSetCount,
  makeBomImportOutcome,
  newItemKey,
  newItemSkuBase,
  planTrienKhaiRows,
  resolveSupplierName,
  statusAfterReplace,
  trienKhaiTemplateCode,
  uniqueSku,
  type BomDuplicateMode,
  type BomImportOutcome,
  type CommitDecision,
  type CommitMatch,
  type CommitRow,
} from "@iot/shared";
import { db } from "../db.js";
import { ensureMaterialSheetWithCatalog } from "./bomImport.js";
import { publishBomEvent } from "../bomEvents.js";
import {
  ReplaceBlockedError,
  assertReplaceAllowed,
  backupTemplateLines,
  hasReleasedRevision,
  rereleaseAfterReplace,
  deleteTemplateLines,
  resolveNewCode,
  saveOutcomes,
  syncBoardAfterReplace,
} from "./bomReplace.js";

/**
 * BOM V5 WP4b — commit mẫu "BOM triển khai". Worker KHÔNG đọc/ghi file ảnh:
 * chỉ dùng assetId/fullUrl đã có trong previewJson (app lưu ảnh lúc upload).
 *
 * Nhập lại BOM (mã dự án đã có):
 *   - replace  : ghi đè dòng CÙNG BOM (1 transaction, lưu bản cũ = revision SUPERSEDED)
 *   - new_code : tạo BOM mới mã khác (<mã>-V2…), BOM cũ giữ nguyên
 *   - skip     : bỏ qua — kết quả ghi rõ "Bỏ qua…" (không còn báo thành công giả)
 *   - error    : dừng với lỗi
 *   - upsert   : alias replace (cũ nối thêm dòng → BOM nhân đôi)
 */
export interface BomImportTrienKhaiJob {
  batchId: string;
  actorId: string;
  duplicateMode: BomDuplicateMode;
  /** Mã BOM mới khi duplicateMode = new_code (trống → tự lấy <mã>-V2…). */
  newCode?: string;
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

/** Ghi vào bom_template.metadata.lastImport để retry dựng lại đúng kết quả. */
interface LastImportMeta {
  batchId: string;
  action: BomImportOutcome["action"];
  linesRemoved?: number;
  backupRevisionNo?: string | null;
  rereleasedRevisionNo?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  conflictCode?: string | null;
}

export async function processBomImportTrienKhai(
  job: Job<BomImportTrienKhaiJob>,
): Promise<TrienKhaiCommitResult> {
  const { batchId, actorId, decisions } = job.data;
  const mode = effectiveDuplicateMode(job.data.duplicateMode);

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
  // item.material_code có FK → app.material_master; chỉ gán mã đã có trong danh mục.
  const mmRows = await db.execute(sql`SELECT upper(code) AS code FROM app.material_master`);
  const knownMaterialCodes = new Set(
    (mmRows as unknown as Array<{ code: string }>).map((r) => r.code),
  );
  if (undecided.length > 0) {
    throw new Error(`Còn dòng chưa quyết định vật tư: ${undecided.slice(0, 10).join(", ")}`);
  }

  await db
    .update(importBatch)
    .set({ status: "committing", rowSuccess: 0, rowFail: 0, rowTotal: rows.length, startedAt: batch.startedAt ?? new Date() })
    .where(eq(importBatch.id, batchId));

  // --- Template (idempotent theo importedFromBatch, rồi theo code) ---
  const baseCode = trienKhaiTemplateCode(tk.projectCode, batchId);
  const title = (tk.title ?? baseCode).slice(0, 250);
  // Số bộ: ghi chú "Số bộ = N" (parser) → suy từ SL ÷ Hệ số → 1. Preview cũ
  // (trước bản sửa) có thể thiếu → suy lại ở đây, cùng hàm với parser.
  const setCount = inferSetCount(tk.setCount, rows).setCount;
  const targetQty = String(setCount);

  let templateId: string;
  let templateCode = baseCode;
  let templatesCreated = 0;
  /** Ghi đè: thực hiện trong CÙNG transaction với việc ghi dòng mới. */
  let replacing = false;
  let last: LastImportMeta;

  // Retry của chính batch này (crash sau khi đã tạo/ghi đè) → dùng lại template đó.
  const [own] = await db
    .select({ id: bomTemplate.id, code: bomTemplate.code, metadata: bomTemplate.metadata })
    .from(bomTemplate)
    .where(sql`${bomTemplate.metadata} ->> 'importedFromBatch' = ${batchId}`)
    .limit(1);
  const [existing] = own
    ? []
    : await db
        .select({ id: bomTemplate.id, status: bomTemplate.status })
        .from(bomTemplate)
        .where(eq(bomTemplate.code, baseCode))
        .limit(1);

  if (own) {
    templateId = own.id;
    templateCode = own.code;
    const prev = (own.metadata as { lastImport?: LastImportMeta } | null)?.lastImport;
    last = prev?.batchId === batchId ? prev : { batchId, action: "created" };
  } else if (existing && mode !== "new_code") {
    templateId = existing.id;
    const [line] = await db
      .select({ id: bomLine.id })
      .from(bomLine)
      .where(eq(bomLine.templateId, templateId))
      .limit(1);
    if (mode === "replace") {
      replacing = true;
      last = { batchId, action: "replaced" };
    } else if (!line) {
      // BOM có sẵn nhưng chưa có dòng → ghi dòng vào (như trước).
      last = { batchId, action: "filled" };
    } else if (mode === "error") {
      throw new Error(
        `BOM "${baseCode}" đã có dữ liệu (duplicateMode=error). Đổi mã dự án hoặc chọn chế độ khác.`,
      );
    } else {
      const outcome = makeBomImportOutcome({
        action: "skipped",
        templateId,
        templateCode: baseCode,
        linesWritten: 0,
        reason: "mã BOM đã tồn tại và bạn chọn bỏ qua",
      });
      await db
        .update(importBatch)
        .set({
          status: "done",
          finishedAt: new Date(),
          rowSuccess: 0,
          rowFail: 0,
          errorJson: [{ rowNumber: 0, sheet: tk.sheetName, field: "_duplicate", reason: outcome.message }],
        })
        .where(eq(importBatch.id, batchId));
      await saveOutcomes(batchId, [outcome]);
      return { success: 0, fail: 0, templatesCreated: 0, itemsCreated: 0, skipped: true };
    }
  } else {
    if (existing) {
      templateCode = await resolveNewCode(job.data.newCode, baseCode);
      last = { batchId, action: "new_code", conflictCode: baseCode };
    } else {
      last = { batchId, action: "created" };
    }
    const [created] = await db
      .insert(bomTemplate)
      .values({
        code: templateCode,
        name: title,
        status: "DRAFT",
        targetQty,
        createdBy: actorId,
        description: `Imported từ batch ${batchId} (mẫu BOM triển khai)`,
        metadata: { importedFromBatch: batchId, template: "TRIEN_KHAI", lastImport: last },
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
  try {
    await db.transaction(async (tx) => {
      let hadReleased = false;
      if (replacing) {
        // Ghi đè: khoá BOM → chặn nếu dòng đã có tham chiếu sản xuất → lưu bản
        // cũ thành revision SUPERSEDED → xoá dòng cũ → cập nhật đầu BOM.
        const [locked] = await tx
          .select({ status: bomTemplate.status, metadata: bomTemplate.metadata })
          .from(bomTemplate)
          .where(eq(bomTemplate.id, templateId))
          .for("update");
        if (!locked) throw new Error(`BOM ${templateCode} không còn tồn tại`);
        await assertReplaceAllowed(tx, templateId, templateCode);
        hadReleased = await hasReleasedRevision(tx, templateId);
        const backup = await backupTemplateLines(
          tx,
          templateId,
          actorId,
          `Bản lưu tự động trước khi ghi đè từ file "${batch.fileName}" (batch ${batchId.slice(0, 8)}).`,
        );
        await deleteTemplateLines(tx, templateId);
        const newStatus = statusAfterReplace(locked.status) as typeof locked.status;
        last = {
          batchId,
          action: "replaced",
          previousStatus: locked.status,
          newStatus,
          linesRemoved: backup?.lineCount ?? 0,
          backupRevisionNo: backup?.revisionNo ?? null,
        };
        await tx
          .update(bomTemplate)
          .set({
            name: title,
            targetQty,
            status: newStatus,
            updatedAt: new Date(),
            metadata: {
              ...((locked.metadata as Record<string, unknown>) ?? {}),
              importedFromBatch: batchId,
              template: "TRIEN_KHAI",
              lastImport: last,
              lastReplacedAt: new Date().toISOString(),
            },
          })
          .where(eq(bomTemplate.id, templateId));
      }

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
              .values({ ...buildNewItemValues(row, sku, knownMaterialCodes), createdBy: actorId, updatedBy: actorId })
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
          .values(buildBomLineValues(row, { templateId, sheetId, componentItemId: itemId, position: position++, batchId, supplierId, setCount }));
      }

      if (last.action === "replaced") {
        await syncBoardAfterReplace(tx, { templateId, code: templateCode, name: title, targetQty, actorId });
        // BOM đang có bản RELEASED (snapshot dòng cũ) → phát hành lại theo dòng mới.
        if (hadReleased) {
          const rr = await rereleaseAfterReplace(
            tx,
            templateId,
            actorId,
            `Tự phát hành lại sau khi ghi đè từ file "${batch.fileName}" (batch ${batchId.slice(0, 8)}).`,
          );
          last = { ...last, rereleasedRevisionNo: rr?.revisionNo ?? null };
        }
      }
    });
  } catch (err) {
    if (err instanceof ReplaceBlockedError) {
      // Lỗi nghiệp vụ: không retry, báo rõ lý do (UI gợi ý "Tạo BOM mới với mã khác").
      await db
        .update(importBatch)
        .set({ status: "failed", finishedAt: new Date(), errorMessage: err.message })
        .where(eq(importBatch.id, batchId));
      await saveOutcomes(batchId, [
        makeBomImportOutcome({ action: "skipped", templateId, templateCode, linesWritten: 0, reason: err.message }),
      ]);
      return { success: 0, fail: 0, templatesCreated: 0, itemsCreated: 0, skipped: true };
    }
    throw err;
  }

  await db
    .update(importBatch)
    .set({ status: "done", finishedAt: new Date(), rowSuccess: rows.length, rowFail: 0, errorJson: [] })
    .where(eq(importBatch.id, batchId));
  await saveOutcomes(batchId, [
    makeBomImportOutcome({
      action: last.action,
      templateId,
      templateCode,
      linesWritten: rows.length,
      linesRemoved: last.linesRemoved,
      backupRevisionNo: last.backupRevisionNo,
      rereleasedRevisionNo: last.rereleasedRevisionNo,
      previousStatus: last.previousStatus,
      newStatus: last.newStatus,
      conflictCode: last.conflictCode,
    }),
  ]);
  await job.updateProgress(100);
  publishBomEvent({ templateId, kind: "import", actorId });

  return { success: rows.length, fail: 0, templatesCreated, itemsCreated };
}
