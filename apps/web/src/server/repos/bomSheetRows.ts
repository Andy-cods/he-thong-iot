import { and, asc, eq, max, sql } from "drizzle-orm";
import {
  bomSheetMaterialRow,
  bomSheetProcessRow,
  type MaterialRowStatus,
} from "@iot/db/schema";
import type {
  MaterialRowCreate,
  MaterialRowUpdate,
  ProcessRowCreate,
  ProcessRowUpdate,
} from "@iot/shared";
import { db } from "@/lib/db";

/**
 * V2.0 Sprint 6 FIX — repos cho material rows + process rows per-BOM.
 * Mọi function scoped per sheetId.
 */

// ---------------------------------------------------------------------------
// Material rows
// ---------------------------------------------------------------------------

export async function listMaterialRows(sheetId: string) {
  return await db
    .select()
    .from(bomSheetMaterialRow)
    .where(eq(bomSheetMaterialRow.sheetId, sheetId))
    .orderBy(asc(bomSheetMaterialRow.position), asc(bomSheetMaterialRow.createdAt));
}

export async function getMaterialRowById(id: string) {
  const [row] = await db
    .select()
    .from(bomSheetMaterialRow)
    .where(eq(bomSheetMaterialRow.id, id))
    .limit(1);
  return row ?? null;
}

export async function getNextMaterialRowPosition(sheetId: string): Promise<number> {
  const [r] = await db
    .select({ maxPos: max(bomSheetMaterialRow.position) })
    .from(bomSheetMaterialRow)
    .where(eq(bomSheetMaterialRow.sheetId, sheetId));
  return (r?.maxPos ?? 0) + 1;
}

export async function createMaterialRow(input: {
  sheetId: string;
  data: MaterialRowCreate;
  createdBy?: string | null;
}) {
  const position =
    input.data.position ?? (await getNextMaterialRowPosition(input.sheetId));
  const [row] = await db
    .insert(bomSheetMaterialRow)
    .values({
      sheetId: input.sheetId,
      materialCode: input.data.materialCode ?? null,
      nameOverride: input.data.nameOverride ?? null,
      componentLineId: input.data.componentLineId ?? null,
      pricePerKg:
        input.data.pricePerKg !== null && input.data.pricePerKg !== undefined
          ? String(input.data.pricePerKg)
          : null,
      qtyKg:
        input.data.qtyKg !== null && input.data.qtyKg !== undefined
          ? String(input.data.qtyKg)
          : null,
      blankSize: input.data.blankSize ?? {},
      supplierCode: input.data.supplierCode ?? null,
      status: (input.data.status ?? "PLANNED") as MaterialRowStatus,
      purchaseOrderCode: input.data.purchaseOrderCode ?? null,
      notes: input.data.notes ?? null,
      position,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row!;
}

export async function updateMaterialRow(id: string, input: MaterialRowUpdate) {
  const patch: Record<string, unknown> = { updatedAt: sql`now()` };
  if (input.materialCode !== undefined) patch.materialCode = input.materialCode;
  if (input.nameOverride !== undefined) patch.nameOverride = input.nameOverride;
  if (input.componentLineId !== undefined)
    patch.componentLineId = input.componentLineId;
  if (input.pricePerKg !== undefined) {
    patch.pricePerKg =
      input.pricePerKg !== null ? String(input.pricePerKg) : null;
  }
  if (input.qtyKg !== undefined) {
    patch.qtyKg = input.qtyKg !== null ? String(input.qtyKg) : null;
  }
  if (input.blankSize !== undefined) patch.blankSize = input.blankSize;
  if (input.supplierCode !== undefined) patch.supplierCode = input.supplierCode;
  if (input.status !== undefined) patch.status = input.status;
  if (input.purchaseOrderCode !== undefined)
    patch.purchaseOrderCode = input.purchaseOrderCode;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.position !== undefined) patch.position = input.position;

  const [row] = await db
    .update(bomSheetMaterialRow)
    .set(patch)
    .where(eq(bomSheetMaterialRow.id, id))
    .returning();
  return row ?? null;
}

export async function deleteMaterialRow(id: string) {
  const [row] = await db
    .delete(bomSheetMaterialRow)
    .where(eq(bomSheetMaterialRow.id, id))
    .returning();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Process rows
// ---------------------------------------------------------------------------

export async function listProcessRows(sheetId: string) {
  return await db
    .select()
    .from(bomSheetProcessRow)
    .where(eq(bomSheetProcessRow.sheetId, sheetId))
    .orderBy(asc(bomSheetProcessRow.position), asc(bomSheetProcessRow.createdAt));
}

export async function getProcessRowById(id: string) {
  const [row] = await db
    .select()
    .from(bomSheetProcessRow)
    .where(eq(bomSheetProcessRow.id, id))
    .limit(1);
  return row ?? null;
}

export async function getNextProcessRowPosition(sheetId: string): Promise<number> {
  const [r] = await db
    .select({ maxPos: max(bomSheetProcessRow.position) })
    .from(bomSheetProcessRow)
    .where(eq(bomSheetProcessRow.sheetId, sheetId));
  return (r?.maxPos ?? 0) + 1;
}

export async function createProcessRow(input: {
  sheetId: string;
  data: ProcessRowCreate;
  createdBy?: string | null;
}) {
  const position =
    input.data.position ?? (await getNextProcessRowPosition(input.sheetId));
  const [row] = await db
    .insert(bomSheetProcessRow)
    .values({
      sheetId: input.sheetId,
      processCode: input.data.processCode ?? null,
      nameOverride: input.data.nameOverride ?? null,
      componentLineId: input.data.componentLineId ?? null,
      hoursEstimated:
        input.data.hoursEstimated !== null &&
        input.data.hoursEstimated !== undefined
          ? String(input.data.hoursEstimated)
          : null,
      pricePerUnit:
        input.data.pricePerUnit !== null &&
        input.data.pricePerUnit !== undefined
          ? String(input.data.pricePerUnit)
          : null,
      pricingUnit: input.data.pricingUnit ?? "HOUR",
      stationCode: input.data.stationCode ?? null,
      notes: input.data.notes ?? null,
      position,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  return row!;
}

export async function updateProcessRow(id: string, input: ProcessRowUpdate) {
  const patch: Record<string, unknown> = { updatedAt: sql`now()` };
  if (input.processCode !== undefined) patch.processCode = input.processCode;
  if (input.nameOverride !== undefined) patch.nameOverride = input.nameOverride;
  if (input.componentLineId !== undefined)
    patch.componentLineId = input.componentLineId;
  if (input.hoursEstimated !== undefined) {
    patch.hoursEstimated =
      input.hoursEstimated !== null ? String(input.hoursEstimated) : null;
  }
  if (input.pricePerUnit !== undefined) {
    patch.pricePerUnit =
      input.pricePerUnit !== null ? String(input.pricePerUnit) : null;
  }
  if (input.pricingUnit !== undefined) patch.pricingUnit = input.pricingUnit;
  if (input.stationCode !== undefined) patch.stationCode = input.stationCode;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.position !== undefined) patch.position = input.position;

  const [row] = await db
    .update(bomSheetProcessRow)
    .set(patch)
    .where(eq(bomSheetProcessRow.id, id))
    .returning();
  return row ?? null;
}

export async function deleteProcessRow(id: string) {
  const [row] = await db
    .delete(bomSheetProcessRow)
    .where(eq(bomSheetProcessRow.id, id))
    .returning();
  return row ?? null;
}
