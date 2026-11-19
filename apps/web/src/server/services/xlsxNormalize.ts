import path from "node:path";
import JSZip from "jszip";

/**
 * Chuẩn hoá file .xlsx trước khi đưa cho ExcelJS.
 *
 * Một số công cụ (không phải Excel) ghi đường dẫn TUYỆT ĐỐI trong các file
 * `.rels`, ví dụ `Target="/xl/drawings/drawing1.xml"` thay vì
 * `Target="../drawings/drawing1.xml"`. Chuẩn OOXML cho phép cả hai, nhưng
 * ExcelJS 4.4.0 chỉ hiểu đường dẫn tương đối → khi file có ảnh nhúng nó crash
 * ở `XLSX.reconcile` ("Cannot read properties of undefined (reading 'anchors')")
 * và người dùng thấy "Không đọc được file".
 *
 * Hàm đổi mọi Target tuyệt đối (trừ TargetMode="External") sang tương đối theo
 * thư mục của part chứa file .rels. File không cần sửa → trả lại nguyên buffer.
 */
const SPREADSHEET_DRAWING_NS =
  "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";

/** `<wsDr xmlns="…spreadsheetDrawing">` → `<xdr:wsDr xmlns:xdr="…">`, thẻ con không tiền tố → `xdr:`. */
export function prefixDefaultDrawingNs(xml: string): string {
  const defaultDecl = `xmlns="${SPREADSHEET_DRAWING_NS}"`;
  if (!xml.includes(defaultDecl)) return xml;
  // Có thẻ con tự khai báo namespace mặc định khác → không đoán, giữ nguyên.
  const otherDefault = xml.match(/\sxmlns="([^"]*)"/g) ?? [];
  if (otherDefault.some((d) => !d.includes(SPREADSHEET_DRAWING_NS))) return xml;

  let out = xml.replace(defaultDecl, `xmlns:xdr="${SPREADSHEET_DRAWING_NS}"`);
  // Thẻ mở/đóng không có ':' trong tên (bỏ qua <?xml …?>, <!-- -->, <![CDATA[)
  out = out.replace(/<(\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, (_m, slash: string, tag: string) => `<${slash}xdr:${tag}`);
  return out;
}

export async function normalizeXlsxRels(buffer: Buffer): Promise<Buffer> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return buffer; // không phải zip → để ExcelJS tự báo lỗi như cũ
  }

  let changed = false;
  for (const name of Object.keys(zip.files)) {
    if (!name.endsWith(".rels")) continue;
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");

    // "xl/worksheets/_rels/sheet1.xml.rels" → part nằm ở "xl/worksheets"
    // "_rels/.rels" → part ở gốc gói
    const relsDir = path.posix.dirname(name);
    const partDir = path.posix.dirname(relsDir);
    const baseDir = partDir === "." ? "" : partDir;

    const fixed = xml.replace(/<Relationship\b[^>]*>/g, (tag) => {
      if (/TargetMode\s*=\s*"External"/i.test(tag)) return tag;
      return tag.replace(/Target\s*=\s*"\/([^"]*)"/, (_m, absTarget: string) => {
        changed = true;
        const rel = baseDir ? path.posix.relative(baseDir, absTarget) : absTarget;
        return `Target="${rel}"`;
      });
    });
    if (fixed !== xml) zip.file(name, fixed);
  }

  // Drawing part ghi namespace MẶC ĐỊNH (`<wsDr xmlns="…spreadsheetDrawing">`,
  // không tiền tố) — hợp lệ về XML nhưng ExcelJS khớp tên thẻ theo chuỗi
  // "xdr:…" → không parse được drawing → crash. Thêm tiền tố `xdr:` cho các thẻ
  // không có tiền tố, chỉ trong các part drawing dùng namespace mặc định đó.
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/drawings\/[^/]+\.xml$/.test(name)) continue;
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");
    const fixedXml = prefixDefaultDrawingNs(xml);
    if (fixedXml !== xml) {
      zip.file(name, fixedXml);
      changed = true;
    }
  }

  if (!changed) return buffer;
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
