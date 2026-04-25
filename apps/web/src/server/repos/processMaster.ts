import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { processMaster } from "@iot/db/schema";
import type { ProcessMasterCreate, ProcessMasterUpdate } from "@iot/shared";
import { db } from "@/lib/db";

/**
 * Repos cho master quy trình — V2.0 Sprint 5 admin CRUD.
 * Migration: 0017_material_process_master.sql.
 */

export interface ListProcessesOpts {
  q?: string;
  pricingUnit?: "HOUR" | "CM2" | "OTHER";
  isActive?: boolean;
  sort?: "code" | "nameVn" | "pricePerUnit" | "createdAt";
  order?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export async function listProcesses(opts: ListProcessesOpts) {
  const where: SQL[] = [];
  if (opts.isActive !== undefined) {
    where.push(eq(processMaster.isActive, opts.isActive));
  }
  if (opts.pricingUnit) {
    where.push(eq(processMaster.pricingUnit, opts.pricingUnit));
  }
  if (opts.q && opts.q.trim()) {
    const needle = `%${opts.q.trim()}%`;
    const orExpr = or(
      ilike(processMaster.code, needle),
      ilike(processMaster.nameEn, needle),
      ilike(processMaster.nameVn, needle),
    );
    if (orExpr) where.push(orExpr);
  }
  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (opts.page - 1) * opts.pageSize;

  const sortColumn =
    opts.sort === "nameVn"
      ? processMaster.nameVn
      : opts.sort === "pricePerUnit"
        ? processMaster.pricePerUnit
        : opts.sort === "createdAt"
          ? processMaster.createdAt
          : processMaster.code;
  const orderFn = opts.order === "desc" ? desc : asc;

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(processMaster)
      .where(whereExpr)
      .orderBy(orderFn(sortColumn))
      .limit(opts.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(processMaster)
      .where(whereExpr),
  ]);

  return {
    rows,
    total: totalRow[0]?.count ?? 0,
    page: opts.page,
    pageSize: opts.pageSize,
  };
}

export async function getProcessById(id: string) {
  const [row] = await db
    .select()
    .from(processMaster)
    .where(eq(processMaster.id, id))
    .limit(1);
  return row ?? null;
}

export async function getProcessByCode(code: string) {
  const [row] = await db
    .select()
    .from(processMaster)
    .where(eq(processMaster.code, code))
    .limit(1);
  return row ?? null;
}

export async function createProcess(
  input: ProcessMasterCreate,
  createdBy?: string,
) {
  const [row] = await db
    .insert(processMaster)
    .values({
      code: input.code,
      nameEn: input.nameEn,
      nameVn: input.nameVn,
      pricePerUnit:
        input.pricePerUnit !== null ? String(input.pricePerUnit) : null,
      pricingUnit: input.pricingUnit ?? "HOUR",
      pricingNote: input.pricingNote,
      isActive: input.isActive ?? true,
      createdBy: createdBy ?? null,
    })
    .returning();
  return row!;
}

export async function updateProcess(id: string, input: ProcessMasterUpdate) {
  const patch: Record<string, unknown> = { updatedAt: sql`now()` };
  if (input.nameEn !== undefined) patch.nameEn = input.nameEn;
  if (input.nameVn !== undefined) patch.nameVn = input.nameVn;
  if (input.pricePerUnit !== undefined) {
    patch.pricePerUnit =
      input.pricePerUnit !== null ? String(input.pricePerUnit) : null;
  }
  if (input.pricingUnit !== undefined) patch.pricingUnit = input.pricingUnit;
  if (input.pricingNote !== undefined) patch.pricingNote = input.pricingNote;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [row] = await db
    .update(processMaster)
    .set(patch)
    .where(eq(processMaster.id, id))
    .returning();
  return row ?? null;
}

export async function deactivateProcess(id: string) {
  const [row] = await db
    .update(processMaster)
    .set({ isActive: false, updatedAt: sql`now()` })
    .where(eq(processMaster.id, id))
    .returning();
  return row ?? null;
}
