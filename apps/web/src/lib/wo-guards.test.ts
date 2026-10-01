import { describe, expect, it } from "vitest";
import {
  WO_COMPLETE_REASON_MIN_LENGTH,
  checkPlannedDates,
  checkProgressLoggable,
  checkWoCompletable,
  formatWoMaterialShortageLine,
  getWoCompleteShortfall,
  getWoMaterialShortageLines,
  isWoDeletable,
  isWoScannable,
  isWoTransitionAllowed,
  progressAffectsHeader,
} from "./wo-guards";

describe("V4.1 SX-06 — state machine lệnh SX", () => {
  it("DRAFT không bắt đầu thẳng được (phải duyệt)", () => {
    expect(isWoTransitionAllowed("DRAFT", "IN_PROGRESS")).toBe(false);
    expect(isWoTransitionAllowed("DRAFT", "RELEASED")).toBe(true);
    expect(isWoTransitionAllowed("RELEASED", "IN_PROGRESS")).toBe(true);
  });
  it("COMPLETED / CANCELLED là trạng thái cuối", () => {
    expect(isWoTransitionAllowed("COMPLETED", "CANCELLED")).toBe(false);
    expect(isWoTransitionAllowed("CANCELLED", "IN_PROGRESS")).toBe(false);
  });
});

describe("V4.1 SX-04 — checkWoCompletable", () => {
  it("WO 0 dòng, SL đạt = 0 → chặn", () => {
    const r = checkWoCompletable({ status: "IN_PROGRESS", goodQty: "0", lines: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/sản lượng đạt/);
  });
  it("WO 0 dòng, SL đạt > 0 → cho hoàn thành", () => {
    expect(checkWoCompletable({ status: "IN_PROGRESS", goodQty: "5", lines: [] }).ok).toBe(true);
  });
  it("chưa chạy / tạm dừng → chặn", () => {
    expect(checkWoCompletable({ status: "RELEASED", goodQty: 5, lines: [] }).ok).toBe(false);
    expect(checkWoCompletable({ status: "PAUSED", goodQty: 5, lines: [] }).ok).toBe(false);
  });
  it("còn dòng linh kiện chưa đủ → chặn, nêu số dòng", () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: 1,
      lines: [
        { requiredQty: "2", completedQty: "2" },
        { requiredQty: "3", completedQty: "1" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/1 dòng/);
  });
  it("mọi dòng đủ + SL đạt > 0 → OK", () => {
    expect(
      checkWoCompletable({
        status: "IN_PROGRESS",
        goodQty: 1,
        lines: [{ requiredQty: "2.5", completedQty: "2.5" }],
      }).ok,
    ).toBe(true);
  });
});

describe("V4.2 PROD-01 — getWoCompleteShortfall", () => {
  it("good < planned → trả về thông tin thiếu", () => {
    const s = getWoCompleteShortfall({ goodQty: "3", plannedQty: "10" });
    expect(s).toEqual({ good: 3, planned: 10, missing: 7 });
  });
  it("good >= planned → null (không cần xác nhận thêm)", () => {
    expect(getWoCompleteShortfall({ goodQty: "10", plannedQty: "10" })).toBeNull();
    expect(getWoCompleteShortfall({ goodQty: "12", plannedQty: "10" })).toBeNull();
  });
  it("planned rỗng/0 → null (không có kế hoạch để so)", () => {
    expect(getWoCompleteShortfall({ goodQty: "5", plannedQty: null })).toBeNull();
    expect(getWoCompleteShortfall({ goodQty: "5", plannedQty: "0" })).toBeNull();
  });
});

describe("V4.2 PROD-01 — checkWoCompletable + plannedQty/completeReason", () => {
  it("không truyền plannedQty → bỏ qua kiểm tra thiếu SL (backward-compatible)", () => {
    // Giống test SX-04 cũ: good=1 < planned thật (không truyền) vẫn OK.
    expect(
      checkWoCompletable({ status: "IN_PROGRESS", goodQty: 1, lines: [] }).ok,
    ).toBe(true);
  });
  it("good < planned, không có completeReason → chặn, nêu rõ số liệu thiếu", () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: "3",
      plannedQty: "10",
      lines: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Đạt 3 \/ kế hoạch 10/);
      expect(r.reason).toMatch(/thiếu 7/);
    }
  });
  it("good < planned, lý do < 3 ký tự → chặn", () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: "3",
      plannedQty: "10",
      completeReason: "ok",
      lines: [],
    });
    expect(r.ok).toBe(false);
  });
  it(`good < planned, lý do ≥ ${WO_COMPLETE_REASON_MIN_LENGTH} ký tự → OK`, () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: "3",
      plannedQty: "10",
      completeReason: "Thiếu vật tư đầu vào",
      lines: [],
    });
    expect(r.ok).toBe(true);
  });
  it("good >= planned → không cần completeReason (hành vi như cũ)", () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: "10",
      plannedQty: "10",
      lines: [],
    });
    expect(r.ok).toBe(true);
  });
});

