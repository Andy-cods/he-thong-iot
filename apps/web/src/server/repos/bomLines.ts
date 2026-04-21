import { and, asc, eq, sql } from "drizzle-orm";
import { bomLine } from "@iot/db/schema";
import { db } from "@/lib/db";

export interface BomLineInsertInput {
  templateId: string;
  parentLineId: string | null;
  componentItemId: string;
  qtyPerParent: number;
  scrapPercent?: number;
  uom?: string | null;
  description?: string | null;
  supplierItemCode?: string | null;
  position?: number;
}

export const BOM_MAX_LEVEL = 5;

/** Lấy level của parent line. null → level 1. */
async function resolveLevel(parentLineId: string | null): Promise<number> {
  if (!parentLineId) return 1;
  const [p] = await db
    .select({ level: bomLine.level })
    .from(bomLine)
    .where(eq(bomLine.id, parentLineId))
    .limit(1);
  if (!p) throw new Error("PARENT_LINE_NOT_FOUND");
  return p.level + 1;
}

/**
 * Check cycle: walk up parent chain của `parentLineId`, nếu gặp
 * componentItemId trùng thì phát hiện cycle → reject.
 */
async function detectCycle(
  parentLineId: string | null,
  componentItemId: string,
): Promise<boolean> {
  if (!parentLineId) return false;
  const rows = await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT id, parent_line_id, component_item_id
      FROM app.bom_line WHERE id = ${parentLineId}
      UNION ALL
      SELECT l.id, l.parent_line_id, l.component_item_id
      FROM app.bom_line l
      INNER JOIN chain c ON l.id = c.parent_line_id
    )
    SELECT 1 AS found FROM chain WHERE component_item_id = ${componentItemId} LIMIT 1
  `);
  const list = rows as unknown as Array<{ found: number }>;
  return list.length > 0;
}

/** Lấy max(position) trong cùng parent → position mới = max+1. */
async function nextPosition(
  templateId: string,
  parentLineId: string | null,
): Promise<number> {
  const result = await db.execute(
    parentLineId
      ? sql`SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
            FROM app.bom_line
            WHERE template_id = ${templateId} AND parent_line_id = ${parentLineId}`
      : sql`SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
            FROM app.bom_line
            WHERE template_id = ${templateId} AND parent_line_id IS NULL`,
  );
  const list = result as unknown as Array<{ next_pos: number }>;
  return Number(list[0]?.next_pos ?? 1);
}

export async function addLine(input: BomLineInsertInput) {
  const level = await resolveLevel(input.parentLineId);
  if (level > BOM_MAX_LEVEL) {
    const err = new Error("MAX_DEPTH_EXCEEDED");
    (err as unknown as { code: string }).code = "MAX_DEPTH_EXCEEDED";
    throw err;
  }

  const hasCycle = await detectCycle(input.parentLineId, input.componentItemId);
  if (hasCycle) {
    const err = new Error("CYCLE_DETECTED");
    (err as unknown as { code: string }).code = "CYCLE_DETECTED";
    throw err;
  }

  const position =
    input.position ??
    (await nextPosition(input.templateId, input.parentLineId ?? null));

  const [row] = await db
    .insert(bomLine)
    .values({
      templateId: input.templateId,
      parentLineId: input.parentLineId,
      componentItemId: input.componentItemId,
      level,
      position,
      qtyPerParent: String(input.qtyPerParent),
      scrapPercent: String(input.scrapPercent ?? 0),
      uom: input.uom ?? null,
      description: input.description ?? null,
      supplierItemCode: input.supplierItemCode ?? null,
    })
    .returning();
  return row;
}

export interface BomLineUpdateInput {
  qtyPerParent?: number;
  scrapPercent?: number;
  uom?: string | null;
  description?: string | null;
  supplierItemCode?: string | null;
  /** V1.7-beta.2 — metadata tự do (vd: `{ size: "50x50x10" }`). */
  metadata?: Record<string, unknown> | null;
}

export async function updateLine(lineId: string, patch: BomLineUpdateInput) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.qtyPerParent !== undefined)
    values.qtyPerParent = String(patch.qtyPerParent);
  if (patch.scrapPercent !== undefined)
    values.scrapPercent = String(patch.scrapPercent);
  if (patch.uom !== undefined) values.uom = patch.uom;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.supplierItemCode !== undefined)
    values.supplierItemCode = patch.supplierItemCode;
  if (patch.metadata !== undefined) values.metadata = patch.metadata ?? {};

  const [row] = await db
    .update(bomLine)
    .set(values)
    .where(eq(bomLine.id, lineId))
    .returning();
  return row ?? null;
}

export async function getLineById(lineId: string) {
  const [row] = await db
    .select()
    .from(bomLine)
    .where(eq(bomLine.id, lineId))
    .limit(1);
  return row ?? null;
}

/** Đếm tất cả descendants của 1 line (recursive). */
export async function countDescendants(lineId: string): Promise<number> {
  const rows = await db.execute(sql`
    WITH RECURSIVE descendants AS (
      SELECT id FROM app.bom_line WHERE parent_line_id = ${lineId}
      UNION ALL
      SELECT l.id FROM app.bom_line l
      INNER JOIN descendants d ON l.parent_line_id = d.id
    )
    SELECT count(*)::int AS cnt FROM descendants
  `);
  const list = rows as unknown as Array<{ cnt: number }>;
  return Number(list[0]?.cnt ?? 0);
}

/**
 * Delete 1 line (và descendants nếu cascade). ON DELETE CASCADE đã cấu hình
 * ở FK bom_line.parent_line_id → tự cascade khi xoá parent.
 * Nếu cascade=false và có children → throw HAS_CHILDREN.
 * Trả về danh sách id descendants (để caller ghi audit).
 */
export async function deleteLine(
  lineId: string,
  opts: { cascade: boolean },
): Promise<{ deletedIds: string[]; descendantCount: number }> {
  const descendantCount = await countDescendants(lineId);

  if (descendantCount > 0 && !opts.cascade) {
    const err = new Error("HAS_CHILDREN");
    (err as unknown as { code: string; descendantCount: number }).code =
      "HAS_CHILDREN";
    (err as unknown as { code: string; descendantCount: number }).descendantCount =
      descendantCount;
    throw err;
  }

  // Lấy danh sách id descendants trước khi xoá (để audit)
  const rows = await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM app.bom_line WHERE id = ${lineId}
      UNION ALL
      SELECT l.id FROM app.bom_line l
      INNER JOIN tree t ON l.parent_line_id = t.id
    )
    SELECT id::text FROM tree
  `);
  const list = rows as unknown as Array<{ id: string }>;
  const deletedIds = list.map((r) => r.id);

  // Cascade auto xoá con nếu opts.cascade = true (FK ON DELETE CASCADE)
  // Nếu opts.cascade = false và descendantCount == 0 thì cũng chỉ xoá 1 row
  await db.delete(bomLine).where(eq(bomLine.id, lineId));

  return { deletedIds, descendantCount };
}

