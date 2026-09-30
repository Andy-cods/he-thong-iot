import { describe, expect, it, vi } from "vitest";

// defaultBinSuggestion.ts import `db` (dùng thật ở các hàm chạm DB) — test này
// chỉ chạm hàm THUẦN `computeDefaultBinSuggestion`, mock db theo mẫu
// putawaySuggestion.test.ts để import module không đòi DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

import { computeDefaultBinSuggestion, type ItemBinQty } from "./defaultBinSuggestion";

describe("computeDefaultBinSuggestion", () => {
  it("không có tồn nào → null", () => {
    expect(computeDefaultBinSuggestion([])).toBeNull();
  });

  it("chỉ ở đúng 1 bin (100%) → đề xuất bin đó", () => {
    const rows: ItemBinQty[] = [{ binId: "b1", binFullCode: "A-01-1-01", qty: 50 }];
    const r = computeDefaultBinSuggestion(rows);
    expect(r?.binId).toBe("b1");
    expect(r?.share).toBe(1);
    expect(r?.totalQty).toBe(50);
  });

  it("1 bin chiếm ≥ 80% tổng tồn → đề xuất bin đó", () => {
    const rows: ItemBinQty[] = [
      { binId: "main", binFullCode: "A-01-1-01", qty: 85 },
      { binId: "other", binFullCode: "A-02-1-01", qty: 15 },
    ];
    const r = computeDefaultBinSuggestion(rows);
    expect(r?.binId).toBe("main");
    expect(r?.share).toBeCloseTo(0.85, 4);
  });

  it("tồn dàn trải, không bin nào ≥ 80% → null (không đề xuất sai)", () => {
    const rows: ItemBinQty[] = [
      { binId: "a", binFullCode: "A-01-1-01", qty: 40 },
      { binId: "b", binFullCode: "A-02-1-01", qty: 35 },
      { binId: "c", binFullCode: "A-03-1-01", qty: 25 },
    ];
    expect(computeDefaultBinSuggestion(rows)).toBeNull();
  });

  it("bin có qty=0 bị loại khỏi tính toán (không tính vào mẫu số)", () => {
    const rows: ItemBinQty[] = [
      { binId: "a", binFullCode: "A-01-1-01", qty: 30 },
      { binId: "zero", binFullCode: "A-02-1-01", qty: 0 },
    ];
    const r = computeDefaultBinSuggestion(rows);
    expect(r?.binId).toBe("a");
    expect(r?.share).toBe(1);
  });

  it("đúng ngưỡng biên 80% → vẫn đề xuất (>=)", () => {
    const rows: ItemBinQty[] = [
      { binId: "main", binFullCode: "A-01-1-01", qty: 80 },
      { binId: "other", binFullCode: "A-02-1-01", qty: 20 },
    ];
    const r = computeDefaultBinSuggestion(rows);
    expect(r?.binId).toBe("main");
  });
});
