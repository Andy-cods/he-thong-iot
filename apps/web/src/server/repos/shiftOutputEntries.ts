import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import {
  auditEvent,
  shiftOutputDefect,
  shiftOutputDowntime,
  shiftOutputEntry,
  siteDefectReason,
  siteDowntimeReason,
  siteMachine,
  siteOperator,
  sitePart,
  siteShift,
  userAccount,
} from "@iot/db/schema";
import { SHIFT_LIST_MAX_ROWS } from "@iot/shared";
import { db } from "@/lib/db";
import { pgConstraint, pgErrorCode } from "./shiftOutputSetup";

/**
 * V4.10 (TASK-20261118-001) — dòng sản lượng ca.
 *
 * - Idempotent theo `client_uuid` (unique): gửi lại → `replayed` (route trả 200).
 * - Trùng slot (site, ngày, ca, máy, mã) còn hiệu lực → `duplicate` + existingId (409).
 * - Sửa / xoá mềm: SELECT … FOR UPDATE + so `version` → `stale` (409).
 * - Chi tiết lỗi / dừng ghi CÙNG transaction với dòng.
 */

export interface DefectView {
  reasonId: string;
  reasonCode: string;
  reasonName: string;
  qty: number;
}
export interface DowntimeView {
  reasonId: string;
  reasonCode: string;
  reasonName: string;
  minutes: number;
  note: string | null;
}

export interface EntryView {
  id: string;
  siteId: string;
  clientUuid: string;
  prodDate: string;
  shiftId: string;
  shiftCode: string;
  shiftName: string;
  shiftStart: string;
  shiftEnd: string;
  crossesMidnight: boolean;
  machineId: string;
  machineCode: string;
  machineName: string;
  partId: string;
  partCode: string;
  partName: string;
  operatorId: string | null;
  /** Tên hiển thị: danh mục (nếu có) hoặc snapshot "+ Tên khác". */
  operatorName: string | null;
  qtyPlanned: number | null;
  qtyOk: number;
  qtyNg: number;
  qtyRework: number | null;
  downtimeMin: number | null;
  shiftMinutes: number;
  materialLot: string | null;
  notes: string | null;
  status: string;
  lockedAt: Date | null;
  version: number;
  createdAt: Date;
  createdByName: string | null;
  updatedAt: Date;
  deletedAt: Date | null;
  deleteReason: string | null;
  defects: DefectView[];
  downtimes: DowntimeView[];
}

const e = shiftOutputEntry;

function baseSelect() {
  return db
    .select({
      id: e.id,
      siteId: e.siteId,
      clientUuid: e.clientUuid,
      prodDate: e.prodDate,
      shiftId: e.shiftId,
      shiftCode: siteShift.code,
      shiftName: siteShift.name,
      shiftStart: siteShift.startTime,
      shiftEnd: siteShift.endTime,
      crossesMidnight: siteShift.crossesMidnight,
      machineId: e.machineId,
      machineCode: siteMachine.code,
      machineName: siteMachine.name,
      partId: e.partId,
      partCode: sitePart.code,
      partName: sitePart.name,
      operatorId: e.operatorId,
      operatorSnapshot: e.operatorName,
      operatorFullName: siteOperator.fullName,
      qtyPlanned: e.qtyPlanned,
      qtyOk: e.qtyOk,
      qtyNg: e.qtyNg,
      qtyRework: e.qtyRework,
      downtimeMin: e.downtimeMin,
      shiftMinutes: e.shiftMinutes,
      materialLot: e.materialLot,
      notes: e.notes,
      status: e.status,
      lockedAt: e.lockedAt,
      version: e.version,
      createdAt: e.createdAt,
      createdByName: userAccount.fullName,
      updatedAt: e.updatedAt,
      deletedAt: e.deletedAt,
      deleteReason: e.deleteReason,
    })
    .from(e)
    .innerJoin(siteShift, eq(siteShift.id, e.shiftId))
    .innerJoin(siteMachine, eq(siteMachine.id, e.machineId))
    .innerJoin(sitePart, eq(sitePart.id, e.partId))
    .leftJoin(siteOperator, eq(siteOperator.id, e.operatorId))
    .leftJoin(userAccount, eq(userAccount.id, e.createdBy));
}

