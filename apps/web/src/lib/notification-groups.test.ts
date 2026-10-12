import { describe, expect, it } from "vitest";
import { groupNotificationsByCategory } from "./notification-groups";

describe("L14 — nhóm 'Cần bạn duyệt' chỉ gồm việc còn mở", () => {
  it("action chưa đọc ở nhóm Cần bạn duyệt; action đã đọc/đã xử lý xuống Cập nhật", () => {
    const groups = groupNotificationsByCategory([
      { id: 1, category: "action", readAt: null },
      { id: 2, category: "action", readAt: "2026-10-12T01:00:00Z" },
      { id: 3, category: "update", readAt: null },
      { id: 4, category: "reminder", readAt: "2026-10-12T02:00:00Z" },
      { id: 5, category: "reminder", readAt: null },
    ]);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.items.map((i) => i.id)]));
    expect(byKey.action).toEqual([1]);
    expect(byKey.update).toEqual([2, 3, 4]);
    expect(byKey.reminder).toEqual([5]);
  });

  it("không có nhóm rỗng", () => {
    const groups = groupNotificationsByCategory([{ category: "action", readAt: "x" }]);
    expect(groups.map((g) => g.key)).toEqual(["update"]);
  });
});
