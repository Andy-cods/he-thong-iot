import { describe, expect, it } from "vitest";
import { normalizeRoutingPlan, routingPlanForInsert } from "./wo-routing";

describe("normalizeRoutingPlan (V4.1 SX-01)", () => {
  it("giữ nguyên mảng RoutingStep hợp lệ", () => {
    const steps = [
      { step_no: 1, name: "Cắt", duration_min: 30 },
      { step_no: 2, name: "Phay" },
    ];
    expect(normalizeRoutingPlan(steps)).toEqual(steps);
  });

  it("chuyển object metadata.routing (dữ liệu cũ gây văng trang) thành các bước", () => {
    const legacy = {
      materialCode: "SS400",
      blankSize: "100x50",
      processRoute: ["Cắt", "  Phay CNC ", "", "Mài"],
      estimatedHours: 3,
    };
    expect(normalizeRoutingPlan(legacy)).toEqual([
      { step_no: 1, name: "Cắt" },
      { step_no: 2, name: "Phay CNC" },
      { step_no: 3, name: "Mài" },
    ]);
  });

  it("object không có processRoute → mảng rỗng (không văng)", () => {
    expect(normalizeRoutingPlan({ materialCode: "SS400" })).toEqual([]);
  });

  it.each([null, undefined, "abc", 42, {}])("giá trị lạ %p → []", (v) => {
    expect(normalizeRoutingPlan(v)).toEqual([]);
  });

  it("lọc phần tử rác trong mảng", () => {
    expect(normalizeRoutingPlan([null, "x", { step_no: 1, name: "A" }])).toEqual([
      { step_no: 1, name: "A" },
    ]);
  });

  it("routingPlanForInsert trả null khi không có công đoạn", () => {
    expect(routingPlanForInsert({ materialCode: "SS400" })).toBeNull();
    expect(routingPlanForInsert({ processRoute: ["Cắt"] })).toEqual([
      { step_no: 1, name: "Cắt" },
    ]);
  });
});
