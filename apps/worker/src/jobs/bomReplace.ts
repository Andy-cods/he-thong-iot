import { and, asc, eq, sql } from "drizzle-orm";
import { bomLine, bomRevision, bomTemplate, importBatch } from "@iot/db/schema";
import { countBomLineRefs } from "@iot/db/bom-refs";
import {
  boardProductNameFromBom,
  nextFreeBomCode,
  replaceBlockedMessage,
  sanitizeNewBomCode,
  type BomImportOutcome,
  type BomRefCount,
} from "@iot/shared";
import { db } from "../db.js";

/**
 * Nhập lại BOM — phần dùng chung 2 job import (mẫu triển khai + cổ điển):
 *   - chặn ghi đè khi dòng BOM đã có tham chiếu sản xuất,
 *   - lưu bản sao lưu (bom_revision SUPERSEDED) trước khi xoá dòng,
 *   - chọn mã trống cho "Tạo BOM mới với mã khác",
 *   - ghi `preview_json.outcomes` để màn Kết quả nói đúng việc đã làm.
 */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

/** Lỗi nghiệp vụ có câu tiếng Việt (job fail với message này, không retry vô ích). */
export class ReplaceBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplaceBlockedError";
  }
}

export async function assertReplaceAllowed(exec: Exec, templateId: string, code: string): Promise<void> {
  const refs = (await countBomLineRefs(exec, templateId)) as BomRefCount[];
  const msg = replaceBlockedMessage(code, refs);
  if (msg) throw new ReplaceBlockedError(msg);
}

function nextRevisionNo(existing: string[]): string {
  let max = 0;
  for (const r of existing) {
    const m = /^R(\d+)$/.exec(r);
    if (m?.[1]) max = Math.max(max, Number.parseInt(m[1], 10) || 0);
  }
  return `R${(max + 1).toString().padStart(2, "0")}`;
}

/** Snapshot đóng băng cây dòng hiện tại — cùng format với releaseRevision (web). Null nếu chưa có dòng. */
async function buildFrozenSnapshot(
  tx: Tx,
  templateId: string,
): Promise<{ frozen: Record<string, unknown>; lineCount: number } | null> {
  const [tpl] = await tx
    .select({ id: bomTemplate.id, code: bomTemplate.code, name: bomTemplate.name })
    .from(bomTemplate)
    .where(eq(bomTemplate.id, templateId))
    .limit(1);
  if (!tpl) return null;
  const lines = await tx
    .select()
    .from(bomLine)
    .where(eq(bomLine.templateId, templateId))
    .orderBy(asc(bomLine.level), asc(bomLine.position));
  if (lines.length === 0) return null;
  const frozen = {
    templateId: tpl.id,
    templateCode: tpl.code,
    templateName: tpl.name,
    capturedAt: new Date().toISOString(),
    totalLines: lines.length,
    maxDepth: lines.reduce((m, l) => Math.max(m, l.level), 0),
    lines: lines.map((l) => ({
      id: l.id,
      parentLineId: l.parentLineId,
      componentItemId: l.componentItemId,
      level: l.level,
      position: l.position,
      qtyPerParent: l.qtyPerParent,
      scrapPercent: l.scrapPercent,
      uom: l.uom,
      description: l.description,
      metadata: l.metadata as Record<string, unknown>,
    })),
  };
  return { frozen, lineCount: lines.length };
}

async function nextRevisionNoFor(tx: Tx, templateId: string): Promise<string> {
  const existing = await tx
    .select({ revisionNo: bomRevision.revisionNo })
    .from(bomRevision)
    .where(eq(bomRevision.templateId, templateId));
  return nextRevisionNo(existing.map((r) => r.revisionNo));
}

/**
 * Lưu cây dòng hiện tại thành 1 revision SUPERSEDED (cùng format frozen_snapshot
 * của releaseRevision ở web) — chỉ để xem lại/khôi phục tay, KHÔNG dùng explode
 * đơn hàng (chỉ RELEASED mới explode được). Trả null nếu BOM chưa có dòng.
 */
export async function backupTemplateLines(
  tx: Tx,
  templateId: string,
  actorId: string,
  note: string,
): Promise<{ revisionNo: string; lineCount: number } | null> {
  const snap = await buildFrozenSnapshot(tx, templateId);
  if (!snap) return null;
  const revisionNo = await nextRevisionNoFor(tx, templateId);
  await tx.insert(bomRevision).values({
    templateId,
    revisionNo,
    status: "SUPERSEDED",
    frozenSnapshot: { ...snap.frozen, backupBeforeReplace: true },
    releasedAt: null,
    releasedBy: actorId,
    notes: note.slice(0, 2000),
  });
  return { revisionNo, lineCount: snap.lineCount };
}

/** BOM có đang giữ revision RELEASED (đã kích hoạt) không — gọi TRƯỚC khi ghi đè. */
export async function hasReleasedRevision(tx: Tx, templateId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: bomRevision.id })
    .from(bomRevision)
    .where(and(eq(bomRevision.templateId, templateId), eq(bomRevision.status, "RELEASED")))
    .limit(1);
  return rows.length > 0;
}

