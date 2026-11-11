import { and, eq, sql } from "drizzle-orm";
import { bomLine, bomStageMove, bomTemplate } from "@iot/db/schema";
import { parseBomCategory, stagesFor, type BomCategory } from "@iot/shared";
import { db } from "@/lib/db";
import {
  buildStageBuckets,
  canMove,
  type StageBuckets,
  type StageMove,
} from "@/lib/bom-stage-ledger";
import { lineRequiredQty } from "@/lib/bom-stage-journey";

/**
 * BOM V5 WP6 — sổ bước (append-only). Mọi ghi chạy trong transaction, khoá dòng
 * bằng SELECT ... FOR UPDATE nên canMove + insert là nguyên tử (2 người cùng
 * bấm → người sau thấy bucket đã trừ). SL cần = lineRequiredQty (cùng công
 * thức cột "SL" của lưới).
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StageErrorCode =
  | "BAD_QTY"
  | "BAD_STAGE"
  | "SAME_STAGE"
  | "BACKWARD"
  | "EXCEEDS_BUCKET"
  | "NOT_FOUND"
  | "ALREADY_REVERSED"
  | "CANNOT_REVERSE";

export interface LineStages {
  category: BomCategory;
  required: number;
  buckets: StageBuckets;
}

/** 1 query gom cả template (không N+1): {lineId: {category, required, buckets}}. */
export async function getBucketsForTemplate(
  templateId: string,
): Promise<Record<string, LineStages>> {
  const rows = (await db.execute(sql`
    SELECT l.id AS "lineId", l.category AS "category",
           l.qty_per_parent AS "qtyPerParent", l.metadata AS "metadata",
           t.target_qty AS "targetQty",
           m.from_stage AS "fromStage", m.to_stage AS "toStage",
           COALESCE(SUM(m.qty), 0) AS "qty"
    FROM app.bom_line l
    JOIN app.bom_template t ON t.id = l.template_id
    LEFT JOIN app.bom_stage_move m ON m.line_id = l.id
    WHERE l.template_id = ${templateId}
    GROUP BY l.id, t.id, m.from_stage, m.to_stage
  `)) as unknown as Array<{
    lineId: string;
    category: string | null;
    qtyPerParent: string;
    metadata: unknown;
    targetQty: string;
    fromStage: string | null;
    toStage: string | null;
    qty: string;
  }>;

  const byLine = new Map<
    string,
    { category: BomCategory; required: number; moves: StageMove[] }
  >();
  for (const r of rows) {
    let e = byLine.get(r.lineId);
    if (!e) {
      e = {
        category: parseBomCategory(r.category),
        required: lineRequiredQty(r.metadata, r.qtyPerParent, r.targetQty),
        moves: [],
      };
      byLine.set(r.lineId, e);
    }
    if (r.fromStage && r.toStage) {
      e.moves.push({ from: r.fromStage, to: r.toStage, qty: Number(r.qty) });
    }
  }
  const out: Record<string, LineStages> = {};
  for (const [lineId, e] of byLine) {
    out[lineId] = {
      category: e.category,
      required: e.required,
      buckets: buildStageBuckets(e.category, e.required, e.moves),
    };
  }
  return out;
}

export interface MoveInput {
  lineId: string;
  from: string;
  to: string;
  qty: number;
  note?: string | null;
}

export type MoveRow = typeof bomStageMove.$inferSelect;

export type MoveResult =
  | { ok: true; move: MoveRow | null; duplicate: boolean; buckets: StageBuckets }
  | { ok: false; code: StageErrorCode };

async function loadLineState(tx: Tx, templateId: string, lineId: string) {
  const [line] = await tx
    .select()
    .from(bomLine)
    .where(and(eq(bomLine.id, lineId), eq(bomLine.templateId, templateId)))
    .for("update");
  if (!line) return null;
  const [tpl] = await tx
    .select({ targetQty: bomTemplate.targetQty })
    .from(bomTemplate)
    .where(eq(bomTemplate.id, templateId))
    .limit(1);
  const rows = await tx
    .select({
      from: bomStageMove.fromStage,
      to: bomStageMove.toStage,
      qty: bomStageMove.qty,
    })
    .from(bomStageMove)
    .where(eq(bomStageMove.lineId, lineId));
  const category = parseBomCategory(line.category);
  const required = lineRequiredQty(line.metadata, line.qtyPerParent, tpl?.targetQty ?? 0);
  const moves: StageMove[] = rows
    .filter((r) => r.from && r.to)
    .map((r) => ({ from: r.from!, to: r.to, qty: Number(r.qty) }));
  return { category, required, buckets: buildStageBuckets(category, required, moves) };
}

interface ApplyInput extends MoveInput {
  templateId: string;
  docType: string;
  docId?: string | null;
  actorId: string | null;
  reversesId?: number | null;
  isReversal?: boolean;
}

