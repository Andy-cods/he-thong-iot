import { and, asc, eq, max, sql, type SQL } from "drizzle-orm";
import {
  bomSheet,
  bomLine,
  bomSheetMaterialRow,
  bomSheetProcessRow,
} from "@iot/db/schema";
import type { BomSheetCreate, BomSheetKind, BomSheetUpdate } from "@iot/shared";
import { db } from "@/lib/db";

/**
 * V2.0 Sprint 6 — repos cho bom_sheet CRUD.
 * Mọi function scoped per templateId để cách ly dữ liệu giữa BOM List.
 */

export interface BomSheetWithStats {
  id: string;
  templateId: string;
  name: string;
  kind: BomSheetKind;
  position: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  /** Số bom_line trỏ tới sheet này (chỉ relevant với kind=PROJECT). */
  lineCount: number;
}

export async function listSheetsByTemplate(
  templateId: string,
): Promise<BomSheetWithStats[]> {
  const rows = await db
    .select({
      id: bomSheet.id,
      templateId: bomSheet.templateId,
      name: bomSheet.name,
      kind: bomSheet.kind,
      position: bomSheet.position,
      metadata: bomSheet.metadata,
      createdAt: bomSheet.createdAt,
      updatedAt: bomSheet.updatedAt,
      lineCount: sql<number>`(
        SELECT COUNT(*)::int FROM app.bom_line WHERE bom_line.sheet_id = ${bomSheet.id}
      )`,
    })
    .from(bomSheet)
    .where(eq(bomSheet.templateId, templateId))
    .orderBy(asc(bomSheet.position), asc(bomSheet.createdAt));

  return rows.map((r) => ({
    ...r,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  }));
}

export async function getSheetById(id: string) {
  const [row] = await db
    .select()
    .from(bomSheet)
    .where(eq(bomSheet.id, id))
    .limit(1);
  return row ?? null;
}

export async function getSheetByName(templateId: string, name: string) {
  const [row] = await db
    .select()
    .from(bomSheet)
    .where(
      and(eq(bomSheet.templateId, templateId), eq(bomSheet.name, name.trim())),
    )
    .limit(1);
  return row ?? null;
}

export async function getNextPosition(templateId: string): Promise<number> {
  const [r] = await db
    .select({ maxPos: max(bomSheet.position) })
    .from(bomSheet)
    .where(eq(bomSheet.templateId, templateId));
  const cur = r?.maxPos ?? 0;
  return cur + 1;
}

export async function createSheet(input: {
  templateId: string;
  data: BomSheetCreate;
  createdBy?: string | null;
}) {
  const position = input.data.position ?? (await getNextPosition(input.templateId));
  const [row] = await db
    .insert(bomSheet)
    .values({
      templateId: input.templateId,
      name: input.data.name.trim(),
      kind: input.data.kind ?? "PROJECT",
      position,
      metadata: (input.data.metadata ?? {}) as Record<string, unknown>,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row!;
}

export async function updateSheet(id: string, input: BomSheetUpdate) {
  const patch: Record<string, unknown> = { updatedAt: sql`now()` };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.position !== undefined) patch.position = input.position;
  if (input.metadata !== undefined) patch.metadata = input.metadata;

  const [row] = await db
    .update(bomSheet)
    .set(patch)
    .where(eq(bomSheet.id, id))
    .returning();
  return row ?? null;
}

/**
 * Đếm sheet kind=PROJECT trong template — dùng để chặn xóa sheet PROJECT
 * cuối cùng (BOM List phải có ≥1 sheet PROJECT, theo brainstorm Q-E).
 */
export async function countProjectSheets(templateId: string): Promise<number> {
  const [r] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(bomSheet)
    .where(
      and(
        eq(bomSheet.templateId, templateId),
        eq(bomSheet.kind, "PROJECT"),
      ),
    );
  return r?.c ?? 0;
}

export async function deleteSheet(id: string) {
  // ON DELETE CASCADE sẽ xoá bom_lines của sheet này.
  const [row] = await db
    .delete(bomSheet)
    .where(eq(bomSheet.id, id))
    .returning();
  return row ?? null;
}

/**
 * Tổng số sheet (mọi kind) của template — chặn xoá sheet cuối cùng
 * (TASK-20260427-021).
 */
export async function countSheets(templateId: string): Promise<number> {
  const [r] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(bomSheet)
    .where(eq(bomSheet.templateId, templateId));
  return r?.c ?? 0;
}

/**
 * Đếm số dòng dữ liệu thuộc 1 sheet (gộp bom_line + material_row + process_row)
 * — UI cảnh báo khi user xoá sheet còn data, hoặc fail-soft trả 409 nếu
 * chưa truyền `force=true`.
 */
export async function countRowsInSheet(sheetId: string): Promise<{
  lineCount: number;
  materialCount: number;
  processCount: number;
  total: number;
}> {
  const [lineR] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(bomLine)
    .where(eq(bomLine.sheetId, sheetId));
  const [matR] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(bomSheetMaterialRow)
    .where(eq(bomSheetMaterialRow.sheetId, sheetId));
  const [procR] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(bomSheetProcessRow)
    .where(eq(bomSheetProcessRow.sheetId, sheetId));
  const lineCount = lineR?.c ?? 0;
  const materialCount = matR?.c ?? 0;
  const processCount = procR?.c ?? 0;
  return {
    lineCount,
    materialCount,
    processCount,
    total: lineCount + materialCount + processCount,
  };
}

/**
 * Reorder: đổi position 2 sheet (swap atomic).
 */
export async function swapPositions(sheetIdA: string, sheetIdB: string) {
  await db.transaction(async (tx) => {
    const [a] = await tx
      .select({ position: bomSheet.position })
      .from(bomSheet)
      .where(eq(bomSheet.id, sheetIdA))
      .limit(1);
    const [b] = await tx
      .select({ position: bomSheet.position })
      .from(bomSheet)
      .where(eq(bomSheet.id, sheetIdB))
      .limit(1);
    if (!a || !b) return;

    // Tránh unique constraint (template_id, position) nếu có — dùng tạm -1.
    await tx
      .update(bomSheet)
      .set({ position: -1, updatedAt: sql`now()` })
      .where(eq(bomSheet.id, sheetIdA));
    await tx
      .update(bomSheet)
      .set({ position: a.position, updatedAt: sql`now()` })
      .where(eq(bomSheet.id, sheetIdB));
    await tx
      .update(bomSheet)
      .set({ position: b.position, updatedAt: sql`now()` })
      .where(eq(bomSheet.id, sheetIdA));
  });
}
