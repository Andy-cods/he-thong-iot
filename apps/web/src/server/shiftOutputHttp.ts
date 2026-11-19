import { NextResponse, type NextRequest } from "next/server";
import {
  SHIFT_REPORT_MAX_DAYS,
  shiftEntryCreateSchema,
  shiftReportQuerySchema,
  type ShiftEntryCreate,
} from "@iot/shared";
import { viErrorMap } from "@/lib/zod-vi";
import { isEntryLocked, validateEntry, type PolicyIssue } from "@/lib/shift-output/policy";
import { diffDays, shiftMinutes, todayInTz } from "@/lib/shift-output/shift-window";
import { logger } from "@/lib/logger";
import { writeAudit } from "./services/audit";
import { canWithOverride } from "./shiftOutputAccess";
import type { Session } from "./session";
import { jsonError, parseSearchParams } from "./http";
import { pickSite, requireShiftOutput, type ShiftScope } from "./shiftOutputScope";
import { loadReportData } from "./repos/shiftOutputReports";
import { checkEntryRefs, type SiteSettings } from "./repos/shiftOutputSetup";
import { getEntry, insertEntry, loadRecentContext, type EntryView, type EntryWrite } from "./repos/shiftOutputEntries";

/**
 * V4.10 (TASK-20261118-001) — luồng nghiệp vụ dùng chung cho route Sản lượng ca
 * (POST /entries và POST /entries/bulk chạy CÙNG 1 hàm → hành vi giống hệt).
 */

export interface FlowResult {
  status: number;
  body: Record<string, unknown>;
}

export function err(status: number, code: string, message: string, details?: Record<string, unknown>): FlowResult {
  return { status, body: { error: { code, message, ...(details ? { details } : {}) } } };
}

export function toResponse(r: FlowResult) {
  return NextResponse.json(r.body, { status: r.status });
}

export interface EntryApiView extends EntryView {
  locked: boolean;
  /** Số lần sửa sau khi tạo (badge "Đã sửa N lần"). */
  editCount: number;
}

export function withLock(entry: EntryView, site: SiteSettings, now = new Date()): EntryApiView {
  const locked = isEntryLocked(
    { status: entry.status, prodDate: entry.prodDate },
    { startTime: entry.shiftStart, endTime: entry.shiftEnd, crossesMidnight: entry.crossesMidnight },
    site,
    now,
  );
  // version tăng cả khi xoá mềm; dòng đang hiệu lực: mỗi lần sửa +1.
  return { ...entry, locked, editCount: Math.max(0, entry.version - 1 - (entry.deletedAt ? 1 : 0)) };
}

function firstError(issues: PolicyIssue[]): FlowResult {
  const first = issues[0]!;
  return err(422, first.code, first.message, { issues });
}

/** Snapshot ghi audit gọn (không gồm tên join). */
export function auditSnapshot(w: Partial<EntryWrite> & Record<string, unknown>) {
  const { defects, downtimes, ...rest } = w;
  return {
    ...rest,
    ...(defects ? { defects: defects.map((d) => `${d.reasonId}:${d.qty}`) } : {}),
    ...(downtimes ? { downtimes: downtimes.map((d) => `${d.reasonId}:${d.minutes}`) } : {}),
  };
}

/**
 * Tạo 1 dòng (đã qua requireShiftOutput create). `raw` chưa parse — bulk gửi
 * từng phần tử thô để lỗi 1 dòng không làm hỏng cả lô.
 */
