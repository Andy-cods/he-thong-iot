import { describe, expect, it, vi } from "vitest";

// warehouseToday.ts import `db` + `inboundQc.ts` (dùng `logger`) — test này chỉ
// chạm hàm thuần, mock cả 2 theo mẫu receivingEvents.test.ts để import không
// đòi DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { computeEtaBucket, isPoDueSoonOrOverdue } from "./warehouseToday";

describe("computeEtaBucket", () => {
  it("cùng ngày → daysUntil = 0, không quá hạn", () => {
    expect(computeEtaBucket("2026-09-30", "2026-09-30")).toEqual({
      daysUntil: 0,
      overdue: false,
    });
  });

  it("còn 3 ngày → daysUntil = 3, không quá hạn", () => {
    expect(computeEtaBucket("2026-10-03", "2026-09-30")).toEqual({
      daysUntil: 3,
      overdue: false,
    });
  });

  it("đã qua ETA 2 ngày → daysUntil = -2, quá hạn", () => {
    expect(computeEtaBucket("2026-09-28", "2026-09-30")).toEqual({
      daysUntil: -2,
      overdue: true,
    });
  });

  it("bỏ qua phần giờ trong chuỗi ISO đầy đủ", () => {
    expect(computeEtaBucket("2026-10-01T00:00:00.000Z", "2026-09-30T23:00:00.000Z")).toEqual({
      daysUntil: 1,
      overdue: false,
    });
  });
});

describe("isPoDueSoonOrOverdue", () => {
  it("quá hạn (âm) → true", () => {
    expect(isPoDueSoonOrOverdue(-1)).toBe(true);
  });
  it("trong ngưỡng 3 ngày → true", () => {
    expect(isPoDueSoonOrOverdue(0)).toBe(true);
    expect(isPoDueSoonOrOverdue(3)).toBe(true);
  });
  it("ngoài ngưỡng → false", () => {
    expect(isPoDueSoonOrOverdue(4)).toBe(false);
  });
  it("tuỳ chỉnh ngưỡng warnDays", () => {
    expect(isPoDueSoonOrOverdue(5, 7)).toBe(true);
    expect(isPoDueSoonOrOverdue(8, 7)).toBe(false);
  });
});
