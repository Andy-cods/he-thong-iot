import { describe, expect, it, vi } from "vitest";

// putawaySuggestion.ts import `db` (dùng thật ở suggestPutawayBins) — test này
// chỉ chạm hàm thuần scorePutawayCandidates, mock db theo mẫu receivingEvents.test.ts
// để import module không đòi DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  scorePutawayCandidates,
  type PutawayCandidate,
} from "./putawaySuggestion";

function candidate(overrides: Partial<PutawayCandidate>): PutawayCandidate {
  return {
    binId: "bin-id",
    binFullCode: "A-01-1-01",
    zone: "A",
    isStaging: false,
    capacity: 100,
    currentQty: 0,
    sameItemQty: 0,
    isDefaultBin: false,
    sameZoneCategoryMatch: false,
    sameRackCategoryMatch: false,
    ...overrides,
  };
}

const staging = candidate({
  binId: "staging-id",
  binFullCode: "STAGING/CHO-XEP-KE",
  zone: "STAGING",
  isStaging: true,
  capacity: null,
  currentQty: 0,
});

describe("scorePutawayCandidates", () => {
  it("(a) ưu tiên bin cùng vật tư còn chỗ, sắp theo còn nhiều chỗ trống hơn", () => {
    const a1 = candidate({
      binId: "a1",
      binFullCode: "A-01-1-01",
      sameItemQty: 60,
      currentQty: 60,
      capacity: 100, // remaining 40
    });
    const a2 = candidate({
      binId: "a2",
      binFullCode: "A-01-1-02",
      sameItemQty: 10,
      currentQty: 10,
      capacity: 100, // remaining 90
    });
    const result = scorePutawayCandidates([a1, a2, staging], 5);
    expect(result[0]?.reasonCode).toBe("SAME_ITEM");
    expect(result[0]?.binId).toBe("a2"); // còn nhiều chỗ trống hơn xếp trước
    expect(result[1]?.binId).toBe("a1");
    // fallback vẫn có mặt cuối danh sách
    expect(result.at(-1)?.reasonCode).toBe("STAGING_FALLBACK");
  });

  it("(a) loại bin không đủ chỗ chứa qty yêu cầu", () => {
    const full = candidate({
      binId: "full",
      sameItemQty: 98,
      currentQty: 98,
      capacity: 100, // remaining chỉ còn 2
    });
    const result = scorePutawayCandidates([full, staging], 10);
    expect(result.find((r) => r.binId === "full")).toBeUndefined();
    expect(result[0]?.reasonCode).toBe("STAGING_FALLBACK");
  });

  it("(b) fallback về default_bin_id khi không có bin cùng vật tư", () => {
    const def = candidate({ binId: "def", isDefaultBin: true, currentQty: 5 });
    const other = candidate({ binId: "other", currentQty: 5 });
    const result = scorePutawayCandidates([other, def, staging], 5);
    expect(result[0]?.reasonCode).toBe("DEFAULT_BIN");
    expect(result[0]?.binId).toBe("def");
  });

  it("(c) bin trống cùng khu/nhóm vật tư — ưu tiên cùng kệ trước cùng khu", () => {
    const sameRack = candidate({
      binId: "rack-match",
      sameZoneCategoryMatch: true,
      sameRackCategoryMatch: true,
      currentQty: 0,
    });
    const sameZoneOnly = candidate({
      binId: "zone-match",
      sameZoneCategoryMatch: true,
      sameRackCategoryMatch: false,
      currentQty: 0,
    });
    const result = scorePutawayCandidates([sameZoneOnly, sameRack, staging], 5);
    expect(result[0]?.reasonCode).toBe("SAME_ZONE_CATEGORY");
    expect(result[0]?.binId).toBe("rack-match");
    expect(result[1]?.binId).toBe("zone-match");
  });

  it("(d) không tiêu chí nào khớp → sức chứa còn lại lớn nhất", () => {
    const small = candidate({ binId: "small", currentQty: 80, capacity: 100 }); // remaining 20
    const big = candidate({ binId: "big", currentQty: 10, capacity: 100 }); // remaining 90
    const result = scorePutawayCandidates([small, big, staging], 5);
    expect(result[0]?.reasonCode).toBe("MOST_CAPACITY");
    expect(result[0]?.binId).toBe("big");
    expect(result[1]?.binId).toBe("small");
  });

  it("fallback STAGING_FALLBACK là gợi ý DUY NHẤT khi không có bin nào khớp/đủ chỗ", () => {
    const tooSmall = candidate({ binId: "tiny", currentQty: 99, capacity: 100 });
    const result = scorePutawayCandidates([tooSmall, staging], 50);
    expect(result).toHaveLength(1);
    expect(result[0]?.reasonCode).toBe("STAGING_FALLBACK");
  });

  it("không có bin staging trong candidates → không throw, trả mảng rỗng nếu không tiêu chí nào khớp", () => {
    const result = scorePutawayCandidates([], 5);
    expect(result).toEqual([]);
  });

  describe("phân tán (d) — nhiều bin trống đồng hạng, nhiều vật tư khác nhau", () => {
    // V4.3 — trước đây khi nhiều bin trống CÙNG sức chứa còn lại (không tiêu
    // chí (a)/(b)/(c) nào khớp), sort ổn định luôn trả bin ĐẦU TIÊN theo thứ
    // tự cố định cho MỌI vật tư → dồn hết hàng mới vào 1 ô trống (đúng vấn đề
    // audit WAREHOUSE_UX_AND_FLOW.md mục 4.1). Test này xác nhận đã rải đều.
    const emptyBins = Array.from({ length: 6 }, (_, i) =>
      candidate({
        binId: `empty-${i}`,
        binFullCode: `A-0${i}-1-01`,
        capacity: 100,
        currentQty: 0,
      }),
    );

    it("không truyền itemId → giữ hành vi cũ (luôn bin đầu tiên theo thứ tự)", () => {
      const result = scorePutawayCandidates([...emptyBins, staging], 5);
      expect(result[0]?.binId).toBe("empty-0");
    });

    it("truyền itemId khác nhau → top suggestion rải ra nhiều bin khác nhau", () => {
      const topBinIds = new Set<string>();
      for (let i = 0; i < 12; i++) {
        const result = scorePutawayCandidates(
          [...emptyBins, staging],
          5,
          `item-${i}`,
        );
        expect(result[0]?.reasonCode).toBe("MOST_CAPACITY");
        topBinIds.add(result[0]!.binId);
      }
      // 12 item khác nhau trên 6 bin trống đồng hạng → phải chạm ít nhất vài
      // bin khác nhau (không phải luôn dồn về đúng 1 ô).
      expect(topBinIds.size).toBeGreaterThan(1);
    });

    it("cùng 1 itemId gọi lại nhiều lần → LUÔN ra cùng 1 gợi ý (ổn định, không random)", () => {
      const r1 = scorePutawayCandidates([...emptyBins, staging], 5, "item-fixed");
      const r2 = scorePutawayCandidates([...emptyBins, staging], 5, "item-fixed");
      expect(r1[0]?.binId).toBe(r2[0]?.binId);
    });

    it("bin KHÔNG đồng hạng (capacity khác nhau) vẫn ưu tiên đúng — không bị xoay vòng phá thứ tự", () => {
      const small = candidate({ binId: "small", binFullCode: "A-09-1-01", currentQty: 80, capacity: 100 }); // remaining 20
      const big = candidate({ binId: "big", binFullCode: "A-01-1-01", currentQty: 10, capacity: 100 }); // remaining 90
      const result = scorePutawayCandidates([small, big, staging], 5, "any-item");
      expect(result[0]?.binId).toBe("big");
      expect(result[1]?.binId).toBe("small");
    });
  });
});
