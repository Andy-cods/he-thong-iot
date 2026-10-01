import { describe, expect, it } from "vitest";
import { buildBomEditWoWarning } from "./bom-wo-warning";

describe("TASK-6VIEC Việc 5 — buildBomEditWoWarning", () => {
  it("không có lệnh SX nào → null (không cảnh báo)", () => {
    expect(buildBomEditWoWarning({ count: 0, wos: [] })).toBeNull();
  });

  it("liệt kê đủ mã lệnh khi ≤ 5 lệnh", () => {
    const msg = buildBomEditWoWarning({
      count: 2,
      wos: [{ woNo: "WO-2609-0001" }, { woNo: "WO-2609-0002" }],
    });
    expect(msg).toBe(
      "Đang có 2 lệnh SX dùng BOM này: WO-2609-0001, WO-2609-0002. Vẫn tiếp tục?",
    );
  });

  it("gộp 'và N lệnh khác' khi > 5 lệnh", () => {
    const wos = Array.from({ length: 8 }, (_, i) => ({
      woNo: `WO-00${i + 1}`,
    }));
    const msg = buildBomEditWoWarning({ count: 8, wos });
    expect(msg).toBe(
      "Đang có 8 lệnh SX dùng BOM này: WO-001, WO-002, WO-003, WO-004, WO-005 và 3 lệnh khác. Vẫn tiếp tục?",
    );
  });

  it("count > 0 nhưng wos rỗng (list bị cắt hết ở server) vẫn ra câu hợp lệ", () => {
    const msg = buildBomEditWoWarning({ count: 3, wos: [] });
    expect(msg).toBe("Đang có 3 lệnh SX dùng BOM này: 3 lệnh. Vẫn tiếp tục?");
  });
});
