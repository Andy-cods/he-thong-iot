import { describe, expect, it } from "vitest";
import { contentDispositionAttachment } from "./content-disposition";

/** Giống kiểm tra của undici: mọi ký tự header phải <= 255 (ByteString). */
const isByteString = (v: string) => [...v].every((c) => c.charCodeAt(0) <= 255);

describe("L1 — Content-Disposition tên tiếng Việt", () => {
  it("'Tấm nhôm' (ký tự ngoài Latin-1) không làm header lỗi ByteString", () => {
    const h = contentDispositionAttachment("PR-Tấm nhôm.xlsx");
    expect(isByteString(h)).toBe(true);
    expect(h).toContain('filename="PR-Tam nhom.xlsx"');
    expect(h).toContain("filename*=UTF-8''PR-T%E1%BA%A5m%20nh%C3%B4m.xlsx");
  });

  it("'Bu lông' không bị mojibake ở filename= (bỏ dấu) và giữ nguyên ở filename*", () => {
    const h = contentDispositionAttachment("Bu lông M8.xlsx");
    expect(h).toContain('filename="Bu long M8.xlsx"');
    expect(decodeURIComponent(h.split("filename*=UTF-8''")[1]!)).toBe("Bu lông M8.xlsx");
  });

  it("đ/Đ và ký tự nguy hiểm (nháy kép, backslash, CJK) được làm sạch", () => {
    const h = contentDispositionAttachment('Đề xuất "A"\\B 材料.pdf');
    expect(isByteString(h)).toBe(true);
    const ascii = /filename="([^"]*)"/.exec(h)![1]!;
    expect(ascii).toBe("De xuat _A__B __.pdf");
  });

  it("tên rỗng → 'file'", () => {
    expect(contentDispositionAttachment("")).toContain('filename="file"');
  });
});
