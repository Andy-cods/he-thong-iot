import { describe, expect, it } from "vitest";
import { LIMITS } from "@iot/shared";
import { assertImportRowLimit, ImportTooManyRowsError } from "./importLimits";

describe("assertImportRowLimit (V4.2 audit S15)", () => {
  it("không throw khi số dòng trong giới hạn", () => {
    expect(() => assertImportRowLimit(100)).not.toThrow();
    expect(() => assertImportRowLimit(LIMITS.IMPORT_MAX_ROWS)).not.toThrow();
  });

  it("throw ImportTooManyRowsError khi vượt giới hạn mặc định", () => {
    expect(() => assertImportRowLimit(LIMITS.IMPORT_MAX_ROWS + 1)).toThrow(
      ImportTooManyRowsError,
    );
  });

  it("thông báo lỗi bằng tiếng Việt, có số dòng + ngưỡng", () => {
    try {
      assertImportRowLimit(25_000, 20_000);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ImportTooManyRowsError);
      const e = err as ImportTooManyRowsError;
      expect(e.code).toBe("IMPORT_TOO_MANY_ROWS");
      expect(e.message).toMatch(/25.000/);
      expect(e.message).toMatch(/20.000/);
    }
  });

  it("chấp nhận ngưỡng tuỳ chỉnh", () => {
    expect(() => assertImportRowLimit(50, 40)).toThrow(ImportTooManyRowsError);
    expect(() => assertImportRowLimit(40, 40)).not.toThrow();
  });
});
