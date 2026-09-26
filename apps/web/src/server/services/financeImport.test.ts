/**
 * V4.1 Đợt 3 — Import Excel thu/chi: TC-04 (chọn sheet bằng chính file mẫu),
 * TC-18 (khớp nguồn chính xác), TC-22 (parse số/ngày), TC-23 (dedupe có chiều
 * + 2 khoản hợp lệ giống nhau), Q7 (cột "Nguồn", cảnh báo số dư âm).
 * Phần thuần — không chạm DB (mock `@/lib/db`).
 */
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import {
  buildFinanceTemplateWorkbook,
  computeFinanceDedupeHash,
  computeLegacyFinanceDedupeHash,
  parseFinanceWorkbook,
  parseImportAmount,
  parseImportDate,
} from "./financeImport";

// vi.mock được hoist lên trước các import → financeImport không mở kết nối DB.
vi.mock("@/lib/db", () => ({ db: {} }));

const ACC_CASH = { id: "acc-cash", code: "TM01", name: "Quỹ tiền mặt", currentBalance: "1000000" };
const ACC_CASH2 = { id: "acc-cash2", code: "TM02", name: "Quỹ tiền mặt 2", currentBalance: "0" };
const ACC_EXP = { id: "acc-exp", code: "CT01", name: "TK chi tiêu", currentBalance: "500000" };
const CATS = [
  { id: "cat-out", code: "CHI_KHAC", name: "Chi khác", direction: "OUT" as const },
  { id: "cat-in", code: "THU_KHAC", name: "Thu khác", direction: "IN" as const },
];

function refs(existing: string[] = []) {
  return {
    accounts: [ACC_CASH, ACC_CASH2, ACC_EXP],
    categories: CATS,
    suppliers: [],
    existingHashes: new Set(existing),
  };
}

