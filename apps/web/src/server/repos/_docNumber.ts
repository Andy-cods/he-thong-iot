/**
 * V3.11.4 (audit 1.21) — Sinh số chứng từ an toàn với concurrency.
 *
 * Vấn đề chung ở 5 nơi (PO, inbound_receipt, work_order, material_request,
 * pr_paper_form_no): số được sinh bằng `MAX(seq)+1` hoặc `COUNT(*)+1` bên trong
 * transaction NHƯNG không có lock → 2 transaction đồng thời đọc cùng MAX → sinh
 * TRÙNG số → unique violation 500 (hoặc tệ hơn: trùng số phiếu giấy).
 *
 * Cách sửa 1 lần: `pg_advisory_xact_lock(hashtext(scope))` đầu transaction để
 * serialize theo (loại chứng từ + tháng). Lock tự release khi commit/rollback
 * (xact-level) nên không rò lock. Các transaction khác scope (loại/tháng khác)
 * không đợi nhau.
 */
import { sql } from "drizzle-orm";
import type { db as _db } from "@/lib/db";

/** Transaction handle của Drizzle (cùng kiểu callback db.transaction nhận). */
type Tx = Parameters<Parameters<typeof _db.transaction>[0]>[0];

export interface GenDocNoOpts {
  /** Bảng đầy đủ schema, ví dụ 'app.work_order'. */
  table: string;
  /** Cột chứa số chứng từ, ví dụ 'wo_no'. */
  column: string;
  /** Tiền tố + tháng, ví dụ 'WO-2607'. Số cuối cùng = `${prefix}-${seq}`. */
  prefix: string;
  /**
   * Vị trí phần seq khi SPLIT_PART theo '-' (1-indexed). Với 'WO-2607-0001'
   * (prefix 'WO-2607') seq nằm ở part 3.
   */
  seqPart: number;
  /** Độ dài pad số 0, mặc định 4 → 0001. */
  pad?: number;
}

/**
 * Sinh số chứng từ kế tiếp cho `prefix`, an toàn concurrency.
 * PHẢI gọi trong 1 db.transaction (nhận `tx`); lock giữ tới hết transaction đó.
 */
export async function genDocNo(tx: Tx, opts: GenDocNoOpts): Promise<string> {
  const pad = opts.pad ?? 4;

  // Advisory lock theo scope = "docno:<prefix>" để chỉ serialize cùng loại+tháng.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${"docno:" + opts.prefix}))`,
  );

  // MAX(seq)+1 — SPLIT_PART lấy phần seq, regex chặn chuỗi rác. table/column là
  // hằng nội bộ (không phải input user) nên sql.raw an toàn.
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

/**
 * Tiện ích: yymm hiện tại theo giờ Việt Nam (VD '2607' cho tháng 07/2026).
 *
 * Review 2A-fix — PHẢI theo Asia/Ho_Chi_Minh (+07), KHÔNG dùng UTC. Trước đây
 * `toISOString()` (UTC) khiến chứng từ tạo trong 00:00–07:00 ngày 1 đầu tháng
 * bị gán nhãn tháng TRƯỚC + nối tiếp seq tháng cũ (khớp gen_pr_paper_form_no
 * vốn đã dùng `to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'MMYY')`). VN
 * luôn +07 (không DST) nên cộng 7 giờ vào epoch rồi đọc UTC là chính xác.
 */
export function currentYymm(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return vn.toISOString().slice(2, 7).replace("-", "");
}