type BaseRow = Awaited<ReturnType<ReturnType<typeof baseSelect>["limit"]>>[number];

async function attachDetails(rows: BaseRow[]): Promise<EntryView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [defects, downtimes] = await Promise.all([
    db
      .select({
        entryId: shiftOutputDefect.entryId,
        reasonId: shiftOutputDefect.reasonId,
        reasonCode: siteDefectReason.code,
        reasonName: siteDefectReason.name,
        qty: shiftOutputDefect.qty,
      })
      .from(shiftOutputDefect)
      .innerJoin(siteDefectReason, eq(siteDefectReason.id, shiftOutputDefect.reasonId))
      .where(inArray(shiftOutputDefect.entryId, ids))
      .orderBy(desc(shiftOutputDefect.qty)),
    db
      .select({
        entryId: shiftOutputDowntime.entryId,
        reasonId: shiftOutputDowntime.reasonId,
        reasonCode: siteDowntimeReason.code,
        reasonName: siteDowntimeReason.name,
        minutes: shiftOutputDowntime.minutes,
        note: shiftOutputDowntime.note,
      })
      .from(shiftOutputDowntime)
      .innerJoin(siteDowntimeReason, eq(siteDowntimeReason.id, shiftOutputDowntime.reasonId))
      .where(inArray(shiftOutputDowntime.entryId, ids))
      .orderBy(desc(shiftOutputDowntime.minutes)),
  ]);
  return rows.map((r) => {
    const { operatorSnapshot, operatorFullName, ...rest } = r;
    return {
      ...rest,
      operatorName: operatorFullName ?? operatorSnapshot ?? null,
      defects: defects.filter((d) => d.entryId === r.id).map(({ entryId: _e, ...d }) => d),
      downtimes: downtimes.filter((d) => d.entryId === r.id).map(({ entryId: _e, ...d }) => d),
    };
  });
}

export interface EntryListFilter {
  from: string;
  to: string;
  shiftId?: string;
  machineId?: string;
  partId?: string;
  operatorId?: string;
  includeDeleted?: boolean;
  limit?: number;
}

export async function listEntries(siteId: string, f: EntryListFilter): Promise<{ rows: EntryView[]; truncated: boolean }> {
  const where: SQL[] = [eq(e.siteId, siteId), gte(e.prodDate, f.from), lte(e.prodDate, f.to)];
  if (f.shiftId) where.push(eq(e.shiftId, f.shiftId));
  if (f.machineId) where.push(eq(e.machineId, f.machineId));
  if (f.partId) where.push(eq(e.partId, f.partId));
  if (f.operatorId) where.push(eq(e.operatorId, f.operatorId));
  if (!f.includeDeleted) where.push(isNull(e.deletedAt));
  const limit = Math.min(f.limit ?? SHIFT_LIST_MAX_ROWS, SHIFT_LIST_MAX_ROWS);
  const rows = await baseSelect()
    .where(and(...where))
    .orderBy(desc(e.prodDate), asc(siteShift.startTime), asc(siteMachine.sortOrder), asc(sitePart.code))
    .limit(limit + 1);
  return { rows: await attachDetails(rows.slice(0, limit)), truncated: rows.length > limit };
}

export async function getEntry(id: string): Promise<EntryView | null> {
  const rows = await baseSelect().where(eq(e.id, id)).limit(1);
  const [view] = await attachDetails(rows);
  return view ?? null;
}

export async function findByClientUuid(clientUuid: string): Promise<{ id: string; siteId: string } | null> {
  const [row] = await db
    .select({ id: e.id, siteId: e.siteId })
    .from(e)
    .where(eq(e.clientUuid, clientUuid))
    .limit(1);
  return row ?? null;
}

export async function findActiveSlot(
  siteId: string,
  slot: { prodDate: string; shiftId: string; machineId: string; partId: string },
  excludeId?: string,
): Promise<string | null> {
  const where: SQL[] = [
    eq(e.siteId, siteId),
    eq(e.prodDate, slot.prodDate),
    eq(e.shiftId, slot.shiftId),
    eq(e.machineId, slot.machineId),
    eq(e.partId, slot.partId),
    isNull(e.deletedAt),
  ];
  if (excludeId) where.push(ne(e.id, excludeId));
  const [row] = await db.select({ id: e.id }).from(e).where(and(...where)).limit(1);
  return row?.id ?? null;
}

