/**
 * V4.1 Đợt 1a — vitest QC nhập kho: qc_flag phiếu nhập (KHO-15) + state
 * snapshot theo kết quả QC.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { computeReceiptQcFlag, snapshotQcTarget } from "./inboundQc";

describe("computeReceiptQcFlag", () => {
  it("có FAIL → FAIL (kể cả còn PENDING)", () => {
    expect(computeReceiptQcFlag(["PASS", "FAIL", "PENDING"])).toBe("FAIL");
  });

  it("còn PENDING, không FAIL → PENDING", () => {
    expect(computeReceiptQcFlag(["PASS", "PENDING"])).toBe("PENDING");
  });

  it("tất cả PASS → PASS", () => {
    expect(computeReceiptQcFlag(["PASS", "PASS"])).toBe("PASS");
  });

  it("dòng cũ NULL (D3) coi là đạt", () => {
    expect(computeReceiptQcFlag([null, undefined, "PASS"])).toBe("PASS");
    expect(computeReceiptQcFlag([null, "PENDING"])).toBe("PENDING");
  });

  it("phiếu không có dòng → PASS", () => {
    expect(computeReceiptQcFlag([])).toBe("PASS");
  });
});

describe("snapshotQcTarget", () => {
  it("receive: giữ logic cũ", () => {
    expect(snapshotQcTarget("PURCHASING", "PENDING", "receive")).toBe("INBOUND_QC");
    expect(snapshotQcTarget("PLANNED", "PENDING", "receive")).toBeNull();
    expect(snapshotQcTarget("PURCHASING", "PASS", "receive")).toBe("AVAILABLE");
    expect(snapshotQcTarget("INBOUND_QC", "FAIL", "receive")).toBe("PLANNED");
  });

  it("decide: PASS chỉ đẩy dòng chưa tới AVAILABLE, không kéo lùi dòng đã giữ chỗ", () => {
    expect(snapshotQcTarget("INBOUND_QC", "PASS", "decide")).toBe("AVAILABLE");
    expect(snapshotQcTarget("PLANNED", "PASS", "decide")).toBe("AVAILABLE");
    expect(snapshotQcTarget("RESERVED", "PASS", "decide")).toBeNull();
    expect(snapshotQcTarget("ISSUED", "PASS", "decide")).toBeNull();
  });

  it("decide: FAIL chỉ INBOUND_QC → PLANNED", () => {
    expect(snapshotQcTarget("INBOUND_QC", "FAIL", "decide")).toBe("PLANNED");
    expect(snapshotQcTarget("AVAILABLE", "FAIL", "decide")).toBeNull();
  });
});
