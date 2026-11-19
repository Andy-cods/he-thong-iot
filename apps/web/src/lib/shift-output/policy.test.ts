import { describe, expect, it } from "vitest";
import { checkLockedWrite, effectiveDowntime, isEntryLocked, lockDeadline, validateEntry, type PolicyContext } from "./policy";

const ctx: PolicyContext = { shiftMinutes: 240, today: "2026-11-18", backdateDays: 2, canApprove: false, ngWarnPct: 10, avgOk30: null };
const base = { prodDate: "2026-11-18", qtyOk: 480, qtyNg: 12, defects: [{ qty: 12 }] };
const codes = (r: { errors: Array<{ code: string }> }) => r.errors.map((e) => e.code);
const warn = (r: { warnings: Array<{ code: string }> }) => r.warnings.map((e) => e.code);

describe("validateEntry — V1..V6", () => {
  it("dòng chuẩn không lỗi, không cảnh báo", () => {
    const r = validateEntry(base, ctx);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
  it("V1 — OK=NG=0 không dừng → lỗi; có dừng → hợp lệ", () => {
    expect(codes(validateEntry({ prodDate: "2026-11-18", qtyOk: 0, qtyNg: 0 }, ctx))).toEqual(["NO_OUTPUT"]);
    expect(codes(validateEntry({ prodDate: "2026-11-18", qtyOk: 0, qtyNg: 0, downtimes: [{ minutes: 240 }] }, ctx))).toEqual([]);
  });
  it("V2 — rework > NG, Σ lỗi > NG → lỗi; Σ lỗi < NG → cảnh báo chưa phân loại", () => {
    expect(codes(validateEntry({ ...base, qtyRework: 13 }, ctx))).toContain("REWORK_OVER_NG");
    expect(codes(validateEntry({ ...base, defects: [{ qty: 8 }, { qty: 5 }] }, ctx))).toContain("DEFECT_OVER_NG");
    const r = validateEntry({ ...base, defects: [{ qty: 7 }] }, ctx);
    expect(r.errors).toEqual([]);
    expect(warn(r)).toEqual(["UNCLASSIFIED_NG"]);
    expect(r.warnings[0]?.message).toContain("Còn 5 NG");
  });
  it("V3 — %NG vượt ngưỡng / OK > 2× TB 30 ngày → cảnh báo xác nhận", () => {
    expect(warn(validateEntry({ ...base, qtyOk: 50, qtyNg: 10, defects: [{ qty: 10 }] }, ctx))).toEqual(["HIGH_NG"]);
    expect(warn(validateEntry(base, { ...ctx, avgOk30: 200 }))).toEqual(["OK_SPIKE"]);
    expect(warn(validateEntry(base, { ...ctx, avgOk30: 300 }))).toEqual([]);
  });
  it("V4 — dừng > phút ca; có chi tiết thì tổng = Σ chi tiết", () => {
    expect(codes(validateEntry({ ...base, downtimeMin: 241 }, ctx))).toContain("DOWNTIME_OVER_SHIFT");
    const r = validateEntry({ ...base, downtimeMin: 5, downtimes: [{ minutes: 20 }, { minutes: 30 }] }, ctx);
    expect(r.downtimeMin).toBe(50);
    expect(effectiveDowntime({ downtimeMin: null })).toBeNull();
  });
  it("V6 — tương lai chặn; lùi quá 2 ngày cần approve", () => {
    expect(codes(validateEntry({ ...base, prodDate: "2026-11-19" }, ctx))).toEqual(["FUTURE_DATE"]);
    expect(codes(validateEntry({ ...base, prodDate: "2026-11-16" }, ctx))).toEqual([]);
    expect(codes(validateEntry({ ...base, prodDate: "2026-11-15" }, ctx))).toEqual(["BACKDATE_LIMIT"]);
    expect(codes(validateEntry({ ...base, prodDate: "2026-11-15" }, { ...ctx, canApprove: true }))).toEqual([]);
  });
});

describe("khoá — mốc 24h sau khi hết ca (V7)", () => {
  const CA2 = { startTime: "13:00:00", endTime: "17:00:00", crossesMidnight: false };
  const site = { lockAfterHours: 24, timezone: "Asia/Ho_Chi_Minh" };
  const e = { status: "SUBMITTED", prodDate: "2026-11-18" };
  it("hạn khoá = 17:00 hôm sau (giờ VN)", () => {
    expect(lockDeadline("2026-11-18", CA2, 24).toISOString()).toBe("2026-11-19T10:00:00.000Z");
  });
  it("trước mốc chưa khoá, sau mốc khoá; LOCKED luôn khoá", () => {
    expect(isEntryLocked(e, CA2, site, new Date("2026-11-19T16:59:00+07:00"))).toBe(false);
    expect(isEntryLocked(e, CA2, site, new Date("2026-11-19T17:00:01+07:00"))).toBe(true);
    expect(isEntryLocked({ ...e, status: "LOCKED" }, CA2, site, new Date("2026-11-18T13:30:00+07:00"))).toBe(true);
  });
  it("lock_after_hours = 0 → khoá ngay khi hết ca", () => {
    expect(isEntryLocked(e, CA2, { lockAfterHours: 0 }, new Date("2026-11-18T17:00:01+07:00"))).toBe(true);
  });
  it("sửa dòng khoá: không approve → 403; approve thiếu lý do → 422; đủ → cho", () => {
    expect(checkLockedWrite(false, false, null)).toBeNull();
    expect(checkLockedWrite(true, false, "lý do dài")?.status).toBe(403);
    expect(checkLockedWrite(true, true, "sai")?.code).toBe("REASON_REQUIRED");
    expect(checkLockedWrite(true, true, "Nhập nhầm máy")).toBeNull();
  });
});