/**
 * Sau khi dòng mới đã ghi xong: các revision RELEASED (snapshot dòng CŨ) → SUPERSEDED
 * rồi phát hành revision RELEASED mới từ dòng mới, để explode đơn hàng dùng đúng bản mới.
 * Gọi chỉ khi BOM đã có RELEASED trước khi ghi đè. Trả null nếu không có dòng mới.
 */
export async function rereleaseAfterReplace(
  tx: Tx,
  templateId: string,
  actorId: string,
  note: string,
): Promise<{ revisionNo: string } | null> {
  const snap = await buildFrozenSnapshot(tx, templateId);
  if (!snap) return null;
  const revisionNo = await nextRevisionNoFor(tx, templateId);
  const now = new Date();
  await tx
    .update(bomRevision)
    .set({
      status: "SUPERSEDED",
      notes: sql`COALESCE(${bomRevision.notes}, '') || ${`
[SUPERSEDED bởi ${revisionNo} lúc ${now.toISOString()}]`}`,
    })
    .where(and(eq(bomRevision.templateId, templateId), eq(bomRevision.status, "RELEASED")));
  await tx.insert(bomRevision).values({
    templateId,
    revisionNo,
    status: "RELEASED",
    frozenSnapshot: snap.frozen,
    releasedAt: now,
    releasedBy: actorId,
    notes: note.slice(0, 2000),
  });
  return { revisionNo };
}

/** Xoá toàn bộ dòng của template (con trước nhờ parent_line_id CASCADE). */
export async function deleteTemplateLines(tx: Tx, templateId: string): Promise<number> {
  const res = await tx.execute(sql`DELETE FROM app.bom_line WHERE template_id = ${templateId}`);
  return Number((res as unknown as { count?: number })?.count ?? 0);
}

/**
 * Mã cho lựa chọn "Tạo BOM mới với mã khác": dùng mã người dùng chọn nếu còn
 * trống, ngược lại lấy `<base>-Vn` trống kế tiếp.
 */
export async function resolveNewCode(requested: string | undefined, base: string): Promise<string> {
  const want = sanitizeNewBomCode(requested);
  const root = (want ?? base).toUpperCase().replace(/-V\d+$/, "");
  const like = root.replace(/[\\%_]/g, "\\$&") + "%";
  const rows = await db
    .select({ code: bomTemplate.code })
    .from(bomTemplate)
    .where(sql`UPPER(${bomTemplate.code}) LIKE ${like}`);
  const taken = new Set(rows.map((r) => r.code.toUpperCase()));
  if (want && want !== base.toUpperCase() && !taken.has(want)) return want;
  taken.add(base.toUpperCase());
  return nextFreeBomCode(root, taken);
}

/**
 * Sau khi ghi đè: dòng Bảng sản xuất đã liên kết BOM mà còn QUEUED ("Chờ GC")
 * → cập nhật tên + SL kế hoạch theo bản mới (ghi history). Dòng đã chạy không đụng.
 */
export async function syncBoardAfterReplace(
  tx: Tx,
  input: { templateId: string; code: string; name: string; targetQty: string; actorId: string },
): Promise<number> {
  const productName = boardProductNameFromBom(input.name, input.code).slice(0, 2000);
  const qty = Math.min(Number(input.targetQty) || 0, 10_000_000);
  const rows = (await tx.execute(sql`
    SELECT id, product_name, qty_planned::text AS qty_planned
    FROM app.production_board_item
    WHERE bom_template_id = ${input.templateId} AND status = 'QUEUED'
  `)) as unknown as Array<{ id: string; product_name: string; qty_planned: string }>;
  let n = 0;
  for (const r of rows) {
    const nameChanged = r.product_name !== productName;
    const qtyChanged = Number(r.qty_planned) !== qty;
    if (!nameChanged && !qtyChanged) continue;
    await tx.execute(sql`
      UPDATE app.production_board_item
      SET product_name = ${productName}, qty_planned = ${String(qty)}, updated_by = ${input.actorId}
      WHERE id = ${r.id}
    `);
    if (qtyChanged) {
      await tx.execute(sql`
        INSERT INTO app.production_board_history (item_id, field, old_value, new_value, changed_by)
        VALUES (${r.id}, 'qty_planned', ${r.qty_planned}, ${String(qty)}, ${input.actorId})
      `);
    }
    if (nameChanged) {
      await tx.execute(sql`
        INSERT INTO app.production_board_history (item_id, field, old_value, new_value, changed_by)
        VALUES (${r.id}, 'product_name', ${r.product_name.slice(0, 500)}, ${productName.slice(0, 500)}, ${input.actorId})
      `);
    }
    n++;
  }
  return n;
}

/** Ghi kết quả vào preview_json.outcomes (màn Kết quả đọc qua /status). */
export async function saveOutcomes(batchId: string, outcomes: BomImportOutcome[]): Promise<void> {
  await db
    .update(importBatch)
    .set({
      previewJson: sql`COALESCE(${importBatch.previewJson}, '{}'::jsonb) || jsonb_build_object('outcomes', ${JSON.stringify(outcomes)}::jsonb)`,
    })
    .where(eq(importBatch.id, batchId));
}
