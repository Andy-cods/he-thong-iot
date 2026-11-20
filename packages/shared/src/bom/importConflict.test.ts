import { describe, expect, it } from "vitest";
import {
  boardProductNameFromBom,
  boardUomForBom,
  describeBomImportOutcome,
  effectiveDuplicateMode,
  hardDeleteBlockedMessage,
  nextFreeBomCode,
  normalizeBoardProductCode,
  replaceBlockedMessage,
  sanitizeNewBomCode,
  sheetBomCode,
  statusAfterReplace,
  trienKhaiTemplateCode,
} from "./importConflict";
import { bomImportCommitSchema } from "../schemas/bom";
import { releaseRevisionSchema } from "../schemas/bomRevision";

describe("mã BOM khi import", () => {
  it("mẫu triển khai lấy mã dự án, fallback TK-<batch>", () => {
    expect(trienKhaiTemplateCode("Z0000002-622582", "abc")).toBe("Z0000002-622582");
    expect(trienKhaiTemplateCode(" z0000002 / 622582 ", "abc")).toBe("Z0000002-622582");
    expect(trienKhaiTemplateCode(null, "1234abcd-ffff")).toBe("TK-1234ABCD");
  });
  it("đường cổ điển lấy tên sheet", () => {
    expect(sheetBomCode("Bản chính thức Z0000002-1")).toBe("B-N-CH-NH-TH-C-Z0000002-1");
    expect(sheetBomCode("A")).toBe("BOM-A");
  });
  it("mã mới người dùng gõ được chuẩn hoá", () => {
    expect(sanitizeNewBomCode(" z0000002-622582 v2 ")).toBe("Z0000002-622582-V2");
    expect(sanitizeNewBomCode("-")).toBeNull();
  });
  it("gợi ý mã trống kế tiếp -V2, -V3…", () => {
    expect(nextFreeBomCode("Z0000002-622582", ["Z0000002-622582"])).toBe("Z0000002-622582-V2");
    expect(nextFreeBomCode("Z0000002-622582", ["z0000002-622582-v2"])).toBe("Z0000002-622582-V3");
    // base đã có -Vn → không thành -V2-V2
    expect(nextFreeBomCode("Z1-V2", ["Z1-V2"])).toBe("Z1-V3");
  });
  it("upsert là alias của replace", () => {
    expect(effectiveDuplicateMode("upsert")).toBe("replace");
    expect(effectiveDuplicateMode(undefined)).toBe("skip");
    expect(effectiveDuplicateMode("new_code")).toBe("new_code");
  });
  it("schema commit nhận replace/new_code + newCode, mặc định skip", () => {
    const base = { selectedSheets: ["S"], mappings: {} };
    expect(bomImportCommitSchema.parse(base).duplicateMode).toBe("skip");
    const r = bomImportCommitSchema.parse({ ...base, duplicateMode: "new_code", newCode: "X-V2" });
    expect(r.duplicateMode).toBe("new_code");
    expect(r.newCode).toBe("X-V2");
    expect(bomImportCommitSchema.safeParse({ ...base, duplicateMode: "xoa" }).success).toBe(false);
  });
});

