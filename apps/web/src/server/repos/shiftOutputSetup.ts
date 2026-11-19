import { and, asc, eq, inArray } from "drizzle-orm";
import {
  site,
  siteDefectReason,
  siteDowntimeReason,
  siteMachine,
  siteOperator,
  sitePart,
  siteShift,
  userSite,
} from "@iot/db/schema";
import { SHIFT_SETUP_KINDS, type ShiftSetupKind } from "@iot/shared";
import { db } from "@/lib/db";

/**
 * V4.10 (TASK-20261118-001) — danh mục Sản lượng ca theo site + thiết lập
 * xưởng + gán user ↔ site. Mọi hàm nhận `siteId` từ SCOPE phiên (không bao giờ
 * tin body/query trực tiếp — xem server/shiftOutputScope.ts).
 */

export class SetupDuplicateError extends Error {
  constructor(message = "Mã / tên đã tồn tại trong danh mục.") {
    super(message);
    this.name = "SetupDuplicateError";
  }
}

export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

export function pgConstraint(err: unknown): string | undefined {
  const e = err as { constraint_name?: string; cause?: { constraint_name?: string } } | null;
  return e?.constraint_name ?? e?.cause?.constraint_name;
}

/* ── Site ─────────────────────────────────────────────────────────────── */

export type SiteRow = typeof site.$inferSelect;

export interface SiteSettings {
  id: string;
  code: string;
  name: string;
  timezone: string;
  lockAfterHours: number;
  backdateDays: number;
  ngWarnPct: number;
  isActive: boolean;
}

export function toSiteSettings(r: SiteRow): SiteSettings {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    timezone: r.timezone,
    lockAfterHours: r.lockAfterHours,
    backdateDays: r.backdateDays,
    ngWarnPct: Number(r.ngWarnPct),
    isActive: r.isActive,
  };
}

export async function getUserSiteId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ siteId: userSite.siteId })
    .from(userSite)
    .where(eq(userSite.userId, userId))
    .limit(1);
  return row?.siteId ?? null;
}

export async function getSiteById(id: string): Promise<SiteSettings | null> {
  const [row] = await db.select().from(site).where(eq(site.id, id)).limit(1);
  return row ? toSiteSettings(row) : null;
}

/** Site mặc định khi user xem được mọi site mà không chỉ định (site active đầu theo mã). */
export async function getDefaultSite(): Promise<SiteSettings | null> {
  const [row] = await db.select().from(site).where(eq(site.isActive, true)).orderBy(asc(site.code)).limit(1);
  return row ? toSiteSettings(row) : null;
}

export async function listSites(siteIds?: readonly string[]): Promise<SiteSettings[]> {
  const rows = await db
    .select()
    .from(site)
    .where(siteIds ? inArray(site.id, siteIds as string[]) : undefined)
    .orderBy(asc(site.code));
  return rows.map(toSiteSettings);
}

export async function updateSite(
  id: string,
  patch: Partial<Pick<SiteSettings, "name" | "lockAfterHours" | "backdateDays" | "ngWarnPct" | "isActive">>,
  userId: string,
): Promise<SiteSettings | null> {
  const values: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    values[k] = k === "ngWarnPct" ? String(v) : v;
  }
  const [row] = await db.update(site).set(values).where(eq(site.id, id)).returning();
  return row ? toSiteSettings(row) : null;
}

/** Gán (upsert) hoặc gỡ (null) site của 1 user. Dùng trong transaction tạo/sửa user. */
export async function setUserSite(
  tx: Pick<typeof db, "insert" | "delete">,
  userId: string,
  siteId: string | null,
  actorId: string | null,
): Promise<void> {
  if (siteId === null) {
    await tx.delete(userSite).where(eq(userSite.userId, userId));
    return;
  }
  await tx
    .insert(userSite)
    .values({ userId, siteId, assignedBy: actorId })
    .onConflictDoUpdate({
      target: userSite.userId,
      set: { siteId, assignedBy: actorId, assignedAt: new Date() },
    });
}

/* ── Danh mục ─────────────────────────────────────────────────────────── */

const TABLES = {
  parts: sitePart,
  operators: siteOperator,
  machines: siteMachine,
  shifts: siteShift,
  "defect-reasons": siteDefectReason,
  "downtime-reasons": siteDowntimeReason,
} as const;

type SetupTable = (typeof TABLES)[ShiftSetupKind];

export const SETUP_LABELS: Record<ShiftSetupKind, string> = {
  parts: "Mã hàng",
  operators: "Người phụ trách",
  machines: "Máy",
  shifts: "Ca làm việc",
  "defect-reasons": "Lý do lỗi",
  "downtime-reasons": "Lý do dừng máy",
};

export type SetupRow = Record<string, unknown> & { id: string; siteId: string; isActive: boolean };

export function parseSetupKind(kind: string): ShiftSetupKind | null {
  return (SHIFT_SETUP_KINDS as readonly string[]).includes(kind) ? (kind as ShiftSetupKind) : null;
}

/** Lấy 1 mục bất kể site (route tự so phạm vi → 404 nếu ngoài phạm vi). */
export async function getSetupAnySite(kind: ShiftSetupKind, id: string): Promise<SetupRow | null> {
  const t = TABLES[kind] as SetupTable;
  const [row] = await db.select().from(t).where(eq(t.id, id)).limit(1);
  return (row as unknown as SetupRow) ?? null;
}

