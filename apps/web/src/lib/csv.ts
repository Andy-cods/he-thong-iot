/**
 * V4.1 Đợt 1c — dựng CSV phía client (báo cáo đối soát D4).
 *
 * - Thêm BOM UTF-8 (`﻿`) để Excel trên Windows đọc đúng tiếng Việt.
 * - Escape theo RFC 4180: bọc "…" khi có dấu phẩy / nháy kép / xuống dòng /
 *   chấm phẩy; nháy kép nhân đôi.
 * - Chặn CSV injection: ô chuỗi bắt đầu bằng = + - @ (kèm tab/CR) → thêm `'`
 *   phía trước để Excel không hiểu là công thức. Số giữ nguyên.
 */
export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvEscape(v: CsvCell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[",;\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Tải chuỗi CSV về máy (chỉ chạy trên trình duyệt). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