/**
 * Check parent mới có phải descendant của lineId không (cycle).
 */
async function isDescendantOf(
  ancestorId: string,
  candidateId: string,
): Promise<boolean> {
  if (ancestorId === candidateId) return true;
  const rows = await db.execute(sql`
    WITH RECURSIVE descendants AS (
      SELECT id FROM app.bom_line WHERE parent_line_id = ${ancestorId}
      UNION ALL
      SELECT l.id FROM app.bom_line l
      INNER JOIN descendants d ON l.parent_line_id = d.id
    )
    SELECT 1 AS found FROM descendants WHERE id = ${candidateId} LIMIT 1
  `);
  const list = rows as unknown as Array<{ found: number }>;
  return list.length > 0;
}

/** Recursively update level cho subtree bắt đầu tại lineId. */
async function shiftSubtreeLevel(
  lineId: string,
  newLevel: number,
  tx: typeof db,
): Promise<void> {
  await tx.execute(sql`
    WITH RECURSIVE subtree AS (
      SELECT id, ${newLevel}::int AS new_level FROM app.bom_line WHERE id = ${lineId}
      UNION ALL
      SELECT l.id, s.new_level + 1
      FROM app.bom_line l
      INNER JOIN subtree s ON l.parent_line_id = s.id
    )
    UPDATE app.bom_line AS bl
    SET level = s.new_level
    FROM subtree s
    WHERE bl.id = s.id
  `);
}

export interface BomLineMoveInput {
  lineId: string;
  newParentLineId: string | null;
  newPosition: number;
}

