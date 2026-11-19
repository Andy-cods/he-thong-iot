import { NextResponse, type NextRequest } from "next/server";
import { shiftEntryDeleteSchema, shiftEntryPatchSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { checkLockedWrite, validateEntry } from "@/lib/shift-output/policy";
import { shiftMinutes, todayInTz } from "@/lib/shift-output/shift-window";
import { extractRequestMeta, jsonError, parseJson, validateUuidParam } from "@/server/http";
import { diffObjects, writeAudit } from "@/server/services/audit";
import { canWithOverride } from "@/server/shiftOutputAccess";
import { requireShiftOutput, scopeAllows } from "@/server/shiftOutputScope";
import { auditSnapshot, withLock } from "@/server/shiftOutputHttp";
import { checkEntryRefs, getSiteById } from "@/server/repos/shiftOutputSetup";
import {
  findActiveSlot,
  getEntry,
  loadRecentContext,
  softDeleteEntry,
  updateEntry,
  type EntryView,
  type EntryWrite,
} from "@/server/repos/shiftOutputEntries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => jsonError("NOT_FOUND", "Không tìm thấy dòng sản lượng.", 404);

function toWrite(e: EntryView): EntryWrite {
  return {
    prodDate: e.prodDate,
    shiftId: e.shiftId,
    machineId: e.machineId,
    partId: e.partId,
    operatorId: e.operatorId,
    operatorName: e.operatorId ? null : e.operatorName,
    qtyPlanned: e.qtyPlanned,
    qtyOk: e.qtyOk,
    qtyNg: e.qtyNg,
    qtyRework: e.qtyRework,
    downtimeMin: e.downtimeMin,
    shiftMinutes: e.shiftMinutes,
    materialLot: e.materialLot,
    notes: e.notes,
    defects: e.defects.map((d) => ({ reasonId: d.reasonId, qty: d.qty })),
    downtimes: e.downtimes.map((d) => ({ reasonId: d.reasonId, minutes: d.minutes, note: d.note })),
  };
}

/** Dòng của site ngoài phạm vi → 404 (không lộ tồn tại). */
async function loadScoped(id: string, scope: Parameters<typeof scopeAllows>[0]) {
  const entry = await getEntry(id);
  if (!entry || entry.deletedAt || !scopeAllows(scope, entry.siteId)) return null;
  const site = await getSiteById(entry.siteId);
  return site ? { entry, site } : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireShiftOutput(req, "read", "shiftOutput");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  const found = await loadScoped(params.id, guard.scope);
  if (!found) return notFound();
  return NextResponse.json({ data: withLock(found.entry, found.site) });
}

/** PATCH — gửi kèm `version` (lệch → 409 STALE); dòng đã khoá cần approve + lý do (V7). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireShiftOutput(req, "update", "shiftOutput");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  const body = await parseJson(req, shiftEntryPatchSchema);
  if ("response" in body) return body.response;
  const p = body.data;

  try {
    const found = await loadScoped(params.id, guard.scope);
    if (!found) return notFound();
    const { entry, site } = found;
    const now = new Date();
    const locked = withLock(entry, site, now).locked;
    const canApprove = await canWithOverride(guard.session, "approve");
    const denial = checkLockedWrite(locked, canApprove, p.reason);
    if (denial) return jsonError(denial.code, denial.message, denial.status);
    if (p.version !== entry.version) {
      return jsonError("STALE", "Dòng vừa được người khác sửa. Tải lại để xem bản mới.", 409, {
        currentVersion: entry.version,
      });
    }

    const before = toWrite(entry);
    const next: EntryWrite = { ...before };
    for (const k of ["prodDate", "shiftId", "machineId", "partId", "qtyOk", "qtyNg"] as const) {
      if (p[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = p[k];
    }
    for (const k of ["qtyPlanned", "qtyRework", "downtimeMin", "materialLot", "notes"] as const) {
      if (p[k] !== undefined) (next as unknown as Record<string, unknown>)[k] = p[k] ?? null;
    }
    if (p.operatorId !== undefined) {
      next.operatorId = p.operatorId ?? null;
      next.operatorName = p.operatorId ? null : (p.operatorName ?? null);
    } else if (p.operatorName !== undefined) {
      next.operatorId = null;
      next.operatorName = p.operatorName ?? null;
    }
    if (p.defects) next.defects = p.defects;
    if (p.downtimes) next.downtimes = p.downtimes.map((d) => ({ ...d, note: d.note ?? null }));

    const refs = await checkEntryRefs(
      site.id,
      {
        shiftId: next.shiftId,
        machineId: next.machineId,
        partId: next.partId,
        operatorId: next.operatorId,
        defectReasonIds: next.defects.map((d) => d.reasonId),
        downtimeReasonIds: next.downtimes.map((d) => d.reasonId),
      },
      false,
    );
    if (refs.invalid.length > 0 || !refs.shift) {
      return jsonError("INVALID_REFERENCE", "Máy / ca / mã hàng / người / lý do không thuộc xưởng.", 422, {
        fields: refs.invalid,
      });
    }
    if (next.shiftId !== entry.shiftId) {
      next.shiftMinutes = shiftMinutes(refs.shift as unknown as { startTime: string; endTime: string; crossesMidnight: boolean });
    }
    // Không gửi chi tiết dừng mới nhưng có sẵn chi tiết → tổng vẫn = Σ chi tiết.
    const today = todayInTz(now, site.timezone);
    const recent = await loadRecentContext(site.id, today);
    const policy = validateEntry(next, {
      shiftMinutes: next.shiftMinutes,
      today,
      backdateDays: site.backdateDays,
      // Lùi ngày chỉ kiểm khi ĐỔI ngày (sửa dòng cũ chưa khoá không bị chặn bởi V6).
      canApprove: canApprove || next.prodDate === entry.prodDate,
      ngWarnPct: site.ngWarnPct,
      avgOk30: recent.avgOk30[`${next.machineId}:${next.partId}`] ?? null,
    });
    if (policy.errors.length > 0) {
      const first = policy.errors[0]!;
      return jsonError(first.code, first.message, 422, { issues: policy.errors });
    }
    next.downtimeMin = policy.downtimeMin;

    const slotChanged =
      next.prodDate !== entry.prodDate ||
      next.shiftId !== entry.shiftId ||
      next.machineId !== entry.machineId ||
      next.partId !== entry.partId;
    if (slotChanged) {
      const existingId = await findActiveSlot(site.id, next, entry.id);
      if (existingId) {
        return jsonError("DUPLICATE_SLOT", "Đã có dòng cùng ngày, ca, máy và mã hàng.", 409, { existingId });
      }
    }

    const result = await updateEntry(
      entry.id,
      p.version,
      next,
      { defects: p.defects !== undefined, downtimes: p.downtimes !== undefined },
      guard.session.userId,
    );
    if (result.kind === "not_found") return notFound();
    if (result.kind === "stale") {
      return jsonError("STALE", "Dòng vừa được người khác sửa. Tải lại để xem bản mới.", 409, {
        currentVersion: result.currentVersion,
      });
    }
    if (result.kind === "duplicate") {
      return jsonError("DUPLICATE_SLOT", "Đã có dòng cùng ngày, ca, máy và mã hàng.", 409, { existingId: result.existingId });
    }

    const diff = diffObjects(auditSnapshot({ ...before }), auditSnapshot({ ...next }));
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "shift_output_entry",
      objectId: entry.id,
      before: diff.before,
      after: diff.after,
      notes: [locked ? "Sửa dòng đã khoá" : null, p.reason].filter(Boolean).join(" — ") || null,
      ...extractRequestMeta(req),
    });
    const updated = await getEntry(entry.id);
    return NextResponse.json({ data: updated ? withLock(updated, site) : null, warnings: policy.warnings });
  } catch (err) {
    logger.error({ err, id: params.id }, "update shift entry failed");
    return jsonError("INTERNAL", "Lỗi sửa dòng sản lượng.", 500);
  }
}

/** DELETE — xoá mềm, bắt buộc lý do (≥5 ký tự); dòng đã khoá cần approve. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireShiftOutput(req, "delete", "shiftOutput");
  if ("response" in guard) return guard.response;
  const idCheck = validateUuidParam(params.id);
  if ("response" in idCheck) return idCheck.response;
  const body = await parseJson(req, shiftEntryDeleteSchema);
  if ("response" in body) return body.response;

  try {
    const found = await loadScoped(params.id, guard.scope);
    if (!found) return notFound();
    const { entry, site } = found;
    const locked = withLock(entry, site).locked;
    const canApprove = await canWithOverride(guard.session, "approve");
    const denial = checkLockedWrite(locked, canApprove, body.data.reason);
    if (denial) return jsonError(denial.code, denial.message, denial.status);

    const result = await softDeleteEntry(entry.id, body.data.version, body.data.reason, guard.session.userId);
    if (result.kind === "not_found") return notFound();
    if (result.kind === "stale") {
      return jsonError("STALE", "Dòng vừa được người khác sửa. Tải lại để xem bản mới.", 409, {
        currentVersion: result.currentVersion,
      });
    }
    await writeAudit({
      actor: guard.session,
      action: "DELETE",
      objectType: "shift_output_entry",
      objectId: entry.id,
      before: auditSnapshot({ ...toWrite(entry) }),
      notes: body.data.reason,
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: { id: entry.id, deleted: true } });
  } catch (err) {
    logger.error({ err, id: params.id }, "delete shift entry failed");
    return jsonError("INTERNAL", "Lỗi xoá dòng sản lượng.", 500);
  }
}
