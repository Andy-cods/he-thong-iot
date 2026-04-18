import { describe, expect, it } from "vitest";
import {
  BOM_SNAPSHOT_STATES,
  STATE_TRANSITIONS,
  canTransition,
  validTransitionsFrom,
  snapshotTransitionSchema,
  snapshotExplodeSchema,
  type BomSnapshotState,
} from "./snapshot";

describe("BOM_SNAPSHOT_STATES", () => {
  it("có đúng 10 state theo spec V1.2", () => {
    expect(BOM_SNAPSHOT_STATES).toHaveLength(10);
    expect(BOM_SNAPSHOT_STATES).toEqual([
      "PLANNED",
      "PURCHASING",
      "IN_PRODUCTION",
      "INBOUND_QC",
      "PROD_QC",
      "AVAILABLE",
      "RESERVED",
      "ISSUED",
      "ASSEMBLED",
      "CLOSED",
    ]);
  });

  it("CLOSED là final state (no outgoing)", () => {
    expect(STATE_TRANSITIONS.CLOSED).toEqual([]);
  });
});

/**
 * 100-case matrix: cho mọi cặp (from, to) trong 10x10, assert
 * canTransition(from, to) đúng kỳ vọng dựa vào STATE_TRANSITIONS (source of truth).
 * Tổng: 10 self-loop (luôn false) + 90 cross-pair.
 */
describe("canTransition — 10x10 matrix (100 case)", () => {
  it.each(BOM_SNAPSHOT_STATES.flatMap((from) =>
    BOM_SNAPSHOT_STATES.map((to) => [from, to] as const),
  ))(
    "canTransition(%s, %s) khớp STATE_TRANSITIONS",
    (from, to) => {
      const expected = from === to ? false : STATE_TRANSITIONS[from].includes(to);
      expect(canTransition(from, to)).toBe(expected);
    },
  );

  it("tổng số valid edge chính xác 23 (không tính self-loop)", () => {
    let valid = 0;
    for (const from of BOM_SNAPSHOT_STATES) {
      for (const to of BOM_SNAPSHOT_STATES) {
        if (from === to) continue;
        if (canTransition(from, to)) valid++;
      }
    }
    // PLANNED 3 + PURCHASING 3 + IN_PRODUCTION 3 + INBOUND_QC 3 + PROD_QC 3
    // + AVAILABLE 2 + RESERVED 3 + ISSUED 2 + ASSEMBLED 1 + CLOSED 0 = 23
    expect(valid).toBe(23);
  });

  it("tổng số invalid pair (không self-loop) = 90 - 23 = 67", () => {
    let invalid = 0;
    for (const from of BOM_SNAPSHOT_STATES) {
      for (const to of BOM_SNAPSHOT_STATES) {
        if (from === to) continue;
        if (!canTransition(from, to)) invalid++;
      }
    }
    expect(invalid).toBe(67);
  });
});

