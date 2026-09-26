/**
 * V4.1 Đợt 1a (KHO-02) — vitest chia SL tiêu hao lắp ráp qua các bin của lô.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { allocateAcrossBins } from "./assemblies";

describe("allocateAcrossBins", () => {
  it("1 bin đủ → 1 dòng", () => {
    expect(allocateAcrossBins([{ binId: "b1", qty: 10 }], 4)).toEqual([
      { binId: "b1", qty: 4 },
    ]);
  });

  it("lấy bin nhiều hàng trước, tách qua nhiều bin khi cần", () => {
    expect(
      allocateAcrossBins(
        [
          { binId: "b1", qty: 3 },
          { binId: "b2", qty: 5 },
          { binId: "b3", qty: 1 },
        ],
        7,
      ),
    ).toEqual([
      { binId: "b2", qty: 5 },
      { binId: "b1", qty: 2 },
    ]);
  });

  it("bằng nhau thì theo binId cho ổn định", () => {
    expect(
      allocateAcrossBins(
        [
          { binId: "b9", qty: 2 },
          { binId: "b1", qty: 2 },
        ],
        3,
      ),
    ).toEqual([
      { binId: "b1", qty: 2 },
      { binId: "b9", qty: 1 },
    ]);
  });

  it("tổng bin không đủ → null", () => {
    expect(
      allocateAcrossBins(
        [
          { binId: "b1", qty: 2 },
          { binId: "b2", qty: 1 },
        ],
        3.5,
      ),
    ).toBeNull();
    expect(allocateAcrossBins([], 1)).toBeNull();
  });

  it("số thập phân không sai số (0.1 + 0.2)", () => {
    expect(
      allocateAcrossBins(
        [
          { binId: "b1", qty: 0.1 },
          { binId: "b2", qty: 0.2 },
        ],
        0.3,
      ),
    ).toEqual([
      { binId: "b2", qty: 0.2 },
      { binId: "b1", qty: 0.1 },
    ]);
  });

  it("bỏ qua bin tồn 0 / âm", () => {
    expect(
      allocateAcrossBins(
        [
          { binId: "b1", qty: 0 },
          { binId: "b2", qty: -3 },
          { binId: "b3", qty: 2 },
        ],
        2,
      ),
    ).toEqual([{ binId: "b3", qty: 2 }]);
  });
});
