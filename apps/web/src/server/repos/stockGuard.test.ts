/**
 * V4.1 Đợt 1a — vitest cho guard xuất kho dùng chung (`evaluateIssuable`,
 * `mapDbGuardError`). Hàm thuần — không cần DB.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  StockGuardError,
  evaluateIssuable,
  mapDbGuardError,
  type EvaluateIssuableInput,
} from "./stockGuard";

const ITEM = "11111111-1111-1111-1111-111111111111";
const ITEM2 = "22222222-2222-2222-2222-222222222222";
const LOT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LOT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BIN_1 = "b1b1b1b1-0000-0000-0000-000000000001";
const BIN_2 = "b2b2b2b2-0000-0000-0000-000000000002";

function base(over: Partial<EvaluateIssuableInput> = {}): EvaluateIssuableInput {
  return {
    picks: [{ itemId: ITEM, lotSerialId: LOT_A, binId: BIN_1, qty: 5 }],
    lots: [
      { id: LOT_A, itemId: ITEM, status: "AVAILABLE", holdCode: null, lotCode: "LOT-A" },
      { id: LOT_B, itemId: ITEM, status: "AVAILABLE", holdCode: null, lotCode: "LOT-B" },
    ],
    binStock: [
      { binId: BIN_1, lotSerialId: LOT_A, qty: 10 },
      { binId: BIN_2, lotSerialId: LOT_A, qty: 4 },
      { binId: BIN_1, lotSerialId: LOT_B, qty: 3 },
    ],
    lotStock: [
      { lotSerialId: LOT_A, onHand: 14, reserved: 0 },
      { lotSerialId: LOT_B, onHand: 3, reserved: 0 },
    ],
    ...over,
  };
}

describe("evaluateIssuable", () => {
  it("lượt xuất hợp lệ → null", () => {
    expect(evaluateIssuable(base())).toBeNull();
  });

  it("lô HOLD chờ QC → LOT_NOT_AVAILABLE, message nói rõ chờ QC", () => {
    const err = evaluateIssuable(
      base({
        lots: [{ id: LOT_A, itemId: ITEM, status: "HOLD", holdCode: "QC_PENDING", lotCode: "LOT-A" }],
      }),
    );
    expect(err).toBeInstanceOf(StockGuardError);
    expect(err?.code).toBe("LOT_NOT_AVAILABLE");
    expect(err?.status).toBe(409);
    expect(err?.message).toContain("chờ QC");
  });

  it("lô CONSUMED / QC_FAIL cũng bị chặn", () => {
    expect(
      evaluateIssuable(
        base({ lots: [{ id: LOT_A, itemId: ITEM, status: "CONSUMED", holdCode: null }] }),
      )?.code,
    ).toBe("LOT_NOT_AVAILABLE");
    expect(
      evaluateIssuable(
        base({ lots: [{ id: LOT_A, itemId: ITEM, status: "HOLD", holdCode: "QC_FAIL" }] }),
      )?.message,
    ).toContain("QC không đạt");
  });

  it("allowStatuses ['AVAILABLE','HOLD'] (admin rút hàng hỏng) → cho qua lô HOLD", () => {
    expect(
      evaluateIssuable(
        base({
          lots: [{ id: LOT_A, itemId: ITEM, status: "HOLD", holdCode: "QC_FAIL" }],
          allowStatuses: ["AVAILABLE", "HOLD"],
        }),
      ),
    ).toBeNull();
  });

  it("lô không tồn tại → LOT_NOT_FOUND", () => {
    expect(evaluateIssuable(base({ lots: [] }))?.code).toBe("LOT_NOT_FOUND");
  });

  it("lô thuộc mã hàng khác → ITEM_MISMATCH", () => {
    expect(
      evaluateIssuable(
        base({ picks: [{ itemId: ITEM2, lotSerialId: LOT_A, binId: BIN_1, qty: 1 }] }),
      )?.code,
    ).toBe("ITEM_MISMATCH");
  });

  it("SL <= 0 → INVALID_QTY 400", () => {
    const err = evaluateIssuable(
      base({ picks: [{ itemId: ITEM, lotSerialId: LOT_A, binId: BIN_1, qty: 0 }] }),
    );
    expect(err?.code).toBe("INVALID_QTY");
    expect(err?.status).toBe(400);
  });

  it("CỘNG DỒN nhiều pick cùng (bin, lô) vượt tồn bin → INSUFFICIENT_BIN", () => {
    const err = evaluateIssuable(
      base({
        picks: [
          { itemId: ITEM, lotSerialId: LOT_A, binId: BIN_1, qty: 6 },
          { itemId: ITEM, lotSerialId: LOT_A, binId: BIN_1, qty: 5 },
        ],
      }),
    );
    expect(err?.code).toBe("INSUFFICIENT_BIN");
  });

  it("pick ở bin không chứa lô → INSUFFICIENT_BIN", () => {
    expect(
      evaluateIssuable(
        base({ picks: [{ itemId: ITEM, lotSerialId: LOT_B, binId: BIN_2, qty: 1 }] }),
      )?.code,
    ).toBe("INSUFFICIENT_BIN");
  });

  it("đủ tồn bin nhưng lấn phần đã giữ chỗ cho lệnh SX → INSUFFICIENT_FREE", () => {
    const err = evaluateIssuable(
      base({
        picks: [{ itemId: ITEM, lotSerialId: LOT_A, binId: BIN_1, qty: 10 }],
        lotStock: [{ lotSerialId: LOT_A, onHand: 14, reserved: 6 }],
      }),
    );
    expect(err?.code).toBe("INSUFFICIENT_FREE");
    expect(err?.message).toContain("giữ chỗ");
  });

  it("ownReservations (lắp ráp tiêu hao giữ chỗ của chính nó) được cộng lại", () => {
    const input = base({
      picks: [{ itemId: ITEM, lotSerialId: LOT_A, binId: BIN_1, qty: 10 }],
      lotStock: [{ lotSerialId: LOT_A, onHand: 14, reserved: 6 }],
    });
    expect(
      evaluateIssuable({ ...input, ownReservations: [{ lotSerialId: LOT_A, qty: 6 }] }),
    ).toBeNull();
    // Giữ chỗ riêng khai lớn hơn giữ chỗ thực tế không làm "phình" tồn:
    // vẫn không xuất quá on_hand của lô.
    expect(
      evaluateIssuable({
        ...input,
        picks: [
          { itemId: ITEM, lotSerialId: LOT_A, binId: BIN_1, qty: 10 },
          { itemId: ITEM, lotSerialId: LOT_A, binId: BIN_2, qty: 4 },
        ],
        lotStock: [{ lotSerialId: LOT_A, onHand: 12, reserved: 6 }],
        ownReservations: [{ lotSerialId: LOT_A, qty: 100 }],
      })?.code,
    ).toBe("INSUFFICIENT_FREE");
  });

  it("tồn bin còn (legacy) nhưng ledger lô đã hết → INSUFFICIENT_FREE", () => {
    expect(
      evaluateIssuable(
        base({ lotStock: [{ lotSerialId: LOT_A, onHand: 2, reserved: 0 }] }),
      )?.code,
    ).toBe("INSUFFICIENT_FREE");
  });
});

describe("mapDbGuardError", () => {
  it("lỗi trigger LOT_NOT_ISSUABLE → LOT_NOT_AVAILABLE 409", () => {
    const g = mapDbGuardError(
      new Error("LOT_NOT_ISSUABLE: lô abc đang HOLD, không được xuất"),
    );
    expect(g?.code).toBe("LOT_NOT_AVAILABLE");
    expect(g?.status).toBe(409);
  });

  it("lỗi bọc trong cause cũng nhận ra", () => {
    const g = mapDbGuardError({
      message: "Failed query",
      cause: { message: "LOT_NOT_ISSUABLE: x", code: "P0001" },
    });
    expect(g?.code).toBe("LOT_NOT_AVAILABLE");
  });

  it("lock_timeout 55P03 → LOCK_BUSY", () => {
    const e = Object.assign(new Error("canceling statement due to lock timeout"), {
      code: "55P03",
    });
    expect(mapDbGuardError(e)?.code).toBe("LOCK_BUSY");
  });

  it("StockGuardError giữ nguyên; lỗi khác → null", () => {
    const orig = new StockGuardError("INSUFFICIENT_BIN", "x");
    expect(mapDbGuardError(orig)).toBe(orig);
    expect(mapDbGuardError(new Error("boom"))).toBeNull();
    expect(mapDbGuardError(null)).toBeNull();
  });
});