/** Lõi: dòng phải đang được khoá bởi caller? Không — hàm này tự khoá. */
async function applyMove(tx: Tx, input: ApplyInput): Promise<MoveResult> {
  const st = await loadLineState(tx, input.templateId, input.lineId);
  if (!st) return { ok: false, code: "NOT_FOUND" };
  const chk = canMove(st.category, st.buckets, input.from, input.to, input.qty, {
    isReversal: input.isReversal === true,
  });
  if (!chk.ok) return { ok: false, code: chk.reason };

  const values = {
    lineId: input.lineId,
    fromStage: input.from,
    toStage: input.to,
    qty: String(input.qty),
    docType: input.docType,
    docId: input.docId ?? null,
    note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
    actorId: input.actorId,
    reversesId: input.reversesId ?? null,
  };
  const idempotent = input.docType !== "MANUAL" && input.docId != null;
  const ins = tx.insert(bomStageMove).values(values);
  const inserted = idempotent
    ? await ins.onConflictDoNothing().returning()
    : await ins.returning();
  const move = inserted[0] ?? null;
  // Tính lại bucket sau move đơn giản bằng cách cộng trực tiếp (tránh query lại).
  const buckets: StageBuckets = { ...st.buckets };
  if (move) {
    buckets[input.from] = Math.round(((buckets[input.from] ?? 0) - input.qty) * 1e4) / 1e4;
    buckets[input.to] = Math.round(((buckets[input.to] ?? 0) + input.qty) * 1e4) / 1e4;
  }
  return { ok: true, move, duplicate: !move, buckets };
}

export async function moveStage(
  input: MoveInput & {
    templateId: string;
    docType?: string;
    docId?: string | null;
    actorId: string | null;
  },
): Promise<MoveResult> {
  return db.transaction((tx) =>
    applyMove(tx, { ...input, docType: input.docType ?? "MANUAL" }),
  );
}

export async function reverseMove(
  moveId: number,
  templateId: string,
  actorId: string | null,
  note?: string | null,
): Promise<MoveResult> {
  return db.transaction(async (tx): Promise<MoveResult> => {
    const [orig] = await tx
      .select()
      .from(bomStageMove)
      .where(eq(bomStageMove.id, moveId))
      .limit(1);
    if (!orig) return { ok: false, code: "NOT_FOUND" };
    // Khoá dòng TRƯỚC khi kiểm "đã đảo" để 2 yêu cầu đảo đồng thời tuần tự hoá.
    const locked = await loadLineState(tx, templateId, orig.lineId);
    if (!locked) return { ok: false, code: "NOT_FOUND" };
    if (orig.reversesId != null || !orig.fromStage)
      return { ok: false, code: "CANNOT_REVERSE" };
    const [dup] = await tx
      .select({ id: bomStageMove.id })
      .from(bomStageMove)
      .where(eq(bomStageMove.reversesId, moveId))
      .limit(1);
    if (dup) return { ok: false, code: "ALREADY_REVERSED" };
    return applyMove(tx, {
      templateId,
      lineId: orig.lineId,
      from: orig.toStage,
      to: orig.fromStage,
      qty: Number(orig.qty),
      note: note ?? `Đảo bút toán #${moveId}`,
      docType: "MANUAL",
      actorId,
      reversesId: moveId,
      isReversal: true,
    });
  });
}

export type BulkResult =
  | { ok: true; moves: MoveRow[] }
  | { ok: false; index: number; lineId: string; code: StageErrorCode };

class BulkAbort extends Error {
  constructor(public readonly result: Extract<BulkResult, { ok: false }>) {
    super("BULK_ABORT");
  }
}

/** All-or-nothing; khoá dòng theo id tăng dần để tránh deadlock giữa 2 bulk. */
export async function moveStagesBulk(
  templateId: string,
  items: MoveInput[],
  actorId: string | null,
): Promise<BulkResult> {
  const order = items
    .map((it, index) => ({ it, index }))
    .sort((a, b) => (a.it.lineId < b.it.lineId ? -1 : a.it.lineId > b.it.lineId ? 1 : a.index - b.index));
  try {
    return await db.transaction(async (tx): Promise<BulkResult> => {
      const moves: MoveRow[] = [];
      for (const { it, index } of order) {
        const r = await applyMove(tx, {
          ...it,
          templateId,
          docType: "MANUAL",
          actorId,
        });
        if (!r.ok) throw new BulkAbort({ ok: false, index, lineId: it.lineId, code: r.code });
        if (r.move) moves.push(r.move);
      }
      return { ok: true, moves };
    });
  } catch (err) {
    if (err instanceof BulkAbort) return err.result;
    throw err;
  }
}

export interface LineMoveHistoryRow {
  id: number;
  fromStage: string | null;
  toStage: string;
  qty: string;
  docType: string;
  docId: string | null;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  at: string | Date;
  reversesId: number | null;
  /** id bút toán đảo (nếu move này đã bị đảo). */
  reversedById: number | null;
}

export async function listLineMoves(lineId: string): Promise<LineMoveHistoryRow[]> {
  const rows = (await db.execute(sql`
    SELECT m.id, m.from_stage AS "fromStage", m.to_stage AS "toStage", m.qty,
           m.doc_type AS "docType", m.doc_id AS "docId", m.note,
           m.actor_id AS "actorId", u.full_name AS "actorName", m.at,
           m.reverses_id AS "reversesId",
           (SELECT r.id FROM app.bom_stage_move r WHERE r.reverses_id = m.id LIMIT 1) AS "reversedById"
    FROM app.bom_stage_move m
    LEFT JOIN app.user_account u ON u.id = m.actor_id
    WHERE m.line_id = ${lineId}
    ORDER BY m.at DESC, m.id DESC
  `)) as unknown as LineMoveHistoryRow[];
  return rows;
}

/** Số bước hợp lệ của category (tiện cho route trả nhãn). */
export function stageCodesOf(category: BomCategory): readonly string[] {
  return stagesFor(category);
}
