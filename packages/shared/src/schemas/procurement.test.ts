import { describe, expect, it } from "vitest";
import { poCreateSchema, poUpdateSchema } from "./procurement";

const uuidA = "00000000-0000-4000-8000-000000000001";
const uuidB = "00000000-0000-4000-8000-000000000002";

describe("PO schemas", () => {
  it("defaults to a plain draft", () => {
    const parsed = poCreateSchema.parse({
      supplierId: uuidA,
      lines: [{ itemId: uuidB, orderedQty: 1 }],
    });

    expect(parsed.autoApprove).toBe(false);
    expect(parsed.submitForApproval).toBe(false);
  });

  it("accepts atomic submit-for-approval on create", () => {
    const parsed = poCreateSchema.parse({
      supplierId: uuidA,
      submitForApproval: true,
      lines: [{ itemId: uuidB, orderedQty: 2 }],
    });

    expect(parsed.submitForApproval).toBe(true);
  });

  it("rejects status through the generic update schema", () => {
    expect(() =>
      poUpdateSchema.parse({
        notes: "unsafe update",
        status: "SENT",
      }),
    ).toThrow();
  });
});
