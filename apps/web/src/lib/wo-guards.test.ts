import { describe, expect, it } from "vitest";
import {
  checkPlannedDates,
  checkProgressLoggable,
  checkWoCompletable,
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