/** Dựng file xlsx 1 sheet từ mảng dòng (dòng đầu = header). */
async function workbookOf(rows: unknown[][], extraSheets: Array<{ name: string; rows: unknown[][] }> = []) {
  const wb = new ExcelJS.Workbook();
  for (const s of extraSheets) {
    const ws = wb.addWorksheet(s.name);
    s.rows.forEach((r) => ws.addRow(r));
  }
  const ws = wb.addWorksheet("Data");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("TC-22 — parseImportAmount", () => {
  it.each([
    ["1234567.5", 1234567.5],
    ["1.234.567,5", 1234567.5],
    ["1,234,567.5", 1234567.5],
    ["1.500.000", 1500000],
    ["1,500,000", 1500000],
    ["1.500", 1500],
    ["1500000", 1500000],
    ["1.500.000 ₫", 1500000],
    ["2.000.000đ", 2000000],
    ["12,5", 12.5],
  ])("%s → %d", (raw, expected) => {
    expect(parseImportAmount(raw)).toBe(expected);
  });
  it("ô kiểu số giữ nguyên (làm tròn 2 số lẻ)", () => {
    expect(parseImportAmount(1234567.5)).toBe(1234567.5);
    expect(parseImportAmount(10.005)).toBe(10.01);
  });
  it("chuỗi rác / nhóm nghìn sai → null", () => {
    expect(parseImportAmount("abc")).toBeNull();
    expect(parseImportAmount("1.23.456")).toBeNull();
    expect(parseImportAmount("")).toBeNull();
  });
});

describe("TC-22 — parseImportDate", () => {
  it("dd/mm/yyyy hợp lệ", () => {
    expect(parseImportDate("01/09/2026")).toBe("2026-09-01");
    expect(parseImportDate("29/02/2028")).toBe("2028-02-29");
    expect(parseImportDate("2026-09-27")).toBe("2026-09-27");
  });
  it("ngày không có thật bị từ chối (không trôi sang tháng sau)", () => {
    expect(parseImportDate("31/02/2026")).toBeNull();
    expect(parseImportDate("29/02/2026")).toBeNull();
    expect(parseImportDate("31/04/2026")).toBeNull();
    expect(parseImportDate("00/01/2026")).toBeNull();
  });
  it("Date của ExcelJS (nửa đêm UTC) + số serial Excel", () => {
    expect(parseImportDate(new Date(Date.UTC(2026, 8, 1)))).toBe("2026-09-01");
    expect(parseImportDate(46266)).toBe("2026-09-01");
  });
});

describe("TC-23 — computeFinanceDedupeHash", () => {
  const base = {
    accountId: "a",
    transactionDate: "2026-09-01",
    amount: 100000,
    description: "Tiền điện",
  };
  it("khác CHIỀU → khác hash (hash cũ không phân biệt)", () => {
    const hIn = computeFinanceDedupeHash({ ...base, direction: "IN" });
    const hOut = computeFinanceDedupeHash({ ...base, direction: "OUT" });
    expect(hIn).not.toBe(hOut);
  });
  it("khác lần xuất hiện → khác hash", () => {
    const h0 = computeFinanceDedupeHash({ ...base, direction: "OUT", occurrence: 0 });
    const h1 = computeFinanceDedupeHash({ ...base, direction: "OUT", occurrence: 1 });
    expect(h0).not.toBe(h1);
  });
});

describe("TC-04 — import bằng CHÍNH file mẫu của hệ thống", () => {
  it("file mẫu (3 sheet GiaoDich/HuongDan/DanhMuc) đọc được, không báo thiếu cột", async () => {
    const buf = await buildFinanceTemplateWorkbook([ACC_CASH], CATS);
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.headerMismatch).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.rowTotal).toBe(1);
    expect(r.validRows).toHaveLength(1);
    expect(r.validRows[0]!.data).toMatchObject({
      transactionDate: "2026-09-01",
      direction: "OUT",
      accountId: "acc-cash",
      amount: 1500000,
      categoryId: "cat-out",
    });
  });
  it("sheet hướng dẫn đứng TRƯỚC sheet dữ liệu vẫn chọn đúng sheet dữ liệu", async () => {
    const buf = await workbookOf(
      [
        ["Ngày GD", "Loại (Thu/Chi)", "Nguồn", "Số tiền"],
        ["02/09/2026", "Thu", "TM01", "200000"],
      ],
      [{ name: "HuongDan", rows: [["Cột", "Bắt buộc", "Ghi chú"]] }],
    );
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.headerMismatch).toEqual([]);
    expect(r.validRows).toHaveLength(1);
  });
  it("không sheet nào đủ cột → báo đúng cột thiếu", async () => {
    const buf = await workbookOf([["Ngày GD", "Loại (Thu/Chi)", "Số tiền"]]);
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.headerMismatch).toEqual(["Nguồn"]);
  });
  it("file cũ ghi cột 'Tài khoản' vẫn đọc được", async () => {
    const buf = await workbookOf([
      ["Ngày GD", "Loại (Thu/Chi)", "Tài khoản", "Số tiền"],
      ["02/09/2026", "Chi", "CT01", "100000"],
    ]);
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.validRows[0]!.data.accountId).toBe("acc-exp");
  });
});

describe("TC-18 — nguồn phải khớp CHÍNH XÁC", () => {
  it('"Quỹ tiền mặt" khớp đúng TM01, không nhầm "Quỹ tiền mặt 2"; "Quỹ" (mờ) → lỗi', async () => {
    const buf = await workbookOf([
      ["Ngày GD", "Loại (Thu/Chi)", "Nguồn", "Số tiền", "Diễn giải"],
      ["02/09/2026", "Thu", "quy tien mat", "100000", "a"],
      ["02/09/2026", "Thu", "Quỹ tiền mặt 2", "100000", "b"],
      ["02/09/2026", "Thu", "Quỹ", "100000", "c"],
    ]);
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.validRows.map((v) => v.data.accountId)).toEqual(["acc-cash", "acc-cash2"]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.field).toBe("taiKhoan");
  });
  it("nguồn đã ngưng (không có trong refs.accounts) → lỗi", async () => {
    const buf = await workbookOf([
      ["Ngày GD", "Loại (Thu/Chi)", "Nguồn", "Số tiền"],
      ["02/09/2026", "Chi", "OLD01", "100000"],
    ]);
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.validRows).toHaveLength(0);
    expect(r.errors[0]!.reason).toContain("đang hoạt động");
  });
});

