import { and, asc, eq, gte, inArray, isNull, lte, type SQL } from "drizzle-orm";
import {
  shiftOutputDefect,
  shiftOutputDowntime,
  shiftOutputEntry,
  siteDefectReason,
  siteDowntimeReason,
  siteMachine,
  siteOperator,
  sitePart,
  siteShift,
} from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * V4.10 (TASK-20261118-001) — dữ liệu thô cho Báo cáo / Hôm nay / Excel.
 * Khối lượng nhỏ (~10–20 dòng/ngày ≈ 7.000 dòng/năm) → lấy dòng trong khoảng
 * rồi gộp bằng `lib/shift-output/kpi.ts` (thuần, có test) thay vì SQL GROUP BY
 * cho từng kiểu báo cáo. % khả dụng: phút ca tính 1 lần / (ngày, ca, máy).
 */

export interface ReportEntryRow {
  id: string;
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
  customerName: string | null;
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
  status: string;
  version: number;
}

export interface ReportDetailRow {
  entryId: string;
  reasonId: string;
  reasonCode: string;
  reasonName: string;
  value: number;
  isPlanned?: boolean;
}

export interface ReportFilter {
  from: string;
  to: string;
  machineId?: string;
  partId?: string;
  shiftId?: string;
}

const e = shiftOutputEntry;

export async function loadReportData(
  siteId: string,
  f: ReportFilter,
): Promise<{ entries: ReportEntryRow[]; defects: ReportDetailRow[]; downtimes: ReportDetailRow[] }> {
  const where: SQL[] = [eq(e.siteId, siteId), gte(e.prodDate, f.from), lte(e.prodDate, f.to), isNull(e.deletedAt)];
  if (f.machineId) where.push(eq(e.machineId, f.machineId));
  if (f.partId) where.push(eq(e.partId, f.partId));
  if (f.shiftId) where.push(eq(e.shiftId, f.shiftId));

  const rows = await db
    .select({
      id: e.id,
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
      customerName: sitePart.customerName,
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
      version: e.version,
    })
    .from(e)
    .innerJoin(siteShift, eq(siteShift.id, e.shiftId))
    .innerJoin(siteMachine, eq(siteMachine.id, e.machineId))
    .innerJoin(sitePart, eq(sitePart.id, e.partId))
    .leftJoin(siteOperator, eq(siteOperator.id, e.operatorId))
    .where(and(...where))
    .orderBy(asc(e.prodDate), asc(siteShift.startTime), asc(siteMachine.sortOrder), asc(sitePart.code));

  const entries: ReportEntryRow[] = rows.map(({ operatorSnapshot, operatorFullName, ...r }) => ({
    ...r,
    operatorName: operatorFullName ?? operatorSnapshot ?? null,
  }));
  if (entries.length === 0) return { entries, defects: [], downtimes: [] };

  const ids = entries.map((r) => r.id);
  const [defects, downtimes] = await Promise.all([
    db
      .select({
        entryId: shiftOutputDefect.entryId,
        reasonId: shiftOutputDefect.reasonId,
        reasonCode: siteDefectReason.code,
        reasonName: siteDefectReason.name,
        value: shiftOutputDefect.qty,
      })
      .from(shiftOutputDefect)
      .innerJoin(siteDefectReason, eq(siteDefectReason.id, shiftOutputDefect.reasonId))
      .where(inArray(shiftOutputDefect.entryId, ids)),
    db
      .select({
        entryId: shiftOutputDowntime.entryId,
        reasonId: shiftOutputDowntime.reasonId,
        reasonCode: siteDowntimeReason.code,
        reasonName: siteDowntimeReason.name,
        value: shiftOutputDowntime.minutes,
        isPlanned: siteDowntimeReason.isPlanned,
      })
      .from(shiftOutputDowntime)
      .innerJoin(siteDowntimeReason, eq(siteDowntimeReason.id, shiftOutputDowntime.reasonId))
      .where(inArray(shiftOutputDowntime.entryId, ids)),
  ]);
  return { entries, defects, downtimes };
}
