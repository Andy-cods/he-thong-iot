import { describe, expect, it } from "vitest";
import { bucketActionItemsByEntityType } from "./dashboard-action-items";

describe("bucketActionItemsByEntityType", () => {
  it("gộp purchase_request → prPending, purchase_order → poPending, còn lại → otherPending", () => {
    const result = bucketActionItemsByEntityType({
      purchase_request: 3,
      purchase_order: 2,
      work_order: 1,
      warehouse_issue_request: 1,
      delivery_note: 1,
    });
    expect(result).toEqual({ prPending: 3, poPending: 2, otherPending: 3, total: 8 });
  });

  it("rỗng → toàn 0", () => {
    expect(bucketActionItemsByEntityType({})).toEqual({
      prPending: 0,
      poPending: 0,
      otherPending: 0,
      total: 0,
    });
  });

  it("chỉ 1 loại", () => {
    expect(bucketActionItemsByEntityType({ purchase_request: 5 })).toEqual({
      prPending: 5,
      poPending: 0,
      otherPending: 0,
      total: 5,
    });
  });

  it("entity_type lạ/không xác định vẫn gộp vào otherPending (không rơi mất)", () => {
    const result = bucketActionItemsByEntityType({ fin_invoice: 2, unknown_type: 1 });
    expect(result.otherPending).toBe(3);
    expect(result.total).toBe(3);
  });
});