describe("TC-23 — dedupe khi import", () => {
  const header = ["Ngày GD", "Loại (Thu/Chi)", "Nguồn", "Số tiền", "Diễn giải"];
  it("2 khoản hợp lệ giống hệt nhau trong 1 file → đều được nhập (không đánh dấu trùng)", async () => {
    const buf = await workbookOf([
      header,
      ["05/09/2026", "Chi", "TM01", "50000", "Nước uống"],
      ["05/09/2026", "Chi", "TM01", "50000", "Nước uống"],
    ]);
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.validRows).toHaveLength(2);
    expect(r.validRows.every((v) => !v.duplicate)).toBe(true);
    expect(r.validRows[0]!.data.dedupeHash).not.toBe(r.validRows[1]!.data.dedupeHash);
  });
  it("cùng số tiền/ngày/diễn giải nhưng khác chiều thu/chi → không bị coi là trùng", async () => {
    const buf = await workbookOf([
      header,
      ["05/09/2026", "Thu", "TM01", "50000", "Hoàn ứng"],
      ["05/09/2026", "Chi", "TM01", "50000", "Hoàn ứng"],
    ]);
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.validRows.filter((v) => v.duplicate)).toHaveLength(0);
  });
  it("nhập lại đúng file đã nhập → mọi dòng là trùng", async () => {
    const buf = await workbookOf([
      header,
      ["05/09/2026", "Chi", "TM01", "50000", "Nước uống"],
      ["05/09/2026", "Chi", "TM01", "50000", "Nước uống"],
    ]);
    const first = await parseFinanceWorkbook(buf, refs());
    const again = await parseFinanceWorkbook(
      buf,
      refs(first.validRows.map((v) => v.data.dedupeHash)),
    );
    expect(again.validRows.every((v) => v.duplicate)).toBe(true);
  });
  it("file đã nhập bằng bản cũ (hash cũ) → lần xuất hiện đầu vẫn coi là trùng", async () => {
    const legacy = computeLegacyFinanceDedupeHash({
      accountId: "acc-cash",
      transactionDate: "2026-09-05",
      amount: 50000,
      description: "Nước uống",
    });
    const buf = await workbookOf([header, ["05/09/2026", "Chi", "TM01", "50000", "Nước uống"]]);
    const r = await parseFinanceWorkbook(buf, refs([legacy]));
    expect(r.validRows[0]!.duplicate).toBe(true);
  });
});

describe("Q7 — import chỉ CẢNH BÁO số dư âm", () => {
  it("chi vượt số dư nguồn vẫn hợp lệ + 1 cảnh báo cho nguồn đó", async () => {
    const buf = await workbookOf([
      ["Ngày GD", "Loại (Thu/Chi)", "Nguồn", "Số tiền", "Diễn giải"],
      ["05/09/2026", "Chi", "CT01", "400000", "a"],
      ["06/09/2026", "Chi", "CT01", "300000", "b"], // 500k - 700k = -200k
      ["07/09/2026", "Chi", "CT01", "100000", "c"],
    ]);
    const r = await parseFinanceWorkbook(buf, refs());
    expect(r.validRows).toHaveLength(3);
    const neg = r.warnings.filter((w) => w.field === "taiKhoan");
    expect(neg).toHaveLength(1);
    expect(neg[0]!.rowNumber).toBe(3);
    expect(neg[0]!.reason).toContain("−200.000 ₫");
  });
});
