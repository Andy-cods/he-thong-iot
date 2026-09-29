import { describe, expect, it } from "vitest";
import {
  isDangerousExcelText,
  sanitizeExcelCellValue,
  sanitizeExcelRow,
} from "./excelSafety";

describe("isDangerousExcelText (V4.2 audit S14)", () => {
  it("true khi ký tự đầu là = + - @ tab/CR", () => {
    expect(isDangerousExcelText("=SUM(A1:A2)")).toBe(true);
    expect(isDangerousExcelText("+1234")).toBe(true);
    expect(isDangerousExcelText("-cmd|calc")).toBe(true);
    expect(isDangerousExcelText("@SUM(1)")).toBe(true);
    expect(isDangerousExcelText("\tHello")).toBe(true);
    expect(isDangerousExcelText("\rHello")).toBe(true);
  });

  it("false với chuỗi bình thường, kể cả có dấu - ở giữa", () => {
    expect(isDangerousExcelText("PR-2607-0001")).toBe(false);
    expect(isDangerousExcelText("Nguyễn Văn A")).toBe(false);
    expect(isDangerousExcelText("")).toBe(false);
  });
});

describe("sanitizeExcelCellValue", () => {
  it("thêm tiền tố ' cho chuỗi nguy hiểm", () => {
    expect(sanitizeExcelCellValue("=1+1")).toBe("'=1+1");
    expect(sanitizeExcelCellValue("-DDE(...)")).toBe("'-DDE(...)");
  });

  it("giữ nguyên chuỗi an toàn (mã có dấu - ở giữa)", () => {
    expect(sanitizeExcelCellValue("PR-2607-0001")).toBe("PR-2607-0001");
  });

  it("KHÔNG áp dụng cho number/Date/null/undefined/boolean", () => {
    expect(sanitizeExcelCellValue(-1234)).toBe(-1234);
    expect(sanitizeExcelCellValue(0)).toBe(0);
    const d = new Date("2026-09-30T00:00:00Z");
    expect(sanitizeExcelCellValue(d)).toBe(d);
    expect(sanitizeExcelCellValue(null)).toBe(null);
    expect(sanitizeExcelCellValue(undefined)).toBe(undefined);
    expect(sanitizeExcelCellValue(true)).toBe(true);
  });
});

describe("sanitizeExcelRow", () => {
  it("sanitize từng phần tử chuỗi, giữ nguyên số", () => {
    const row = ["=cmd", 100, "Bình thường", -50, null];
    expect(sanitizeExcelRow(row)).toEqual(["'=cmd", 100, "Bình thường", -50, null]);
  });
});
