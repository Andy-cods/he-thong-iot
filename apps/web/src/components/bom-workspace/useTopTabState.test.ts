import { describe, expect, it } from "vitest";
import { HIDDEN_TOP_TAB_KEYS, TOP_TAB_KEYS } from "./useTopTabState";

describe("top tab ẩn", () => {
  it("ẩn Đơn hàng / Sản xuất / Lệnh SX, giữ 4 tab còn lại theo thứ tự", () => {
    expect(HIDDEN_TOP_TAB_KEYS).toEqual(
      expect.arrayContaining(["orders", "production", "work-orders"]),
    );
    expect(TOP_TAB_KEYS).toEqual([
      "materials",
      "delivery-slips",
      "procurement",
      "audit",
    ]);
  });
});
