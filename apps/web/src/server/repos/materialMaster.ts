import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { materialMaster, item } from "@iot/db/schema";
import type { MaterialMasterCreate, MaterialMasterUpdate } from "@iot/shared";
import { db } from "@/lib/db";

/**
 * Repos cho master vật liệu — V2.0 Sprint 5 admin CRUD.
 * Migration: 0017_material_process_master.sql.
 */

export interface ListMaterialsOpts {
  q?: string;
  category?: string;
  isActive?: boolean;
  sort?: "code" | "nameVn" | "category" | "pricePerKg" | "createdAt";
  order?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export async function listMaterials(opts: ListMaterialsOpts) {
  const where: SQL[] = [];
  if (opts.isActive !== undefined) {
    where.push(eq(materialMaster.isActive, opts.isActive));
  }
  if (opts.category && opts.category !== "all") {
    where.push(eq(materialMaster.category, opts.category));
  }
  if (opts.q && opts.q.trim()) {
    const needle = `%${opts.q.trim()}%`;
    const orExpr = or(
      ilike(materialMaster.code, needle),
      ilike(materialMaster.nameEn, needle),
      ilike(materialMaster.nameVn, needle),
    );
    if (orExpr) where.push(orExpr);
  }
  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (opts.page - 1) * opts.pageSize;

  const sortColumn =
    opts.sort === "nameVn"
      ? materialMaster.nameVn
      : opts.sort === "category"
        ? materialMaster.category
        : opts.sort === "pricePerKg"
          ? materialMaster.pricePerKg
          : opts.sort === "createdAt"
            ? materialMaster.createdAt
            : materialMaster.code;
  const orderFn = opts.order === "desc" ? desc : asc;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(materialMaster)
      .where(whereExpr)
      .orderBy(orderFn(sortColumn))
      .limit(opts.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(materialMaster)
      .where(whereExpr),
  ]);

  return {
    rows,
    total: totalRow[0]?.count ?? 0,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

export async function getMaterialById(id: string) {
  const [row] = await db
    .select()
    .from(materialMaster)
    .where(eq(materialMaster.id, id))
    .limit(1);
  return row ?? null;
}

export async function getMaterialByCode(code: string) {
  const [row] = await db
    .select()
    .from(materialMaster)
    .where(eq(materialMaster.code, code))
    .limit(1);
  return row ?? null;
}

export async function createMaterial(
  input: MaterialMasterCreate,
  createdBy?: string,
) {
  const [row] = await db
    .insert(materialMaster)
    .values({
      code: input.code,
      nameEn: input.nameEn,
      nameVn: input.nameVn,
      category: input.category,
      pricePerKg: input.pricePerKg !== null ? String(input.pricePerKg) : null,
      densityKgM3:
        input.densityKgM3 !== null ? String(input.densityKgM3) : null,
      isActive: input.isActive ?? true,
      notes: input.notes,
      createdBy: createdBy ?? null,
    })
    .returning();
  return row!;
}

export async function updateMaterial(
  id: string,
  input: MaterialMasterUpdate,
) {
  const patch: Record<string, unknown> = { updatedAt: sql`now()` };
  if (input.nameEn !== undefined) patch.nameEn = input.nameEn;
  if (input.nameVn !== undefined) patch.nameVn = input.nameVn;
  if (input.category !== undefined) patch.category = input.category;
  if (input.pricePerKg !== undefined) {
    patch.pricePerKg = input.pricePerKg !== null ? String(input.pricePerKg) : null;
  }
  if (input.densityKgM3 !== undefined) {
    patch.densityKgM3 =
      input.densityKgM3 !== null ? String(input.densityKgM3) : null;
  }
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.notes !== undefined) patch.notes = input.notes;

  const [row] = await db
    .update(materialMaster)
    .set(patch)
    .where(eq(materialMaster.id, id))
    .returning();
  return row ?? null;
}

/**
 * Soft-delete: chỉ set is_active=false. Không DELETE thật để bảo vệ FK
 * (item.material_code vẫn ref tới code).
 */
export async function deactivateMaterial(id: string) {
  const [row] = await db
    .update(materialMaster)
    .set({ isActive: false, updatedAt: sql`now()` })
    .where(eq(materialMaster.id, id))
    .returning();
  return row ?? null;
}

/**
 * Đếm số item đang ref material này — dùng UI cảnh báo trước khi deactivate.
 */
export async function countItemsUsingMaterial(code: string): Promise<number> {
  const [r] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(item)
    .where(eq(item.materialCode, code));
  return r?.count ?? 0;
}