describe("canTransition — happy path V1.2", () => {
  const happyPath: [BomSnapshotState, BomSnapshotState][] = [
    ["PLANNED", "PURCHASING"],
    ["PURCHASING", "INBOUND_QC"],
    ["INBOUND_QC", "AVAILABLE"],
    ["AVAILABLE", "RESERVED"],
    ["RESERVED", "CLOSED"],
  ];

  it.each(happyPath)("✓ %s → %s hợp lệ", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe("canTransition — happy path V1.3 mở rộng WO", () => {
  const woPath: [BomSnapshotState, BomSnapshotState][] = [
    ["PLANNED", "IN_PRODUCTION"],
    ["IN_PRODUCTION", "PROD_QC"],
    ["PROD_QC", "AVAILABLE"],
    ["RESERVED", "ISSUED"],
    ["ISSUED", "ASSEMBLED"],
    ["ASSEMBLED", "CLOSED"],
  ];

  it.each(woPath)("✓ %s → %s hợp lệ", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe("canTransition — rollback về PLANNED", () => {
  const rollbacks: BomSnapshotState[] = [
    "PURCHASING",
    "IN_PRODUCTION",
    "INBOUND_QC",
    "PROD_QC",
  ];
  it.each(rollbacks)("%s có thể rollback về PLANNED", (from) => {
    expect(canTransition(from, "PLANNED")).toBe(true);
  });

  it("RESERVED rollback về AVAILABLE (release reservation)", () => {
    expect(canTransition("RESERVED", "AVAILABLE")).toBe(true);
  });

  it("AVAILABLE không rollback về PLANNED (đã check QC xong, không tái hoạch định)", () => {
    expect(canTransition("AVAILABLE", "PLANNED")).toBe(false);
  });
});

describe("canTransition — invalid skips", () => {
  const invalid: [BomSnapshotState, BomSnapshotState][] = [
    ["PLANNED", "AVAILABLE"],
    ["PLANNED", "RESERVED"],
    ["PURCHASING", "AVAILABLE"],
    ["PURCHASING", "RESERVED"],
    ["INBOUND_QC", "RESERVED"],
    ["AVAILABLE", "ISSUED"],
    ["AVAILABLE", "ASSEMBLED"],
    ["ISSUED", "RESERVED"],
    ["ISSUED", "AVAILABLE"],
    ["ASSEMBLED", "AVAILABLE"],
  ];
  it.each(invalid)("✗ %s → %s không hợp lệ (skip step)", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe("canTransition — từ CLOSED không đi đâu", () => {
  it.each(BOM_SNAPSHOT_STATES.filter((s) => s !== "CLOSED"))(
    "CLOSED → %s false",
    (to) => {
      expect(canTransition("CLOSED", to)).toBe(false);
    },
  );
});

describe("canTransition — self-loop luôn false", () => {
  it.each(BOM_SNAPSHOT_STATES)("%s → %s self-loop false", (s) => {
    expect(canTransition(s, s)).toBe(false);
  });
});

describe("canTransition — admin override", () => {
  it("admin override: cho mọi transition trừ self-loop và từ CLOSED", () => {
    for (const from of BOM_SNAPSHOT_STATES) {
      for (const to of BOM_SNAPSHOT_STATES) {
        const got = canTransition(from, to, { adminOverride: true });
        if (from === to) {
          expect(got).toBe(false);
        } else if (from === "CLOSED") {
          expect(got).toBe(false);
        } else {
          expect(got).toBe(true);
        }
      }
    }
  });
});

describe("validTransitionsFrom", () => {
  it("default mode: trả STATE_TRANSITIONS[from]", () => {
    expect(validTransitionsFrom("PLANNED")).toEqual([
      "PURCHASING",
      "IN_PRODUCTION",
      "CLOSED",
    ]);
    expect(validTransitionsFrom("CLOSED")).toEqual([]);
  });

  it("adminOverride: trả mọi state trừ self + trừ CLOSED đầu vào", () => {
    const res = validTransitionsFrom("AVAILABLE", { adminOverride: true });
    expect(res).toHaveLength(9);
    expect(res).not.toContain("AVAILABLE");
    expect(res).toContain("PLANNED");
    expect(res).toContain("ISSUED");
  });

  it("adminOverride từ CLOSED vẫn rỗng (CLOSED final tuyệt đối)", () => {
    expect(
      validTransitionsFrom("CLOSED", { adminOverride: true }),
    ).toEqual([]);
  });
});

describe("snapshotTransitionSchema", () => {
  it("parse input hợp lệ", () => {
    const res = snapshotTransitionSchema.parse({
      toState: "PURCHASING",
      actionNote: "Tạo PR",
      versionLock: 3,
    });
    expect(res.toState).toBe("PURCHASING");
    expect(res.adminOverride).toBe(false);
  });

  it("reject actionNote quá ngắn", () => {
    const res = snapshotTransitionSchema.safeParse({
      toState: "PURCHASING",
      actionNote: "ab",
      versionLock: 0,
    });
    expect(res.success).toBe(false);
  });

  it("reject toState không phải enum", () => {
    const res = snapshotTransitionSchema.safeParse({
      toState: "UNKNOWN",
      actionNote: "ok",
      versionLock: 0,
    });
    expect(res.success).toBe(false);
  });

  it("coerce versionLock từ string", () => {
    const res = snapshotTransitionSchema.parse({
      toState: "CLOSED",
      actionNote: "Đóng",
      versionLock: "5",
    });
    expect(res.versionLock).toBe(5);
  });
});

describe("snapshotExplodeSchema", () => {
  it("parse uuid + targetQty > 0", () => {
    const res = snapshotExplodeSchema.parse({
      revisionId: "11111111-1111-1111-1111-111111111111",
      targetQty: 10,
    });
    expect(res.targetQty).toBe(10);
  });

  it("reject targetQty ≤ 0", () => {
    const res = snapshotExplodeSchema.safeParse({
      revisionId: "11111111-1111-1111-1111-111111111111",
      targetQty: 0,
    });
    expect(res.success).toBe(false);
  });

  it("reject revisionId không phải uuid", () => {
    const res = snapshotExplodeSchema.safeParse({
      revisionId: "not-a-uuid",
      targetQty: 10,
    });
    expect(res.success).toBe(false);
  });
});

/**
 * Guard placeholder cho V1.3 — e.g. RESERVED → ISSUED cần WO active.
 * V1.2 stub return true; V1.3 sẽ gọi DB check.
 */
function canIssueWithActiveWO(_lineId: string): boolean {
  // stub V1.2 — real check ở V1.3 (query work_order).
  return true;
}

describe("V1.3 guard placeholder — RESERVED → ISSUED", () => {
  it("stub canIssueWithActiveWO return true (V1.2)", () => {
    expect(canIssueWithActiveWO("any")).toBe(true);
  });

  it("transition rule vẫn cho phép RESERVED → ISSUED (WO check ở tầng repo)", () => {
    expect(canTransition("RESERVED", "ISSUED")).toBe(true);
  });
});
