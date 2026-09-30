import { describe, expect, it } from "vitest";
import {
  daysSinceApproved,
  mergeUniqueUserIds,
  outstandingAmount,
  prReminderStepLabel,
  prReminderTargetRoles,
} from "./reminderLogic.js";

describe("prReminderTargetRoles / prReminderStepLabel", () => {
  it("SUBMITTED → Kho + admin (chờ Trưởng bộ phận)", () => {
    expect(prReminderTargetRoles("SUBMITTED")).toEqual(["warehouse", "admin"]);
    expect(prReminderStepLabel("SUBMITTED")).toBe("Trưởng bộ phận");
  });

  it("DEPT_APPROVED → purchaser + admin (chờ Giám đốc/Mua hàng)", () => {
    expect(prReminderTargetRoles("DEPT_APPROVED")).toEqual(["purchaser", "admin"]);
    expect(prReminderStepLabel("DEPT_APPROVED")).toBe("Giám đốc/Mua hàng");
  });
});

describe("daysSinceApproved", () => {
  const now = new Date("2026-09-30T00:00:00Z").getTime();

  it("null khi không có mốc duyệt", () => {
    expect(daysSinceApproved(null, now)).toBeNull();
  });

  it("tính đúng số ngày đã trôi qua (làm tròn xuống)", () => {
    const approvedAt = new Date("2026-09-27T00:00:00Z");
    expect(daysSinceApproved(approvedAt, now)).toBe(3);
  });

  it("chưa đủ 1 ngày → 0 (không âm)", () => {
    const approvedAt = new Date("2026-09-29T23:00:00Z");
    expect(daysSinceApproved(approvedAt, now)).toBe(0);
  });

  it("mốc duyệt ở tương lai (đồng hồ lệch) → 0, không âm", () => {
    const approvedAt = new Date("2026-10-05T00:00:00Z");
    expect(daysSinceApproved(approvedAt, now)).toBe(0);
  });
});

describe("mergeUniqueUserIds", () => {
  it("gộp nhiều nhóm, loại trùng (user nhiều vai trò)", () => {
    const accountant = ["u1", "u2"];
    const admin = ["u2", "u3"];
    expect(mergeUniqueUserIds(accountant, admin).sort()).toEqual(["u1", "u2", "u3"]);
  });

  it("nhóm rỗng không lỗi", () => {
    expect(mergeUniqueUserIds([], [])).toEqual([]);
  });
});

describe("outstandingAmount", () => {
  it("tổng trừ đã trả", () => {
    expect(outstandingAmount(1000, 300)).toBe(700);
  });

  it("chấp nhận string (numeric từ Postgres)", () => {
    expect(outstandingAmount("1000.00", "1000.00")).toBe(0);
  });

  it("không âm dù dữ liệu lệch (đã trả > tổng)", () => {
    expect(outstandingAmount(500, 800)).toBe(0);
  });
});
