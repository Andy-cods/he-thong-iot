import { describe, expect, it } from "vitest";
import { csvEscape, toCsv } from "./csv";

describe("csv (V4.1 Đợt 1c — báo cáo đối soát)", () => {
  it("BOM UTF-8 + CRLF để Excel đọc đúng tiếng Việt", () => {
    const out = toCsv(["Mã", "Tên"], [["A-01", "Bu lông"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿Mã,Tên\r\nA-01,Bu lông\r\n");
  });

  it("escape dấu phẩy / nháy kép / xuống dòng", () => {
    expect(csvEscape('Ốc "M8", mạ kẽm')).toBe('"Ốc ""M8"", mạ kẽm"');
    expect(csvEscape("a\nb")).toBe('"a\nb"');
    expect(csvEscape("x;y")).toBe('"x;y"');
  });

  it("null/undefined → rỗng; số giữ nguyên (kể cả âm)", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(-2.5)).toBe("-2.5");
    expect(csvEscape(Number.NaN)).toBe("");
  });

  it("chặn CSV injection: chuỗi bắt đầu = + - @ → thêm dấu nháy đơn", () => {
    expect(csvEscape("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("-1+2")).toBe("'-1+2");
  });
});