describe("V4.5 QA-C P1-1 — getWoMaterialShortageLines", () => {
  it("required > alreadyIssued → liệt kê dòng thiếu", () => {
    const rows = getWoMaterialShortageLines([
      { itemId: "a", sku: "SKU-A", name: "Vật tư A", uom: "PCS", required: 10, alreadyIssued: 4 },
      { itemId: "b", sku: "SKU-B", name: "Vật tư B", uom: "KG", required: 5, alreadyIssued: 5 },
    ]);
    expect(rows).toEqual([
      { itemId: "a", sku: "SKU-A", name: "Vật tư A", uom: "PCS", required: 10, issued: 4, missing: 6 },
    ]);
  });
  it("lệnh không có BOM/vật tư (mảng rỗng) → không thiếu gì", () => {
    expect(getWoMaterialShortageLines([])).toEqual([]);
  });
  it("đã xuất đủ/vượt mọi dòng → mảng rỗng", () => {
    expect(
      getWoMaterialShortageLines([
        { itemId: "a", sku: null, name: "A", uom: null, required: "10", alreadyIssued: "12" },
      ]),
    ).toEqual([]);
  });
  it("formatWoMaterialShortageLine ưu tiên tên, có đơn vị", () => {
    expect(
      formatWoMaterialShortageLine({
        itemId: "a",
        sku: "SKU-A",
        name: "Vật tư A",
        uom: "PCS",
        required: 10,
        issued: 4,
        missing: 6,
      }),
    ).toBe("Vật tư A (thiếu 6 PCS)");
    expect(
      formatWoMaterialShortageLine({
        itemId: "a",
        sku: null,
        name: null,
        uom: null,
        required: 10,
        issued: 4,
        missing: 6,
      }),
    ).toBe("a (thiếu 6)");
  });
});

describe("V4.5 QA-C P1-1 — checkWoCompletable + materialShortage", () => {
  const baseLines: Array<{ requiredQty: number | string; completedQty: number | string }> = [];

  it("có vật tư thiếu, KHÔNG completeReason → chặn, nêu rõ vật tư thiếu (không chặn cứng, chỉ bắt xác nhận)", () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: 5,
      lines: baseLines,
      materialShortage: [
        { itemId: "a", sku: "SKU-A", name: "Vật tư A", uom: "PCS", required: 10, issued: 4, missing: 6 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Vật tư chưa xuất đủ/);
      expect(r.reason).toMatch(/Vật tư A \(thiếu 6 PCS\)/);
    }
  });
  it("có vật tư thiếu, lý do < 3 ký tự → chặn", () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: 5,
      completeReason: "ok",
      lines: baseLines,
      materialShortage: [
        { itemId: "a", sku: null, name: "A", uom: null, required: 10, issued: 0, missing: 10 },
      ],
    });
    expect(r.ok).toBe(false);
  });
  it(`có vật tư thiếu, lý do ≥ ${WO_COMPLETE_REASON_MIN_LENGTH} ký tự → OK (hoàn thành kèm ghi lý do)`, () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: 5,
      completeReason: "Xưởng tự có vật tư ngoài hệ thống",
      lines: baseLines,
      materialShortage: [
        { itemId: "a", sku: null, name: "A", uom: null, required: 10, issued: 0, missing: 10 },
      ],
    });
    expect(r.ok).toBe(true);
  });
  it("không truyền materialShortage → bỏ qua kiểm tra (backward-compatible, lệnh không BOM/vật tư)", () => {
    expect(
      checkWoCompletable({ status: "IN_PROGRESS", goodQty: 5, lines: baseLines }).ok,
    ).toBe(true);
  });
  it("materialShortage rỗng (đã xuất đủ) → không cần lý do", () => {
    expect(
      checkWoCompletable({
        status: "IN_PROGRESS",
        goodQty: 5,
        lines: baseLines,
        materialShortage: [],
      }).ok,
    ).toBe(true);
  });
  it("thiếu CẢ sản lượng lẫn vật tư, lý do hợp lệ → OK, thông báo nêu cả 2", () => {
    const r = checkWoCompletable({
      status: "IN_PROGRESS",
      goodQty: "3",
      plannedQty: "10",
      lines: baseLines,
      materialShortage: [
        { itemId: "a", sku: null, name: "A", uom: null, required: 10, issued: 4, missing: 6 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/Đạt 3 \/ kế hoạch 10/);
      expect(r.reason).toMatch(/Vật tư chưa xuất đủ/);
    }
  });
});

