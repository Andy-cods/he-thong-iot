/**
 * V4.1 Đợt 1b — vitest phiếu xuất kho (Q3/KHO-04).
 *
 *  - Hàm thuần: `validateMrIssue` (không giao vượt, dòng phải thuộc phiếu,
 *    item lấy từ dòng phiếu), `computeMrStatusAfterIssue`.
 *  - Luồng `issueMaterialRequest` chạy LOGIC THẬT trên FakeDb in-memory (mẫu
 *    finance.test.ts): giao 2 lần → PARTIAL rồi DELIVERED, cộng delivered_qty,
 *    sinh 2 phiếu PX + dòng ↔ txn, không ghi đè pickedBy, lần 3 bị chặn.
 *    stockGuard (khoá + kiểm tồn thật ở DB) và genDocNo được mock — phần SQL
 *    kiểm bằng smoke script `plans/v4.1-audit-hoan-thien/sql/dot1b_smoke.sql`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/* ───────────────────────────── Hàm thuần ───────────────────────────── */

describe("validateMrIssue + computeMrStatusAfterIssue (thuần)", () => {
  async function load() {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ db: {} }));
    return import("./goodsIssues");
  }

  const mrLines = [
    { id: "l1", lineNo: 1, itemId: "item-A", itemSku: "A-01", requestedQty: 10, deliveredQty: 4 },
    { id: "l2", lineNo: 2, itemId: "item-B", itemSku: "B-01", requestedQty: 5, deliveredQty: 5 },
  ];

  it("hợp lệ: item lấy từ dòng phiếu, cộng dồn theo dòng", async () => {
    const { validateMrIssue } = await load();
    const r = validateMrIssue(mrLines, [
      {
        materialRequestLineId: "l1",
        picks: [
          { lotSerialId: "lot-1", binId: "bin-1", qty: 2 },
          { lotSerialId: "lot-2", binId: "bin-2", qty: 4 },
        ],
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.picks).toHaveLength(2);
    expect(r.picks.every((p) => p.itemId === "item-A")).toBe(true);
    expect(r.picks.every((p) => p.materialRequestLineId === "l1")).toBe(true);
    expect(r.issuedByLine.get("l1")).toBe(6);
  });

  it("giao vượt SL còn lại → OVER_ISSUE (409)", async () => {
    const { validateMrIssue } = await load();
    const r = validateMrIssue(mrLines, [
      { materialRequestLineId: "l1", picks: [{ lotSerialId: "x", binId: "b", qty: 6.5 }] },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("OVER_ISSUE");
    expect(r.error.status).toBe(409);
    expect(r.error.message).toContain("A-01");
  });

  it("vượt khi cộng dồn nhiều pick cùng dòng → OVER_ISSUE", async () => {
    const { validateMrIssue } = await load();
    const r = validateMrIssue(mrLines, [
      { materialRequestLineId: "l1", picks: [{ lotSerialId: "x", binId: "b", qty: 3 }] },
      { materialRequestLineId: "l1", picks: [{ lotSerialId: "y", binId: "b", qty: 3.5 }] },
    ]);
    expect(r.ok).toBe(false);
  });

  it("dòng đã giao đủ → OVER_ISSUE 'đã giao đủ'", async () => {
    const { validateMrIssue } = await load();
    const r = validateMrIssue(mrLines, [
      { materialRequestLineId: "l2", picks: [{ lotSerialId: "x", binId: "b", qty: 1 }] },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain("đã giao đủ");
  });

  it("dòng không thuộc phiếu → LINE_NOT_IN_REQUEST (400)", async () => {
    const { validateMrIssue } = await load();
    const r = validateMrIssue(mrLines, [
      { materialRequestLineId: "khac", picks: [{ lotSerialId: "x", binId: "b", qty: 1 }] },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("LINE_NOT_IN_REQUEST");
    expect(r.error.status).toBe(400);
  });

  it("SL ≤ 0 → INVALID_QTY; không có pick → EMPTY_ISSUE", async () => {
    const { validateMrIssue } = await load();
    const a = validateMrIssue(mrLines, [
      { materialRequestLineId: "l1", picks: [{ lotSerialId: "x", binId: "b", qty: 0 }] },
    ]);
    expect(a.ok ? null : a.error.code).toBe("INVALID_QTY");
    const b = validateMrIssue(mrLines, []);
    expect(b.ok ? null : b.error.code).toBe("EMPTY_ISSUE");
  });

  it("đúng bằng SL còn lại (sai số thập phân) vẫn hợp lệ", async () => {
    const { validateMrIssue } = await load();
    const r = validateMrIssue(
      [{ id: "l1", itemId: "i", requestedQty: 0.3, deliveredQty: 0.1 }],
      [
        {
          materialRequestLineId: "l1",
          picks: [
            { lotSerialId: "x", binId: "b", qty: 0.1 },
            { lotSerialId: "y", binId: "b", qty: 0.1 },
          ],
        },
      ],
    );
    expect(r.ok).toBe(true);
  });

  it("computeMrStatusAfterIssue: đủ mọi dòng → DELIVERED, thiếu → PARTIAL", async () => {
    const { computeMrStatusAfterIssue } = await load();
    expect(
      computeMrStatusAfterIssue([
        { requestedQty: 10, deliveredQty: 10 },
        { requestedQty: 5, deliveredQty: 5 },
      ]),
    ).toBe("DELIVERED");
    expect(
      computeMrStatusAfterIssue([
        { requestedQty: 10, deliveredQty: 6 },
        { requestedQty: 5, deliveredQty: 5 },
      ]),
    ).toBe("PARTIAL");
    expect(computeMrStatusAfterIssue([{ requestedQty: 0.3, deliveredQty: 0.30000000001 }])).toBe(
      "DELIVERED",
    );
    expect(computeMrStatusAfterIssue([])).toBe("PARTIAL");
  });
});

/* ───────────────────────── FakeDb — luồng giao 2 lần ───────────────────────── */

type Row = Record<string, unknown>;

interface Tables {
  materialRequest: Row[];
  materialRequestLine: Row[];
  goodsIssue: Row[];
  goodsIssueLine: Row[];
  seq: number;
}

function createFakeDb(
  t: Tables,
  named: Record<keyof Omit<Tables, "seq">, unknown>,
  schema: Record<string, unknown>,
) {
  function arr(table: unknown): Row[] {
    for (const [k, v] of Object.entries(named)) {
      if (v === table) return t[k as keyof Omit<Tables, "seq">];
    }
    throw new Error("FakeDb: bảng không hỗ trợ");
  }
  function keyFor(col: unknown): string | null {
    for (const table of Object.values(schema)) {
      if (!table || typeof table !== "object") continue;
      for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
        if (v === col) return k;
      }
    }
    return null;
  }

  function select(cols?: Record<string, unknown>) {
    let src: unknown;
    let pred: ((r: Row) => boolean) | null = null;
    const run = () => {
      const rows = arr(src).filter((r) => (pred ? pred(r) : true));
      if (!cols) return rows.map((r) => ({ ...r }));
      return rows.map((r) => {
        const o: Row = {};
        for (const [alias, col] of Object.entries(cols)) o[alias] = r[keyFor(col) ?? alias];
        return o;
      });
    };
    const b = {
      from(table: unknown) {
        src = table;
        return b;
      },
      where(p: ((r: Row) => boolean) | undefined) {
        pred = p ?? null;
        return b;
      },
      for() {
        return b;
      },
      orderBy() {
        return b;
      },
      limit(n: number) {
        return Promise.resolve(run().slice(0, n));
      },
      then(resolve: (rows: Row[]) => void) {
        resolve(run());
      },
    };
    return b;
  }

  function insert(table: unknown) {
    let vals: Row[] = [];
    const doInsert = () => {
      const inserted = vals.map((v) => ({ id: `id-${++t.seq}`, ...v }));
      arr(table).push(...inserted);
      return inserted;
    };
    const b = {
      values(v: Row | Row[]) {
        vals = Array.isArray(v) ? v : [v];
        return b;
      },
      returning() {
        return Promise.resolve(doInsert());
      },
      then(resolve: (v: undefined) => void) {
        doInsert();
        resolve(undefined);
      },
    };
    return b;
  }

  function update(table: unknown) {
    let patch: Row = {};
    let pred: ((r: Row) => boolean) | null = null;
    const apply = () => {
      const hit: Row[] = [];
      for (const r of arr(table)) {
        if (!pred || pred(r)) {
          Object.assign(r, patch);
          hit.push(r);
        }
      }
      return hit;
    };
    const b = {
      set(p: Row) {
        patch = p;
        return b;
      },
      where(p: ((r: Row) => boolean) | undefined) {
        pred = p ?? null;
        return b;
      },
      returning() {
        return Promise.resolve(apply());
      },
      then(resolve: (v: undefined) => void) {
        apply();
        resolve(undefined);
      },
    };
    return b;
  }

  const tx = { select, insert, update, execute: vi.fn() };
  return {
    ...tx,
    transaction: async <T>(fn: (h: typeof tx) => Promise<T>) => fn(tx),
  };
}

let docSeq = 0;
const assertIssuable = vi.fn(async () => undefined);
const postOutboundTxns = vi.fn(
  async (_tx: unknown, picks: Array<{ qty: number }>, _meta: Record<string, unknown>) => ({
    txnIds: picks.map((_, i) => `txn-${docSeq}-${i + 1}`),
    consumedLots: 0,
  }),
);

afterEach(() => {
  vi.clearAllMocks();
  docSeq = 0;
});

async function loadWithFakeDb() {
  vi.resetModules();
  const schema = await import("@iot/db/schema");
  const tables: Tables = {
    materialRequest: [],
    materialRequestLine: [],
    goodsIssue: [],
    goodsIssueLine: [],
    seq: 0,
  };
  const fakeDb = createFakeDb(
    tables,
    {
      materialRequest: schema.materialRequest,
      materialRequestLine: schema.materialRequestLine,
      goodsIssue: schema.goodsIssue,
      goodsIssueLine: schema.goodsIssueLine,
    },
    schema as unknown as Record<string, unknown>,
  );

  vi.doMock("@/lib/db", () => ({ db: fakeDb }));
  vi.doMock("./_docNumber", () => ({
    genDocNo: vi.fn(async (_tx: unknown, o: { prefix: string }) => {
      docSeq += 1;
      return `${o.prefix}-${String(docSeq).padStart(4, "0")}`;
    }),
    currentYymm: () => "2609",
  }));
  vi.doMock("./stockGuard", () => ({ assertIssuable, postOutboundTxns }));
  vi.doMock("drizzle-orm", async () => {
    const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
    const s = await import("@iot/db/schema");
    function keyFor(col: unknown): string {
      for (const table of Object.values(s)) {
        if (!table || typeof table !== "object") continue;
        for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
          if (v === col) return k;
        }
      }
      throw new Error("FakeDb: không tìm thấy cột");
    }
    return {
      ...actual,
      eq: (col: unknown, val: unknown) => (r: Row) => r[keyFor(col)] === val,
      and: (...ps: Array<(r: Row) => boolean>) => (r: Row) => ps.every((p) => p(r)),
    };
  });

  const repo = await import("./goodsIssues");
  return { repo, tables };
}

function seedMr(tables: Tables, status = "READY") {
  tables.materialRequest.push({
    id: "mr-1",
    requestNo: "MR-2609-001",
    status,
    woId: "wo-1",
    requestedBy: "u-req",
    pickedBy: null,
    pickedAt: null,
    deliveredAt: null,
    deliveredTo: null,
  });
  tables.materialRequestLine.push(
    { id: "l1", requestId: "mr-1", lineNo: 1, itemId: "item-A", requestedQty: "10", pickedQty: "0", deliveredQty: "0" },
    { id: "l2", requestId: "mr-1", lineNo: 2, itemId: "item-B", requestedQty: "5", pickedQty: "0", deliveredQty: "0" },
    // Dòng của phiếu KHÁC — không được đụng tới.
    { id: "lx", requestId: "mr-2", lineNo: 1, itemId: "item-A", requestedQty: "3", pickedQty: "0", deliveredQty: "0" },
  );
}

describe("issueMaterialRequest — FakeDb giao 2 lần", () => {
  it("lần 1 giao một phần → PARTIAL; lần 2 giao nốt → DELIVERED; lần 3 bị chặn", async () => {
    const { repo, tables } = await loadWithFakeDb();
    seedMr(tables);

    // ── Lần 1: A 6 (2 lô), B 5 (đủ) ──
    const r1 = await repo.issueMaterialRequest({
      materialRequestId: "mr-1",
      actorUserId: "u-kho-1",
      lines: [
        {
          materialRequestLineId: "l1",
          picks: [
            { lotSerialId: "lot-1", binId: "bin-1", qty: 4 },
            { lotSerialId: "lot-2", binId: "bin-2", qty: 2 },
          ],
        },
        { materialRequestLineId: "l2", picks: [{ lotSerialId: "lot-9", binId: "bin-1", qty: 5 }] },
      ],
    });
    expect(r1.status).toBe("PARTIAL");
    expect(r1.previousStatus).toBe("READY");
    expect(r1.goodsIssue.issueNo).toBe("PX-2609-0001");
    expect(r1.goodsIssue.totalQty).toBe(11);
    expect(r1.goodsIssue.lineCount).toBe(3);

    // guard gọi với item LẤY TỪ DÒNG PHIẾU.
    expect(assertIssuable).toHaveBeenCalledTimes(1);
    const guardPicks = (assertIssuable.mock.calls[0] as unknown[])[1] as Array<{ itemId: string }>;
    expect(guardPicks.map((p) => p.itemId)).toEqual(["item-A", "item-A", "item-B"]);
    // ledger: OUT_ISSUE ref goods_issue.
    const meta = postOutboundTxns.mock.calls[0]![2] as { txType: string; refTable: string; refId: string };
    expect(meta.txType).toBe("OUT_ISSUE");
    expect(meta.refTable).toBe("goods_issue");
    expect(meta.refId).toBe(r1.goodsIssue.id);

    const gi1 = tables.goodsIssue[0]!;
    expect(gi1).toMatchObject({
      sourceType: "MATERIAL_REQUEST",
      reason: "production",
      materialRequestId: "mr-1",
      woId: "wo-1",
      reference: "MR-2609-001",
      issuedBy: "u-kho-1",
      receivedBy: "u-req",
      totalQty: "11",
    });
    expect(tables.goodsIssueLine).toHaveLength(3);
    expect(tables.goodsIssueLine.map((l) => l.inventoryTxnId)).toEqual([
      "txn-1-1",
      "txn-1-2",
      "txn-1-3",
    ]);
    expect(tables.goodsIssueLine.map((l) => l.materialRequestLineId)).toEqual(["l1", "l1", "l2"]);

    const line = (id: string) => tables.materialRequestLine.find((l) => l.id === id)!;
    expect(line("l1").deliveredQty).toBe("6");
    expect(line("l1").pickedQty).toBe("6");
    expect(line("l2").deliveredQty).toBe("5");
    expect(line("lx").deliveredQty).toBe("0"); // phiếu khác không bị đụng

    const mr = tables.materialRequest[0]!;
    expect(mr.status).toBe("PARTIAL");
    expect(mr.pickedBy).toBe("u-kho-1");
    expect(mr.deliveredAt).toBeNull();

    // ── Lần 2 (người khác): A nốt 4 ──
    const r2 = await repo.issueMaterialRequest({
      materialRequestId: "mr-1",
      actorUserId: "u-kho-2",
      lines: [{ materialRequestLineId: "l1", picks: [{ lotSerialId: "lot-2", binId: "bin-2", qty: 4 }] }],
      notes: "giao nốt",
    });
    expect(r2.status).toBe("DELIVERED");
    expect(r2.previousStatus).toBe("PARTIAL");
    expect(r2.goodsIssue.issueNo).toBe("PX-2609-0002");
    expect(line("l1").deliveredQty).toBe("10");
    expect(mr.status).toBe("DELIVERED");
    expect(mr.deliveredAt).toBeInstanceOf(Date);
    expect(mr.deliveredTo).toBe("u-req");
    // KHO-35 — người soạn đầu tiên KHÔNG bị ghi đè.
    expect(mr.pickedBy).toBe("u-kho-1");
    expect(tables.goodsIssue).toHaveLength(2);
    expect(tables.goodsIssue[1]!.notes).toBe("giao nốt");

    // ── Lần 3: phiếu đã DELIVERED → chặn, không sinh phiếu ──
    await expect(
      repo.issueMaterialRequest({
        materialRequestId: "mr-1",
        actorUserId: "u-kho-1",
        lines: [{ materialRequestLineId: "l2", picks: [{ lotSerialId: "lot-9", binId: "bin-1", qty: 1 }] }],
      }),
    ).rejects.toMatchObject({ code: "MR_NOT_ISSUABLE", status: 409 });
    expect(tables.goodsIssue).toHaveLength(2);
  });

  it("giao vượt SL còn lại → OVER_ISSUE, không gọi guard, không sinh phiếu", async () => {
    const { repo, tables } = await loadWithFakeDb();
    seedMr(tables, "PENDING");
    await expect(
      repo.issueMaterialRequest({
        materialRequestId: "mr-1",
        actorUserId: "u-kho-1",
        lines: [{ materialRequestLineId: "l2", picks: [{ lotSerialId: "lot-9", binId: "bin-1", qty: 6 }] }],
      }),
    ).rejects.toMatchObject({ code: "OVER_ISSUE" });
    expect(assertIssuable).not.toHaveBeenCalled();
    expect(tables.goodsIssue).toHaveLength(0);
    expect(tables.materialRequest[0]!.status).toBe("PENDING");
  });

  it("dòng của phiếu khác → LINE_NOT_IN_REQUEST", async () => {
    const { repo, tables } = await loadWithFakeDb();
    seedMr(tables);
    await expect(
      repo.issueMaterialRequest({
        materialRequestId: "mr-1",
        actorUserId: "u-kho-1",
        lines: [{ materialRequestLineId: "lx", picks: [{ lotSerialId: "lot-1", binId: "bin-1", qty: 1 }] }],
      }),
    ).rejects.toMatchObject({ code: "LINE_NOT_IN_REQUEST", status: 400 });
    expect(tables.goodsIssue).toHaveLength(0);
  });

  it("phiếu CANCELLED / không tồn tại → chặn", async () => {
    const { repo, tables } = await loadWithFakeDb();
    seedMr(tables, "CANCELLED");
    await expect(
      repo.issueMaterialRequest({
        materialRequestId: "mr-1",
        actorUserId: "u",
        lines: [{ materialRequestLineId: "l1", picks: [{ lotSerialId: "a", binId: "b", qty: 1 }] }],
      }),
    ).rejects.toMatchObject({ code: "MR_NOT_ISSUABLE" });
    await expect(
      repo.issueMaterialRequest({
        materialRequestId: "khong-co",
        actorUserId: "u",
        lines: [{ materialRequestLineId: "l1", picks: [{ lotSerialId: "a", binId: "b", qty: 1 }] }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("guard từ chối (lô HOLD…) → lỗi nổi lên, không cộng SL giao", async () => {
    const { repo, tables } = await loadWithFakeDb();
    seedMr(tables);
    assertIssuable.mockRejectedValueOnce(
      Object.assign(new Error("Lô L1 đang chờ QC nhập kho — không được xuất."), {
        code: "LOT_NOT_AVAILABLE",
        status: 409,
      }),
    );
    await expect(
      repo.issueMaterialRequest({
        materialRequestId: "mr-1",
        actorUserId: "u",
        lines: [{ materialRequestLineId: "l1", picks: [{ lotSerialId: "a", binId: "b", qty: 1 }] }],
      }),
    ).rejects.toMatchObject({ code: "LOT_NOT_AVAILABLE" });
    expect(tables.materialRequestLine.find((l) => l.id === "l1")!.deliveredQty).toBe("0");
    expect(tables.materialRequest[0]!.status).toBe("READY");
  });
});

describe("createGoodsIssueTx", () => {
  it("không có dòng → EMPTY_ISSUE (400)", async () => {
    const { repo } = await loadWithFakeDb();
    await expect(
      repo.createGoodsIssueTx({} as never, {
        sourceType: "QUICK_ISSUE",
        reason: "manual",
        issuedBy: "u",
        picks: [],
      }),
    ).rejects.toMatchObject({ code: "EMPTY_ISSUE", status: 400 });
  });

  it("xuất nhanh: header QUICK_ISSUE, SL làm tròn 4 chữ số", async () => {
    const { repo, tables } = await loadWithFakeDb();
    const gi = await repo.createGoodsIssue({
      sourceType: "QUICK_ISSUE",
      reason: "loss",
      reference: "HH-01",
      issuedBy: "u-kho",
      picks: [
        { itemId: "i", lotSerialId: "l", binId: "b", qty: 0.1 },
        { itemId: "i", lotSerialId: "l", binId: "b2", qty: 0.2 },
      ],
    });
    expect(gi.totalQty).toBe(0.3);
    expect(tables.goodsIssue[0]).toMatchObject({
      sourceType: "QUICK_ISSUE",
      reason: "loss",
      reference: "HH-01",
      totalQty: "0.3",
      materialRequestId: null,
      issueRequestId: null,
    });
    expect(tables.goodsIssueLine.map((l) => l.lineNo)).toEqual([1, 2]);
  });
});
