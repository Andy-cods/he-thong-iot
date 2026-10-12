/**
 * Header Content-Disposition an toàn cho tên file tiếng Việt.
 * `filename=` chỉ chứa ASCII (bỏ dấu, ký tự lạ -> "_") để Node/undici không ném
 * "Cannot convert argument to a ByteString"; `filename*=UTF-8''...` giữ tên gốc.
 */
export function contentDispositionAttachment(fileName: string): string {
  const ascii =
    fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || "file";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
