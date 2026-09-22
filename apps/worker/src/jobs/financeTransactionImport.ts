import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { importBatch } from "@iot/db/schema";
import { db } from "../db.js";

/**
 * V4.0 đợt 2 Phase D — Worker xử lý finance-transaction-import-commit.
 *
 * Bám khuôn `itemImport.ts` (chunk 500 dòng, transaction per chunk, savepoint
 * per-row) nhưng ghi thẳng bằng raw SQL (`sql` template) thay vì Drizzle
 * builder cho bảng `fin_transaction`, vì worker KHÔNG import code apps/web
 * (không dùng `_docNumber.ts`/genDocNo) — tự cài đặt sinh mã chứng từ AN TOÀN
 * CONCURRENCY bằng chính kỹ thuật `pg_advisory_xact_lock` + SPLIT_PART mà
 * `_docNumber.ts` dùng (đọc file đó ở apps/web để đối chiếu, giữ ĐÚNG logic).
 *
 * ⚠ CẢNH BÁO ĐÃ CÓ SỰ CỐ THẬT (xem finTransactions.ts/finPayments.ts bên
 * apps/web): mã dạng `PC-2609-0001` có 3 phần khi SPLIT_PART theo dấu '-' —
 * seq PHẢI lấy ở phần thứ 3 (seqPart=3). Từng để 2 → lấy nhầm "2609" làm seq
 * → sinh mã trùng → vỡ unique constraint. Test kỹ khi insert nhiều dòng cùng
 * lúc (chunk 500 dòng có thể cùng direction/tháng).
 *
 * Dedupe: insert dùng `ON CONFLICT (dedupe_hash) DO NOTHING` — khớp
 * `fin_transaction_dedupe_uk`. Dòng bị conflict được đếm vào `duplicateRows`
 * (gộp vào rowFail của import_batch kèm ghi rõ trong errorJson đây là "trùng,
 * đã bỏ qua" KHÁC với lỗi validate, theo wave-2-finance.md §D.6).
 */

export interface FinanceTransactionImportCommitJob {
  batchId: string;
  fileHash: string;
  actorId: string;
}

interface FinanceImportRowData {
  transactionDate: string;
  direction: "IN" | "OUT";
  accountId: string;
  accountCode: string;
  categoryId: string | null;
  amount: number;
  description: string | null;
  supplierId: string | null;
  supplierNameRaw: string | null;
  externalRef: string | null;
  dedupeHash: string;
}

interface StoredRow {
  rowNumber: number;
  data: FinanceImportRowData;
  duplicate: boolean;
}

const CHUNK_SIZE = 500;

/**
 * Sinh mã chứng từ kế tiếp cho `prefix`, an toàn concurrency — bản sao logic
 * `_docNumber.ts::genDocNo` (apps/web) cho phép worker dùng độc lập.
 * PHẢI gọi trong transaction (`tx`), lock giữ tới hết transaction đó.
 */