export interface EntryWrite {
  prodDate: string;
  shiftId: string;
  machineId: string;
  partId: string;
  operatorId: string | null;
  operatorName: string | null;
  qtyPlanned: number | null;
  qtyOk: number;
  qtyNg: number;
  qtyRework: number | null;
  downtimeMin: number | null;
  shiftMinutes: number;
  materialLot: string | null;
  notes: string | null;
  defects: Array<{ reasonId: string; qty: number }>;
  downtimes: Array<{ reasonId: string; minutes: number; note: string | null }>;
}

export type InsertResult =
  | { kind: "created"; id: string }
  | { kind: "replayed"; id: string; siteId: string }
  | { kind: "duplicate"; existingId: string | null };

export async function insertEntry(
  siteId: string,
  clientUuid: string,
  w: EntryWrite,
  userId: string,
): Promise<InsertResult> {
  try {
    const id = await db.transaction(async (tx) => {
      const { defects, downtimes, ...fields } = w;
      const [row] = await tx
        .insert(e)
        .values({ ...fields, siteId, clientUuid, status: "SUBMITTED", source: "APP", createdBy: userId, updatedBy: userId })
        .returning({ id: e.id });
      const entryId = row!.id;
      if (defects.length > 0) {
        await tx.insert(shiftOutputDefect).values(defects.map((d) => ({ entryId, reasonId: d.reasonId, qty: d.qty })));
      }
      if (downtimes.length > 0) {
        await tx
          .insert(shiftOutputDowntime)
          .values(downtimes.map((d) => ({ entryId, reasonId: d.reasonId, minutes: d.minutes, note: d.note })));
      }
      return entryId;
    });
    return { kind: "created", id };
  } catch (err) {
    if (pgErrorCode(err) !== "23505") throw err;
    const constraint = pgConstraint(err);
    if (constraint === "shift_output_entry_client_uuid_uk" || !constraint) {
      const prev = await findByClientUuid(clientUuid);
      if (prev) return { kind: "replayed", id: prev.id, siteId: prev.siteId };
    }
    return { kind: "duplicate", existingId: await findActiveSlot(siteId, w) };
  }
}

export type UpdateResult =
  | { kind: "updated" }
  | { kind: "not_found" }
  | { kind: "stale"; currentVersion: number }
  | { kind: "duplicate"; existingId: string | null };

/**
 * PATCH có khoá dòng: FOR UPDATE → so version → ghi + version+1. `w` là trạng
 * thái ĐẦY ĐỦ sau khi ghép (route ghép bản cũ + patch rồi kiểm policy).
 */
