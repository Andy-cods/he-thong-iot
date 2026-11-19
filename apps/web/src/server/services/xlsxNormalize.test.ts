import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { normalizeXlsxRels } from "./xlsxNormalize";

/** Dựng 1 file .xlsx có ảnh rồi đổi mọi Target sang đường dẫn tuyệt đối (giống file xuất từ công cụ ngoài Excel). */
async function makeAbsoluteRelsXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BOM");
  ws.addRow(["STT", "Mã", "Tên"]);
  ws.addRow([1, "Z0000002-618841", "Chi tiết A"]);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  const imgId = wb.addImage({ buffer: png as unknown as ExcelJS.Buffer, extension: "png" });
  ws.addImage(imgId, { tl: { col: 3, row: 1 }, ext: { width: 10, height: 10 } });
  const raw = Buffer.from(await wb.xlsx.writeBuffer());
  const zip = await JSZip.loadAsync(raw);
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith(".rels")) continue;
    const dir = name.replace(/_rels\/[^/]+$/, "");
    const xml = await zip.file(name)!.async("string");
    const abs = xml.replace(/Target="([^"/][^"]*)"/g, (_m, t: string) => {
      const parts = (dir + t).split("/");
      const out: string[] = [];
      for (const p of parts) {
        if (p === "..") out.pop();
        else if (p && p !== ".") out.push(p);
      }
      return `Target="/${out.join("/")}"`;
    });
    zip.file(name, abs);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("normalizeXlsxRels", () => {
  it("file có Target tuyệt đối làm ExcelJS crash, sau chuẩn hoá thì đọc được", async () => {
    const bad = await makeAbsoluteRelsXlsx();
    const fixed = await normalizeXlsxRels(bad);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fixed as unknown as ArrayBuffer);
    expect(wb.getWorksheet("BOM")!.getRow(2).getCell(2).value).toBe("Z0000002-618841");
    const rels = await (await JSZip.loadAsync(fixed)).file("xl/worksheets/_rels/sheet1.xml.rels")!.async("string");
    expect(rels).toContain('Target="../drawings/drawing1.xml"');
  });

  it("file chuẩn của Excel giữ nguyên buffer", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A").addRow([1]);
    const ok = Buffer.from(await wb.xlsx.writeBuffer());
    expect(await normalizeXlsxRels(ok)).toBe(ok);
  });

  it("không phải zip → trả lại nguyên buffer", async () => {
    const junk = Buffer.from("not a zip");
    expect(await normalizeXlsxRels(junk)).toBe(junk);
  });
});

describe("prefixDefaultDrawingNs", () => {
  it("thêm tiền tố xdr: cho drawing dùng namespace mặc định, giữ nguyên a:", async () => {
    const { prefixDefaultDrawingNs } = await import("./xlsxNormalize");
    const xml =
      '<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><twoCellAnchor><from><col>2</col></from><pic><blipFill><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rId1"/></blipFill></pic><clientData/></twoCellAnchor></wsDr>';
    const out = prefixDefaultDrawingNs(xml);
    expect(out.startsWith('<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">')).toBe(true);
    expect(out).toContain("<xdr:col>2</xdr:col>");
    expect(out).toContain("<a:blip ");
    expect(out).toContain("<xdr:clientData/>");
    expect(out.endsWith("</xdr:wsDr>")).toBe(true);
  });
  it("drawing chuẩn (đã có xdr:) giữ nguyên", async () => {
    const { prefixDefaultDrawingNs } = await import("./xlsxNormalize");
    const xml = '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"></xdr:wsDr>';
    expect(prefixDefaultDrawingNs(xml)).toBe(xml);
  });
});
