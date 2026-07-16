import { describe, expect, it } from "vitest";
import { orderCreateSchema } from "./order";

describe("Sales Order schema", () => {
  it("defaults priority to NORMAL", () => {
    const parsed = orderCreateSchema.parse({
      customerName: "Khách E2E",
      productItemId: "00000000-0000-4000-8000-000000000001",
      orderQty: 1,
    });

    expect(parsed.priority).toBe("NORMAL");
  });

  it("keeps an explicit priority", () => {
    const parsed = orderCreateSchema.parse({
      customerName: "Khách E2E",
      productItemId: "00000000-0000-4000-8000-000000000001",
      orderQty: 1,
      priority: "URGENT",
    });

    expect(parsed.priority).toBe("URGENT");
  });
});
