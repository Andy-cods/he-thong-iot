import { describe, expect, it } from "vitest";
import {
  BOARD_QTY_MAX,
  BOARD_QTY_MAX_MESSAGE,
  BOARD_UNIT_PRICE_MAX,
  BOARD_UNIT_PRICE_MAX_MESSAGE,
  canSeeOrderValue,
  findDuplicateBoardItem,
  isSameBoardItemIdentity,
} from "./production-board-policy";

/**
 * V4.4.2 — Việc 2: hàm quyền DUY NHẤT quyết định ai thấy/nhập đơn giá bán +
 * "Giá trị" mã hàng Bảng sản xuất. Dùng cả server (lọc field JSON) lẫn client
 * (ẩn/hiện ô nhập) — test ở đây đảm bảo đúng ĐÚNG 3 vai: admin/accountant/purchaser.
 */
describe("canSeeOrderValue", () => {
  it("admin/accountant/purchaser thấy giá", () => {
    expect(canSeeOrderValue(["admin"])).toBe(true);
    expect(canSeeOrderValue(["accountant"])).toBe(true);
    expect(canSeeOrderValue(["purchaser"])).toBe(true);
  });

  it("qc/planner/operator/warehouse/shareholder/display KHÔNG thấy giá", () => {
    expect(canSeeOrderValue(["qc"])).toBe(false);
    expect(canSeeOrderValue(["planner"])).toBe(false);
    expect(canSeeOrderValue(["operator"])).toBe(false);
    expect(canSeeOrderValue(["warehouse"])).toBe(false);
    expect(canSeeOrderValue(["shareholder"])).toBe(false);
    expect(canSeeOrderValue(["display"])).toBe(false);
  });

  it("nhiều vai, chỉ cần 1 vai được phép (OR)", () => {
    expect(canSeeOrderValue(["qc", "purchaser"])).toBe(true);
    expect(canSeeOrderValue(["qc", "warehouse"])).toBe(false);
  });

  it("rỗng/null/undefined → false", () => {
    expect(canSeeOrderValue([])).toBe(false);
    expect(canSeeOrderValue(null)).toBe(false);
    expect(canSeeOrderValue(undefined)).toBe(false);
  });
});

/** V4.5 QA-C P2-1/QA-D P1-01 — giới hạn hợp lý đơn giá/SL Bảng sản xuất. */
describe("BOARD_UNIT_PRICE_MAX / BOARD_QTY_MAX", () => {
  it("giá trị đúng theo yêu cầu nghiệp vụ (10 tỷ ₫ / 10 triệu đơn vị)", () => {
    expect(BOARD_UNIT_PRICE_MAX).toBe(10_000_000_000);
    expect(BOARD_QTY_MAX).toBe(10_000_000);
  });

  it("thông báo tiếng Việt chứa đúng con số giới hạn", () => {
    expect(BOARD_UNIT_PRICE_MAX_MESSAGE).toMatch(/10\.000\.000\.000/);
    expect(BOARD_QTY_MAX_MESSAGE).toMatch(/10\.000\.000/);
  });
});

/** V4.5 QA-C P2-2 — mã hàng Bảng sản xuất trùng productCode + rfqNo. */
describe("isSameBoardItemIdentity / findDuplicateBoardItem", () => {
  it("cùng productCode + cùng rfqNo → trùng", () => {
    expect(
      isSameBoardItemIdentity(
        { productCode: "Z0000002-259491", rfqNo: "RFQ-01" },
        { productCode: "Z0000002-259491", rfqNo: "RFQ-01" },
      ),
    ).toBe(true);
  });

  it("cùng productCode, rfqNo khác nhau → KHÔNG trùng (2 đơn hàng khác nhau)", () => {
    expect(
      isSameBoardItemIdentity(
        { productCode: "Z0000002-259491", rfqNo: "RFQ-01" },
        { productCode: "Z0000002-259491", rfqNo: "RFQ-02" },
      ),
    ).toBe(false);
  });

  it("rfqNo rỗng/null coi là cùng 1 giá trị 'không có RFQ'", () => {
    expect(
      isSameBoardItemIdentity(
        { productCode: "ABC", rfqNo: null },
        { productCode: "ABC", rfqNo: "" },
      ),
    ).toBe(true);
    expect(
      isSameBoardItemIdentity(
        { productCode: "ABC", rfqNo: "   " },
        { productCode: "ABC", rfqNo: null },
      ),
    ).toBe(true);
  });

  it("productCode khác nhau → KHÔNG trùng dù cùng rfqNo", () => {
    expect(
      isSameBoardItemIdentity(
        { productCode: "ABC", rfqNo: "RFQ-01" },
        { productCode: "XYZ", rfqNo: "RFQ-01" },
      ),
    ).toBe(false);
  });

  it("so khớp Y HỆT sau trim (không bỏ dấu/fuzzy — mã hàng là code)", () => {
    expect(
      isSameBoardItemIdentity(
        { productCode: "  ABC  ", rfqNo: null },
        { productCode: "ABC", rfqNo: null },
      ),
    ).toBe(true);
    expect(
      isSameBoardItemIdentity(
        { productCode: "abc", rfqNo: null },
        { productCode: "ABC", rfqNo: null },
      ),
    ).toBe(false); // case-sensitive, cố ý — productCode nội bộ không chuẩn hoá hoa/thường.
  });

  it("findDuplicateBoardItem trả về đúng ứng viên trùng đầu tiên, null nếu không có", () => {
    const candidates = [
      { id: "1", productCode: "ABC", rfqNo: "RFQ-01" },
      { id: "2", productCode: "ABC", rfqNo: "RFQ-02" },
    ];
    expect(findDuplicateBoardItem({ productCode: "ABC", rfqNo: "RFQ-02" }, candidates)?.id).toBe(
      "2",
    );
    expect(findDuplicateBoardItem({ productCode: "ABC", rfqNo: "RFQ-99" }, candidates)).toBeNull();
  });
});