describe("Bảng sản xuất — mã/tên/ĐVT từ BOM", () => {
  it.each([
    ["Z0000002-622582", "Z0000002-622582"],
    ["Z0000002-618823-BOM", "Z0000002-618823"],
    ["Z0000002-618841-BOM-TRI-N-KHAI", "Z0000002-618841"],
    ["z0000002-618824-sl1", "Z0000002-618824"],
    ["TK-1234ABCD", "TK-1234ABCD"],
    ["  bom-abc ", "BOM-ABC"],
  ])("%s → %s", (input, out) => {
    expect(normalizeBoardProductCode(input)).toBe(out);
  });

  it("bỏ tiền tố BOM TRIỂN KHAI / mã", () => {
    expect(boardProductNameFromBom("BOM TRIỂN KHAI — Khung đỡ motor", "Z1")).toBe("Khung đỡ motor");
    expect(boardProductNameFromBom("bom triển khai - Z0000002-622582 Bàn gá", "Z0000002-622582")).toBe("Bàn gá");
    expect(boardProductNameFromBom("Z0000002-618823-BOM: Jig hàn", "Z0000002-618823-BOM")).toBe("Jig hàn");
    expect(boardProductNameFromBom("Jig kiểm tra", "Z1")).toBe("Jig kiểm tra");
    // Chỉ có mã → giữ nguyên tên gốc
    expect(boardProductNameFromBom("Z0000002-618823", "Z0000002-618823")).toBe("Z0000002-618823");
    expect(boardProductNameFromBom("", "Z9")).toBe("Z9");
  });

  it("ĐVT: BOM triển khai = Bộ, còn lại Pcs", () => {
    expect(boardUomForBom({ template: "TRIEN_KHAI" })).toBe("Bộ");
    expect(boardUomForBom({})).toBe("Pcs");
    expect(boardUomForBom(null)).toBe("Pcs");
  });
});

describe("kết quả import & chặn ghi đè", () => {
  it("câu kết quả nói rõ việc đã làm", () => {
    expect(
      describeBomImportOutcome({
        action: "replaced",
        templateId: "t",
        templateCode: "Z0000002-622582",
        linesWritten: 63,
        linesRemoved: 58,
        backupRevisionNo: "R02",
        previousStatus: "OBSOLETE",
        newStatus: "DRAFT",
      }),
    ).toBe(
      "Đã thay 63 dòng của BOM Z0000002-622582 (bản cũ 58 dòng đã lưu ở phiên bản R02). Trạng thái: Ngừng dùng → Nháp.",
    );
    expect(
      describeBomImportOutcome({ action: "skipped", templateId: "t", templateCode: "X", linesWritten: 0, reason: "mã đã tồn tại" }),
    ).toContain("không ghi dòng nào");
    expect(
      describeBomImportOutcome({ action: "new_code", templateId: "t", templateCode: "X-V2", linesWritten: 5, conflictCode: "X" }),
    ).toBe("Đã tạo BOM mới X-V2 với 5 dòng — BOM X giữ nguyên.");
  });

  it("chặn ghi đè khi dòng có tham chiếu sản xuất", () => {
    expect(replaceBlockedMessage("X", [{ kind: "stage_move", count: 0 }])).toBeNull();
    const m = replaceBlockedMessage("X", [
      { kind: "stage_move", count: 4 },
      { kind: "delivery_slip_line", count: 0 },
      { kind: "work_order", count: 1 },
    ]);
    expect(m).toContain("4 bút toán tiến độ");
    expect(m).toContain("1 lệnh sản xuất");
    expect(m).not.toContain("phiếu giao");
    expect(m).toContain("Tạo BOM mới với mã khác");
    expect(hardDeleteBlockedMessage("X", [{ kind: "sales_order", count: 2 }])).toContain("2 đơn hàng");
  });

  it("trạng thái sau ghi đè: Ngừng dùng → Nháp, còn lại giữ", () => {
    expect(statusAfterReplace("OBSOLETE")).toBe("DRAFT");
    expect(statusAfterReplace("ACTIVE")).toBe("ACTIVE");
    expect(statusAfterReplace("DRAFT")).toBe("DRAFT");
  });

  it("schema kích hoạt nhận thông tin board tuỳ chọn", () => {
    expect(releaseRevisionSchema.parse({}).board).toBeUndefined();
    expect(releaseRevisionSchema.parse({ board: { deadline: "2026-12-01", rfqNo: "QT1" } }).board?.deadline).toBe("2026-12-01");
    expect(releaseRevisionSchema.safeParse({ board: { deadline: "01/12/2026" } }).success).toBe(false);
  });
});