export async function moveLine(input: BomLineMoveInput) {
  return await db.transaction(async (tx) => {
    const [line] = await tx
      .select()
      .from(bomLine)
      .where(eq(bomLine.id, input.lineId))
      .limit(1);
    if (!line) {
      const err = new Error("LINE_NOT_FOUND");
      (err as unknown as { code: string }).code = "LINE_NOT_FOUND";
      throw err;
    }

    // Nếu newParentLineId là descendant của line → cycle
    if (input.newParentLineId) {
      const isDesc = await isDescendantOf(input.lineId, input.newParentLineId);
      if (isDesc) {
        const err = new Error("CANNOT_MOVE_INTO_DESCENDANT");
        (err as unknown as { code: string }).code = "CANNOT_MOVE_INTO_DESCENDANT";
        throw err;
      }
    }

    // Resolve level mới
    let newLevel: number;
    if (!input.newParentLineId) {
      newLevel = 1;
    } else {
      const [p] = await tx
        .select({ level: bomLine.level })
        .from(bomLine)
        .where(eq(bomLine.id, input.newParentLineId))
        .limit(1);
      if (!p) throw new Error("NEW_PARENT_NOT_FOUND");
      newLevel = p.level + 1;
    }

    // Check depth của toàn subtree: max(current_depth_in_subtree) + (newLevel - line.level) ≤ 5
    const depthRows = await tx.execute(sql`
      WITH RECURSIVE subtree AS (
        SELECT id, level FROM app.bom_line WHERE id = ${input.lineId}
        UNION ALL
        SELECT l.id, l.level
        FROM app.bom_line l
        INNER JOIN subtree s ON l.parent_line_id = s.id
      )
      SELECT COALESCE(MAX(level), ${line.level})::int AS max_level FROM subtree
    `);
    const depthList = depthRows as unknown as Array<{ max_level: number }>;
    const currentMaxLevel = Number(depthList[0]?.max_level ?? line.level);
    const shift = newLevel - line.level;
    if (currentMaxLevel + shift > BOM_MAX_LEVEL) {
      const err = new Error("MAX_DEPTH_EXCEEDED");
      (err as unknown as { code: string }).code = "MAX_DEPTH_EXCEEDED";
      throw err;
    }

    // Shift position siblings hiện tại
    if (line.parentLineId) {
      await tx.execute(sql`
        UPDATE app.bom_line
        SET position = position - 1
        WHERE template_id = ${line.templateId}
          AND parent_line_id = ${line.parentLineId}
          AND position > ${line.position}
      `);
    } else {
      await tx.execute(sql`
        UPDATE app.bom_line
        SET position = position - 1
        WHERE template_id = ${line.templateId}
          AND parent_line_id IS NULL
          AND position > ${line.position}
      `);
    }

    // Đẩy position các sibling ở parent mới để nhường chỗ
    if (input.newParentLineId) {
      await tx.execute(sql`
        UPDATE app.bom_line
        SET position = position + 1
        WHERE template_id = ${line.templateId}
          AND parent_line_id = ${input.newParentLineId}
          AND position >= ${input.newPosition}
      `);
    } else {
      await tx.execute(sql`
        UPDATE app.bom_line
        SET position = position + 1
        WHERE template_id = ${line.templateId}
          AND parent_line_id IS NULL
          AND position >= ${input.newPosition}
      `);
    }

    // Update bản thân line (parent + position + level)
    await tx
      .update(bomLine)
      .set({
        parentLineId: input.newParentLineId,
        position: input.newPosition,
        level: newLevel,
        updatedAt: new Date(),
      })
      .where(eq(bomLine.id, input.lineId));

    // Shift level toàn subtree (cập nhật toàn bộ descendants)
    if (shift !== 0) {
      await shiftSubtreeLevel(input.lineId, newLevel, tx as unknown as typeof db);
    }

    return { lineId: input.lineId, newLevel, shift };
  });
}

/** Lấy toàn bộ lines của 1 template (flat, ORDER BY level/position). */
export async function flattenTree(templateId: string) {
  return await db
    .select()
    .from(bomLine)
    .where(eq(bomLine.templateId, templateId))
    .orderBy(asc(bomLine.level), asc(bomLine.position));
}

/** Helper: check tất cả lines thuộc đúng template (route guard). */
export async function lineBelongsToTemplate(
  lineId: string,
  templateId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: bomLine.id })
    .from(bomLine)
    .where(and(eq(bomLine.id, lineId), eq(bomLine.templateId, templateId)))
    .limit(1);
  return !!row;
}