describe("V4.1 SX-12/13/14 — tiến độ", () => {
  it("không ghi gì cho WO đã xong/huỷ", () => {
    for (const status of ["COMPLETED", "CANCELLED"] as const) {
      expect(
        checkProgressLoggable({ status, stepType: "NOTE", qtyCompleted: 0, qtyScrap: 0 }).ok,
      ).toBe(false);
    }
  });
  it("báo SL khi chưa bắt đầu → chặn; ghi chú thì được", () => {
    expect(
      checkProgressLoggable({ status: "RELEASED", stepType: "PROGRESS_REPORT", qtyCompleted: 1, qtyScrap: 0 }).ok,
    ).toBe(false);
    expect(
      checkProgressLoggable({ status: "RELEASED", stepType: "NOTE", qtyCompleted: 0, qtyScrap: 0 }).ok,
    ).toBe(true);
    expect(
      checkProgressLoggable({ status: "IN_PROGRESS", stepType: "PROGRESS_REPORT", qtyCompleted: 1, qtyScrap: 0 }).ok,
    ).toBe(true);
  });
  it("SL đạt WO chỉ cộng khi báo cho thành phẩm (không chọn dòng)", () => {
    expect(progressAffectsHeader({ stepType: "PROGRESS_REPORT", workOrderLineId: null })).toBe(true);
    expect(progressAffectsHeader({ stepType: "PROGRESS_REPORT", workOrderLineId: "x" })).toBe(false);
    expect(progressAffectsHeader({ stepType: "QC_PASS", workOrderLineId: null })).toBe(false);
  });
});

describe("V4.1 SX-07/22 — xoá, quét", () => {
  it("chỉ xoá DRAFT/CANCELLED", () => {
    expect(isWoDeletable("DRAFT")).toBe(true);
    expect(isWoDeletable("CANCELLED")).toBe(true);
    expect(isWoDeletable("IN_PROGRESS")).toBe(false);
    expect(isWoDeletable("COMPLETED")).toBe(false);
  });
  it("chỉ quét lắp ráp khi đã duyệt/đang chạy", () => {
    expect(isWoScannable("IN_PROGRESS")).toBe(true);
    expect(isWoScannable("DRAFT")).toBe(false);
    expect(isWoScannable("PAUSED")).toBe(false);
    expect(isWoScannable("COMPLETED")).toBe(false);
  });
});

describe("V4.1 SX-20 — checkPlannedDates", () => {
  it("kết thúc trước bắt đầu → lỗi", () => {
    expect(checkPlannedDates("2026-10-05", "2026-10-01").ok).toBe(false);
  });
  it("trống / bằng nhau / đúng thứ tự → OK", () => {
    expect(checkPlannedDates(null, null).ok).toBe(true);
    expect(checkPlannedDates("2026-10-01", "2026-10-01").ok).toBe(true);
    expect(checkPlannedDates("2026-10-01", "").ok).toBe(true);
  });
  it("chuỗi rác → lỗi", () => {
    expect(checkPlannedDates("01/10/2026", null).ok).toBe(false);
  });
});