export async function createEntryFlow(
  session: Session,
  scope: ShiftScope,
  raw: unknown,
  meta: { requestId: string | null; ipAddress: string | null; userAgent: string | null },
  now = new Date(),
): Promise<FlowResult & { clientUuid?: string }> {
  const parsed = shiftEntryCreateSchema.safeParse(raw, { errorMap: viErrorMap });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const clientUuid = (raw as { clientUuid?: unknown } | null)?.clientUuid;
    return {
      ...err(422, "VALIDATION_ERROR", `Dữ liệu không hợp lệ. ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`.trim()),
      clientUuid: typeof clientUuid === "string" ? clientUuid : undefined,
    };
  }
  const b: ShiftEntryCreate = parsed.data;
  const withId = <T extends FlowResult>(r: T) => ({ ...r, clientUuid: b.clientUuid });

  const picked = await pickSite(scope, b.siteId ?? null);
  if ("response" in picked) return withId(err(404, "SITE_NOT_FOUND", "Không tìm thấy xưởng."));
  const site = picked.site;

  const refs = await checkEntryRefs(site.id, {
    shiftId: b.shiftId,
    machineId: b.machineId,
    partId: b.partId,
    operatorId: b.operatorId ?? null,
    defectReasonIds: b.defects.map((d) => d.reasonId),
    downtimeReasonIds: b.downtimes.map((d) => d.reasonId),
  });
  if (refs.invalid.length > 0 || !refs.shift) {
    return withId(
      err(422, "INVALID_REFERENCE", "Máy / ca / mã hàng / người / lý do không thuộc xưởng hoặc đã ngừng dùng.", {
        fields: refs.invalid,
      }),
    );
  }
  const shift = refs.shift as unknown as { startTime: string; endTime: string; crossesMidnight: boolean };
  const minutes = shiftMinutes(shift);
  const canApprove = await canWithOverride(session, "approve");
  const recent = await loadRecentContext(site.id, todayInTz(now, site.timezone));
  const policy = validateEntry(
    { ...b, defects: b.defects, downtimes: b.downtimes },
    {
      shiftMinutes: minutes,
      today: todayInTz(now, site.timezone),
      backdateDays: site.backdateDays,
      canApprove,
      ngWarnPct: site.ngWarnPct,
      avgOk30: recent.avgOk30[`${b.machineId}:${b.partId}`] ?? null,
    },
  );
  if (policy.errors.length > 0) return withId(firstError(policy.errors));

  const w: EntryWrite = {
    prodDate: b.prodDate,
    shiftId: b.shiftId,
    machineId: b.machineId,
    partId: b.partId,
    operatorId: b.operatorId ?? null,
    operatorName: b.operatorId ? null : (b.operatorName ?? null),
    qtyPlanned: b.qtyPlanned ?? null,
    qtyOk: b.qtyOk,
    qtyNg: b.qtyNg,
    qtyRework: b.qtyRework ?? null,
    downtimeMin: policy.downtimeMin,
    shiftMinutes: minutes,
    materialLot: b.materialLot,
    notes: b.notes,
    defects: b.defects,
    downtimes: b.downtimes.map((d) => ({ ...d, note: d.note ?? null })),
  };

  const result = await insertEntry(site.id, b.clientUuid, w, session.userId);
  if (result.kind === "duplicate") {
    return withId(
      err(409, "DUPLICATE_SLOT", "Máy này đã có dòng cùng ngày, ca và mã hàng — mở dòng cũ để sửa.", {
        existingId: result.existingId,
      }),
    );
  }
  if (result.kind === "replayed") {
    if (result.siteId !== site.id) return withId(err(409, "CLIENT_UUID_CONFLICT", "Mã gửi bị trùng. Thử lưu lại."));
    const prev = await getEntry(result.id);
    return withId({ status: 200, body: { data: prev ? withLock(prev, site, now) : { id: result.id }, replayed: true } });
  }

  await writeAudit({
    actor: session,
    action: "CREATE",
    objectType: "shift_output_entry",
    objectId: result.id,
    after: auditSnapshot({ ...w, siteId: site.id, clientUuid: b.clientUuid }),
    ...meta,
  });
  const row = await getEntry(result.id);
  if (!row) {
    logger.warn({ id: result.id }, "shift entry created but not readable");
    return withId({ status: 201, body: { data: { id: result.id }, warnings: policy.warnings } });
  }
  return withId({ status: 201, body: { data: withLock(row, site, now), warnings: policy.warnings } });
}

/* ── Báo cáo ─────────────────────────────────────────────────────────── */

/** Guard + parse + giới hạn khoảng ngày + tải dữ liệu thô cho mọi route báo cáo. */
export async function loadReportRequest(req: NextRequest) {
  const guard = await requireShiftOutput(req, "read", "shiftOutputReport");
  if ("response" in guard) return guard;
  const q = parseSearchParams(req, shiftReportQuerySchema);
  if ("response" in q) return q;
  const span = diffDays(q.data.from, q.data.to);
  if (span < 0) return { response: jsonError("INVALID_RANGE", "Ngày bắt đầu phải trước ngày kết thúc.", 422) };
  if (span + 1 > SHIFT_REPORT_MAX_DAYS) {
    return { response: jsonError("RANGE_TOO_LARGE", `Báo cáo tối đa ${SHIFT_REPORT_MAX_DAYS} ngày.`, 422) };
  }
  const picked = await pickSite(guard.scope, q.data.siteId);
  if ("response" in picked) return picked;
  const data = await loadReportData(picked.site.id, q.data);
  return { site: picked.site, query: q.data, data, session: guard.session };
}
