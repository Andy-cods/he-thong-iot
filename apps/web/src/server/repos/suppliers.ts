import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { supplier } from "@iot/db/schema";
import type { SupplierCreate, SupplierUpdate } from "@iot/shared";
import { db } from "@/lib/db";

export async function listSuppliers(opts: {
  q?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}) {
  const where: SQL[] = [];
  if (opts.isActive !== undefined) where.push(eq(supplier.isActive, opts.isActive));
  if (opts.q && opts.q.trim()) {
    const needle = `%${opts.q.trim()}%`;
    const orExpr = or(
      ilike(supplier.code, needle),
      ilike(supplier.name, needle),
    );
    if (orExpr) where.push(orExpr);
  }
  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (opts.page - 1) * opts.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(supplier)
      .where(whereExpr ?? sql`true`),
    db
      .select()
      .from(supplier)
      .where(whereExpr ?? sql`true`)
      .orderBy(asc(supplier.code))
      .limit(opts.pageSize)
      .offset(offset),
  ]);
  return { rows, total: totalResult[0]?.count ?? 0 };
}

export async function getSupplierById(id: string) {
  const [row] = await db
    .select()
    .from(supplier)
    .where(eq(supplier.id, id))
    .limit(1);
  return row ?? null;
}

export async function getSupplierByCode(code: string) {
  const [row] = await db
    .select()
    .from(supplier)
    .where(eq(supplier.code, code.toUpperCase()))
    .limit(1);
  return row ?? null;
}

export async function createSupplier(input: SupplierCreate) {
  const [row] = await db
    .insert(supplier)
    .values({
      code: input.code,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxCode: input.taxCode ?? null,
    })
    .returning();
  return row;
}

export async function updateSupplier(id: string, input: SupplierUpdate) {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.contactName !== undefined) patch.contactName = input.contactName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.address !== undefined) patch.address = input.address;
  if (input.taxCode !== undefined) patch.taxCode = input.taxCode;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  const [row] = await db
    .update(supplier)
    .set(patch)
    .where(eq(supplier.id, id))
    .returning();
  return row ?? null;
}

export async function softDeleteSupplier(id: string) {
  const [row] = await db
    .update(supplier)
    .set({ isActive: false })
    .where(eq(supplier.id, id))
    .returning();
  return row ?? null;
}