function orderFor(kind: ShiftSetupKind) {
  switch (kind) {
    case "parts":
      return [asc(sitePart.code)];
    case "operators":
      return [asc(siteOperator.sortOrder), asc(siteOperator.fullName)];
    case "machines":
      return [asc(siteMachine.sortOrder), asc(siteMachine.code)];
    case "shifts":
      return [asc(siteShift.sortOrder), asc(siteShift.startTime)];
    case "defect-reasons":
      return [asc(siteDefectReason.sortOrder), asc(siteDefectReason.code)];
    case "downtime-reasons":
      return [asc(siteDowntimeReason.sortOrder), asc(siteDowntimeReason.code)];
  }
}

export async function listSetup(kind: ShiftSetupKind, siteId: string, includeInactive = false): Promise<SetupRow[]> {
  const t = TABLES[kind] as SetupTable;
  const where = includeInactive
    ? eq(t.siteId, siteId)
    : and(eq(t.siteId, siteId), eq(t.isActive, true));
  const rows = await db.select().from(t).where(where).orderBy(...orderFor(kind));
  return rows as unknown as SetupRow[];
}

export async function getSetupById(kind: ShiftSetupKind, siteId: string, id: string): Promise<SetupRow | null> {
  const t = TABLES[kind] as SetupTable;
  const [row] = await db
    .select()
    .from(t)
    .where(and(eq(t.id, id), eq(t.siteId, siteId)))
    .limit(1);
  return (row as unknown as SetupRow) ?? null;
}

export async function createSetup(
  kind: ShiftSetupKind,
  siteId: string,
  data: Record<string, unknown>,
  userId: string,
): Promise<SetupRow> {
  const t = TABLES[kind] as SetupTable;
  try {
    const [row] = await db
      .insert(t)
      .values({ ...data, siteId, createdBy: userId, updatedBy: userId } as never)
      .returning();
    return row as unknown as SetupRow;
  } catch (err) {
    if (pgErrorCode(err) === "23505") throw new SetupDuplicateError();
    throw err;
  }
}

export async function updateSetup(
  kind: ShiftSetupKind,
  siteId: string,
  id: string,
  patch: Record<string, unknown>,
  userId: string,
): Promise<SetupRow | null> {
  const t = TABLES[kind] as SetupTable;
  const values: Record<string, unknown> = { updatedAt: new Date(), updatedBy: userId };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) values[k] = v;
  try {
    const [row] = await db
      .update(t)
      .set(values as never)
      .where(and(eq(t.id, id), eq(t.siteId, siteId)))
      .returning();
    return (row as unknown as SetupRow) ?? null;
  } catch (err) {
    if (pgErrorCode(err) === "23505") throw new SetupDuplicateError();
    throw err;
  }
}

/** Danh mục ACTIVE cho form Nhập ca. */
export async function loadActiveCatalog(siteId: string) {
  const [machines, shifts, parts, operators, defectReasons, downtimeReasons] = await Promise.all([
    listSetup("machines", siteId),
    listSetup("shifts", siteId),
    listSetup("parts", siteId),
    listSetup("operators", siteId),
    listSetup("defect-reasons", siteId),
    listSetup("downtime-reasons", siteId),
  ]);
  return { machines, shifts, parts, operators, defectReasons, downtimeReasons };
}

/** Kiểm các id danh mục của 1 dòng thuộc site + đang dùng (V9). Trả danh sách trường sai. */
export async function checkEntryRefs(
  siteId: string,
  refs: {
    shiftId: string;
    machineId: string;
    partId: string;
    operatorId?: string | null;
    defectReasonIds: string[];
    downtimeReasonIds: string[];
  },
  /** Tạo mới: chỉ danh mục đang dùng. Sửa dòng cũ: cho phép mục đã ngừng dùng (vẫn cùng site). */
  activeOnly = true,
): Promise<{ invalid: string[]; shift: SetupRow | null }> {
  const scoped = (t: SetupTable) => (activeOnly ? and(eq(t.siteId, siteId), eq(t.isActive, true)) : eq(t.siteId, siteId));
  const one = async (t: SetupTable, id: string) => {
    const [r] = await db
      .select()
      .from(t)
      .where(and(eq(t.id, id), scoped(t)))
      .limit(1);
    return (r as unknown as SetupRow) ?? null;
  };
  const many = async (t: SetupTable, ids: string[]) => {
    if (ids.length === 0) return 0;
    const rows = await db
      .select({ id: t.id })
      .from(t)
      .where(and(inArray(t.id, ids), scoped(t)));
    return rows.length;
  };
  const [shift, machine, part, operator, defectCount, downtimeCount] = await Promise.all([
    one(siteShift, refs.shiftId),
    one(siteMachine, refs.machineId),
    one(sitePart, refs.partId),
    refs.operatorId ? one(siteOperator, refs.operatorId) : Promise.resolve(null),
    many(siteDefectReason, refs.defectReasonIds),
    many(siteDowntimeReason, refs.downtimeReasonIds),
  ]);
  const invalid: string[] = [];
  if (!shift) invalid.push("shiftId");
  if (!machine) invalid.push("machineId");
  if (!part) invalid.push("partId");
  if (refs.operatorId && !operator) invalid.push("operatorId");
  if (defectCount !== refs.defectReasonIds.length) invalid.push("defects");
  if (downtimeCount !== refs.downtimeReasonIds.length) invalid.push("downtimes");
  return { invalid, shift };
}
