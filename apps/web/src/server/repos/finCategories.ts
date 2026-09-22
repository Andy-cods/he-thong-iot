import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { finCategory } from "@iot/db/schema";
import type { FinCategoryCreate, FinCategoryUpdate } from "@iot/shared";
import { db } from "@/lib/db";

/**
 * Repo `fin_category` — Danh mục thu/chi phẳng (KHÔNG phải chart of accounts
 * double-entry), có `parentId` self-ref để nhóm danh mục con.
 */

export async function listFinCategories(opts: {
  direction?: "IN" | "OUT";
  isActive?: boolean;
  parentId?: string | null;
}) {
  const where: SQL[] = [];
  if (opts.direction) where.push(eq(finCategory.direction, opts.direction));
  if (opts.isActive !== undefined) where.push(eq(finCategory.isActive, opts.isActive));
  if (opts.parentId !== undefined) {
    where.push(
      opts.parentId === null
        ? sql`${finCategory.parentId} IS NULL`
        : eq(finCategory.parentId, opts.parentId),
    );
  }
  const whereExpr = where.length > 0 ? and(...where) : undefined;

  const rows = await db
    .select()
    .from(finCategory)
    .where(whereExpr ?? sql`true`)
    .orderBy(asc(finCategory.code));
  return rows;
}

export async function getFinCategoryById(id: string) {
  const [row] = await db.select().from(finCategory).where(eq(finCategory.id, id)).limit(1);
  return row ?? null;
}

export async function getFinCategoryByCode(code: string) {
  const [row] = await db
    .select()
    .from(finCategory)
    .where(eq(finCategory.code, code.toUpperCase()))
    .limit(1);
  return row ?? null;
}

export async function createFinCategory(input: FinCategoryCreate) {
  const [row] = await db
    .insert(finCategory)
    .values({
      code: input.code,
      name: input.name,
      direction: input.direction,
      parentId: input.parentId ?? null,
    })
    .returning();
  return row;
}

export async function updateFinCategory(id: string, input: FinCategoryUpdate) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.parentId !== undefined) patch.parentId = input.parentId;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [row] = await db
    .update(finCategory)
    .set(patch)
    .where(eq(finCategory.id, id))
    .returning();
  return row ?? null;
}
