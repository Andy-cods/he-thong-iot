import { describe, expect, it } from "vitest";
import {
  addDays,
  diffDays,
  entryMinutes,
  isOvernight,
  localParts,
  shiftMinutes,
  shiftPhase,
  shiftStartEnd,
  suggestCurrentShift,
  workRangeLabel,
  workWindowMinutes,
  zonedToUtc,
} from "./shift-window";

const CA1 = { id: "ca1", code: "CA1", startTime: "08:00:00", endTime: "12:00:00", crossesMidnight: false };
const CA2 = { id: "ca2", code: "CA2", startTime: "13:00:00", endTime: "17:00:00", crossesMidnight: false };
const CA3 = { id: "ca3", code: "CA3", startTime: "18:00:00", endTime: "22:00:00", crossesMidnight: false };
const SHIFTS = [CA3, CA1, CA2]; // cố ý không theo thứ tự
/** Giờ VN (UTC+7) → Date. */
const vn = (d: string, t: string) => new Date(`${d}T${t}:00+07:00`);

describe("shift-window — giờ VN", () => {
  it("zonedToUtc / localParts khớp UTC+7", () => {
    expect(zonedToUtc("2026-11-18", "08:00").toISOString()).toBe("2026-11-18T01:00:00.000Z");
    expect(localParts(new Date("2026-11-18T17:30:00Z"))).toEqual({ date: "2026-11-19", minutes: 30 });
  });
  it("shiftMinutes = 240 cho 3 ca Đông Anh; ca qua đêm cộng 24h", () => {
    for (const s of SHIFTS) expect(shiftMinutes(s)).toBe(240);
    expect(shiftMinutes({ startTime: "22:00", endTime: "06:00", crossesMidnight: true })).toBe(480);
  });
  it("shiftStartEnd + ca qua đêm kết thúc ngày hôm sau", () => {
    const w = shiftStartEnd("2026-11-18", CA2);
    expect(w.start.toISOString()).toBe("2026-11-18T06:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-18T10:00:00.000Z");
    const night = shiftStartEnd("2026-11-18", { startTime: "22:00", endTime: "06:00", crossesMidnight: true });
    expect(night.end.toISOString()).toBe("2026-11-18T23:00:00.000Z");
  });
  it("shiftPhase", () => {
    expect(shiftPhase("2026-11-18", CA1, vn("2026-11-18", "07:59"))).toBe("upcoming");
    expect(shiftPhase("2026-11-18", CA1, vn("2026-11-18", "10:00"))).toBe("running");
    expect(shiftPhase("2026-11-18", CA1, vn("2026-11-18", "12:00"))).toBe("ended");
  });
  it("addDays / diffDays qua tháng, năm", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-11-16", "2026-11-18")).toBe(2);
  });
});

describe("suggestCurrentShift", () => {
  const cases: Array<[string, string, string]> = [
    ["10:00", "2026-11-18", "CA1"], // giữa ca 1
    ["12:30", "2026-11-18", "CA1"], // nghỉ trưa → ca vừa xong
    ["13:00", "2026-11-18", "CA2"],
    ["17:45", "2026-11-18", "CA2"], // nghỉ chiều → ca vừa xong
    ["19:00", "2026-11-18", "CA3"],
    ["23:30", "2026-11-18", "CA3"], // sau 22h → Ca 3 cùng ngày
    ["06:00", "2026-11-17", "CA3"], // trước 8h → Ca 3 hôm trước
  ];
  it.each(cases)("lúc %s → %s %s", (t, date, code) => {
    const r = suggestCurrentShift(vn("2026-11-18", t), SHIFTS);
    expect({ date: r?.prodDate, code: r?.shift.code }).toEqual({ date, code });
  });
  it("ca qua nửa đêm đang chạy → ngày bắt đầu (hôm qua)", () => {
    const night = { id: "n", code: "DEM", startTime: "22:00", endTime: "06:00", crossesMidnight: true };
    const r = suggestCurrentShift(vn("2026-11-18", "02:00"), [CA1, night]);
    expect({ d: r?.prodDate, c: r?.shift.code }).toEqual({ d: "2026-11-17", c: "DEM" });
  });
  it("không có ca → null", () => {
    expect(suggestCurrentShift(new Date(), [])).toBeNull();
  });
});

describe("P2 — giờ chạy thực tế", () => {
  it("workWindowMinutes: thường, qua nửa đêm, bằng nhau → null", () => {
    expect(workWindowMinutes("07:00", "19:00")).toBe(720);
    expect(workWindowMinutes("08:00:00", "12:00:00")).toBe(240);
    expect(workWindowMinutes("19:00", "07:00")).toBe(720);
    expect(workWindowMinutes("23:00", "01:30")).toBe(150);
    expect(workWindowMinutes("00:00", "23:59")).toBe(1439);
    expect(workWindowMinutes("23:59", "00:00")).toBe(1);
    expect(workWindowMinutes("07:00", "07:00")).toBeNull();
  });
  it("entryMinutes: có giờ thực tế → phút thực tế; không → độ dài ca", () => {
    expect(entryMinutes(CA1, "07:00", "19:00")).toBe(720);
    expect(entryMinutes(CA1, null, null)).toBe(240);
    expect(entryMinutes(CA1, "07:00", null)).toBe(240);
    expect(entryMinutes({ startTime: "19:00", endTime: "07:00", crossesMidnight: true })).toBe(720);
  });
  it("isOvernight tự nhận ca qua nửa đêm", () => {
    expect(isOvernight("19:00", "07:00")).toBe(true);
    expect(isOvernight("07:00", "19:00")).toBe(false);
  });
  it("workRangeLabel chỉ hiện khi khác giờ ca", () => {
    expect(workRangeLabel("08:00:00", "12:00:00", "08:00", "12:00")).toBeNull();
    expect(workRangeLabel("07:00", "19:00", "08:00:00", "12:00:00")).toBe("07:00–19:00");
    expect(workRangeLabel(null, null, "08:00", "12:00")).toBeNull();
  });
  it("2 ca 12 giờ phủ 24h: gợi ý đúng ca + ngày", () => {
    const day = { id: "d", code: "NGAY", startTime: "07:00", endTime: "19:00", crossesMidnight: false };
    const night = { id: "n", code: "DEM", startTime: "19:00", endTime: "07:00", crossesMidnight: true };
    const at = (t: string) => {
      const r = suggestCurrentShift(vn("2026-11-18", t), [day, night]);
      return `${r?.prodDate} ${r?.shift.code}`;
    };
    expect(at("10:00")).toBe("2026-11-18 NGAY");
    expect(at("20:00")).toBe("2026-11-18 DEM");
    expect(at("03:00")).toBe("2026-11-17 DEM");
    expect(at("06:59")).toBe("2026-11-17 DEM");
    expect(at("07:00")).toBe("2026-11-18 NGAY");
  });
});