async function genDocNoWorker(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  opts: { table: string; column: string; prefix: string; seqPart: number; pad?: number },
): Promise<string> {
  const pad = opts.pad ?? 4;

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${"docno:" + opts.prefix}))`,
  );

  const rows = (await tx.execute(sql`
    SELECT COALESCE(MAX(
      CAST(SPLIT_PART(${sql.raw(opts.column)}, '-', ${opts.seqPart}) AS INTEGER)
    ), 0) AS max_seq
    FROM ${sql.raw(opts.table)}
    WHERE ${sql.raw(opts.column)} LIKE ${opts.prefix + "-%"}
      AND ${sql.raw(opts.column)} ~ ${"^" + opts.prefix + "-[0-9]+$"}
  `)) as unknown as Array<{ max_seq: number }>;

  const nextSeq = (rows[0]?.max_seq ?? 0) + 1;
  return `${opts.prefix}-${String(nextSeq).padStart(pad, "0")}`;
}

function currentYymmWorker(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(2, 7).replace("-", "");
}

export async function processFinanceTransactionImportCommit(
  job: Job<FinanceTransactionImportCommitJob>,
): Promise<{ success: number; fail: number; duplicate: number }> {
  const { batchId, actorId } = job.data;

  const [batch] = await db
    .select()
    .from(importBatch)
    .where(eq(importBatch.id, batchId))
    .limit(1);

  if (!batch) {
    throw new Error(`Import batch ${batchId} không tồn tại`);
  }

  const preview = batch.previewJson as { allRows?: StoredRow[] } | null;
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
    return { success: 0, fail: 0, duplicate: 0 };
  }

  await db
    .update(importBatch)
    .set({
      status: "committing",
      rowSuccess: 0,
      rowFail: 0,
      startedAt: batch.startedAt ?? new Date(),
    })
    .where(eq(importBatch.id, batchId));

  const errors: Array<{ rowNumber: number; field: string; reason: string; rawValue?: unknown }> = [];
  let totalSuccess = 0;
  let totalFail = 0;
  let totalDuplicate = 0;

  for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
    const chunk = allRows.slice(i, i + CHUNK_SIZE);
    const result = await processChunk(chunk, actorId);
    totalSuccess += result.success;
    totalFail += result.fail;
    totalDuplicate += result.duplicate;
    errors.push(...result.errors);

    await db
      .update(importBatch)
      .set({
        rowSuccess: totalSuccess,
        // rowFail gộp cả lỗi thật + dòng trùng bị DB conflict — import_batch
        // không có cột riêng cho duplicate (xem §D.6), phân biệt qua errorJson.
        rowFail: totalFail + totalDuplicate,
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
      rowFail: totalFail + totalDuplicate,
      errorJson: [...existingErrors, ...errors].slice(0, 1000),
    })
    .where(eq(importBatch.id, batchId));

  return { success: totalSuccess, fail: totalFail, duplicate: totalDuplicate };
}

async function processChunk(
  chunk: StoredRow[],
  actorId: string,
): Promise<{
  success: number;
  fail: number;
  duplicate: number;
  errors: Array<{ rowNumber: number; field: string; reason: string; rawValue?: unknown }>;
}> {
  let success = 0;
  let fail = 0;
  let duplicate = 0;
  const errors: Array<{ rowNumber: number; field: string; reason: string; rawValue?: unknown }> = [];

  await db.transaction(async (tx) => {
    for (const row of chunk) {
      try {
        // SAVEPOINT per-row (giống itemImport.ts) — lỗi 1 dòng không rollback
        // cả chunk 500 dòng.
        await tx.transaction(async (sp) => {
          const inserted = await insertOneTransaction(sp, row, actorId);
          if (inserted) {
            success++;
          } else {
            // ON CONFLICT DO NOTHING trả 0 row → dòng trùng (dedupe_hash đã tồn tại).
            duplicate++;
            errors.push({
              rowNumber: row.rowNumber,
              field: "_duplicate",
              reason: "Trùng giao dịch đã có trong hệ thống — đã bỏ qua.",
              rawValue: row.data.dedupeHash,
            });
          }
        });
      } catch (err) {
        fail++;
        const reason = err instanceof Error ? err.message : "Lỗi không xác định";
        errors.push({
          rowNumber: row.rowNumber,
          field: "_commit",
          reason,
        });
      }
    }
  });

  return { success, fail, duplicate, errors };
}

/** Trả `true` nếu insert thành công, `false` nếu bị ON CONFLICT DO NOTHING bỏ qua (trùng). */
async function insertOneTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: StoredRow,
  actorId: string,
): Promise<boolean> {
  const d = row.data;

  const prefix = `${d.direction === "IN" ? "PT" : "PC"}-${currentYymmWorker()}`;
  const code = await genDocNoWorker(tx, {
    table: "app.fin_transaction",
    column: "code",
    prefix,
    // Mã dạng `PC-2609-0001` có 3 phần — seq ở phần 3 (KHÔNG để 2, xem cảnh
    // báo đầu file — sự cố thật đã xảy ra với lỗi này).
    seqPart: 3,
    pad: 4,
  });

  const result = await tx.execute(sql`
    INSERT INTO app.fin_transaction (
      code, direction, account_id, category_id, amount, transaction_date,
      description, counterparty_type, supplier_id, invoice_id, payment_id,
      external_ref, dedupe_hash, status, created_by
    ) VALUES (
      ${code}, ${d.direction}, ${d.accountId}, ${d.categoryId}, ${d.amount},
      ${d.transactionDate}, ${d.description}, ${d.supplierId ? "SUPPLIER" : null},
      ${d.supplierId}, NULL, NULL, ${d.externalRef}, ${d.dedupeHash}, 'POSTED', ${actorId}
    )
    ON CONFLICT (dedupe_hash) DO NOTHING
    RETURNING id
  `);

  const rows = result as unknown as Array<{ id: string }>;
  return rows.length > 0;
}