export async function updateEntry(
  id: string,
  expectedVersion: number,
  w: EntryWrite,
  replaceDetails: { defects: boolean; downtimes: boolean },
  userId: string,
): Promise<UpdateResult> {
  try {
    return await db.transaction(async (tx) => {
      const [cur] = await tx
        .select({ version: e.version, deletedAt: e.deletedAt })
        .from(e)
        .where(eq(e.id, id))
        .for("update");
      if (!cur || cur.deletedAt) return { kind: "not_found" as const };
      if (cur.version !== expectedVersion) return { kind: "stale" as const, currentVersion: cur.version };
      const { defects, downtimes, ...fields } = w;
      await tx
        .update(e)
        .set({ ...fields, version: sql`${e.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(and(eq(e.id, id), eq(e.version, expectedVersion)));
      if (replaceDetails.defects) {
        await tx.delete(shiftOutputDefect).where(eq(shiftOutputDefect.entryId, id));
        if (defects.length > 0) {
          await tx.insert(shiftOutputDefect).values(defects.map((d) => ({ entryId: id, reasonId: d.reasonId, qty: d.qty })));
        }
      }
      if (replaceDetails.downtimes) {
        await tx.delete(shiftOutputDowntime).where(eq(shiftOutputDowntime.entryId, id));
        if (downtimes.length > 0) {
          await tx
            .insert(shiftOutputDowntime)
            .values(downtimes.map((d) => ({ entryId: id, reasonId: d.reasonId, minutes: d.minutes, note: d.note })));
        }
      }
      return { kind: "updated" as const };
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") {
      return { kind: "duplicate", existingId: null };
    }
    throw err;
  }
}

export async function softDeleteEntry(
  id: string,
  expectedVersion: number | undefined,
  reason: string,
  userId: string,
): Promise<UpdateResult> {
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select({ version: e.version, deletedAt: e.deletedAt })
      .from(e)
      .where(eq(e.id, id))
      .for("update");
    if (!cur || cur.deletedAt) return { kind: "not_found" as const };
    if (expectedVersion !== undefined && cur.version !== expectedVersion) {
      return { kind: "stale" as const, currentVersion: cur.version };
    }
    await tx
      .update(e)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
        deleteReason: reason,
        version: sql`${e.version} + 1`,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(e.id, id));
    return { kind: "updated" as const };
  });
}

/** Chốt ca/ngày: chuyển LOCKED mọi dòng còn hiệu lực chưa khoá. Trả id đã khoá. */
export async function lockEntries(
  siteId: string,
  prodDate: string,
  shiftId: string | null,
  userId: string,
): Promise<string[]> {
  const where: SQL[] = [eq(e.siteId, siteId), eq(e.prodDate, prodDate), isNull(e.deletedAt), ne(e.status, "LOCKED")];
  if (shiftId) where.push(eq(e.shiftId, shiftId));
  const rows = await db
    .update(e)
    .set({ status: "LOCKED", lockedAt: new Date(), lockedBy: userId, updatedAt: new Date(), updatedBy: userId })
    .where(and(...where))
    .returning({ id: e.id });
  return rows.map((r) => r.id);
}

/** Gợi ý form: 5 mã gần nhất, mã ca trước theo máy, TB OK 30 ngày theo (máy, mã). */
export async function loadRecentContext(siteId: string, today: string) {
  const recent = await db
    .select({ partId: e.partId, last: sql<string>`max(${e.createdAt})`.as("last") })
    .from(e)
    .where(and(eq(e.siteId, siteId), isNull(e.deletedAt)))
    .groupBy(e.partId)
    .orderBy(desc(sql`max(${e.createdAt})`))
    .limit(5);

  const lastByMachine = await db
    .selectDistinctOn([e.machineId], { machineId: e.machineId, partId: e.partId })
    .from(e)
    .innerJoin(siteShift, eq(siteShift.id, e.shiftId))
    .where(and(eq(e.siteId, siteId), isNull(e.deletedAt)))
    .orderBy(e.machineId, desc(e.prodDate), desc(siteShift.startTime), desc(e.createdAt));

  const avg = await db
    .select({
      machineId: e.machineId,
      partId: e.partId,
      avgOk: sql<string>`avg(${e.qtyOk})`,
    })
    .from(e)
    .where(
      and(
        eq(e.siteId, siteId),
        isNull(e.deletedAt),
        gte(e.prodDate, sql`(${today}::date - 30)`),
        lte(e.prodDate, today),
      ),
    )
    .groupBy(e.machineId, e.partId);

  return {
    recentPartIds: recent.map((r) => r.partId),
    lastPartByMachine: Object.fromEntries(lastByMachine.map((r) => [r.machineId, r.partId])),
    avgOk30: Object.fromEntries(avg.map((r) => [`${r.machineId}:${r.partId}`, Math.round(Number(r.avgOk) * 10) / 10])),
  };
}

export async function listEntryHistory(id: string) {
  return db
    .select({
      id: auditEvent.id,
      action: auditEvent.action,
      actorUsername: auditEvent.actorUsername,
      actorName: userAccount.fullName,
      before: auditEvent.beforeJson,
      after: auditEvent.afterJson,
      notes: auditEvent.notes,
      occurredAt: auditEvent.occurredAt,
    })
    .from(auditEvent)
    .leftJoin(userAccount, eq(userAccount.id, auditEvent.actorUserId))
    .where(and(eq(auditEvent.objectType, "shift_output_entry"), eq(auditEvent.objectId, id)))
    .orderBy(asc(auditEvent.occurredAt));
}
