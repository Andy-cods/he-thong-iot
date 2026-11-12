/**
 * BOM V5 WP8a — phiếu giao: tạo (SURFACE/ASSEMBLY), số phiếu tuần tự theo ngày,
 * chuyển bước cùng transaction, giao từng phần, ghi chú Đợt/còn, nhận hàng về, quyền.
 * FakeDb in-memory (pattern bom-stage-moves.route.test.ts); khoá FOR UPDATE thật
 * do Postgres bảo đảm (chưa test được ở đây).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]> & { seqs: Map<string, number>; n: number };

function createFakeDb(t: Tables, named: Record<string, unknown>, schema: Record<string, unknown>) {
  const arr = (table: unknown): Row[] => {
    for (const [k, v] of Object.entries(named)) if (v === table) return t[k]!;
    throw new Error("FakeDb: bảng không hỗ trợ");
  };
  const keyFor = (col: unknown): string | null => {
    for (const table of Object.values(schema)) {
      if (!table || typeof table !== "object") continue;
      for (const [k, v] of Object.entries(table as Record<string, unknown>)) if (v === col) return k;
    }
    return null;
  };
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
      where(p: (r: Row) => boolean) {
        pred = p;
        return b;
      },
      orderBy() {
        return b;
      },
      for() {
        return Promise.resolve(run());
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
    const b = {
      values(v: Row | Row[]) {
        vals = Array.isArray(v) ? v : [v];
        return b;
      },
      onConflictDoNothing() {
        return b;
      },
      returning() {
        const inserted = vals.map((v) => ({ id: ++t.n, at: new Date(), createdAt: new Date(), ...v }));
        arr(table).push(...inserted);
        return Promise.resolve(inserted.map((r) => ({ ...r })));
      },
    };
    return b;
  }
  function update(table: unknown) {
    let patch: Row = {};
    const b = {
      set(p: Row) {
        patch = p;
        return b;
      },
      where(pred: (r: Row) => boolean) {
        for (const r of arr(table)) if (pred(r)) Object.assign(r, patch);
        return Promise.resolve();
      },
    };
    return b;
  }
  const execute = vi.fn(async (q: { queryChunks: unknown[] }) => {
    const params = q.queryChunks
      .filter((c) => !(typeof c === "object" && c !== null && Array.isArray((c as { value?: unknown }).value)))
      .map((c) => (typeof c === "object" && c !== null && "value" in c ? (c as { value: unknown }).value : c));
    const day = String(params[0]);
    const next = (t.seqs.get(day) ?? 0) + 1;
    t.seqs.set(day, next);
    return [{ last: next }];
  });
  const tx = { select, insert, update, execute };
  return {
    ...tx,
    transaction: async <T,>(fn: (h: typeof tx) => Promise<T>) => {
      // Giả lập rollback: chụp lại mọi bảng + seq, khôi phục nếu callback ném lỗi.
      const snap = Object.fromEntries(
        Object.entries(named).map(([k]) => [k, t[k]!.map((r) => ({ ...r }))]),
      );
      const seqSnap = new Map(t.seqs);
      try {
        return await fn(tx);
      } catch (e) {
        for (const k of Object.keys(snap)) t[k]!.splice(0, t[k]!.length, ...snap[k]!);
        t.seqs = seqSnap;
        throw e;
      }
    },
  };
}

const L1 = "11111111-1111-4111-8111-111111111111"; // GTAM, 2 × 10 = 20
const L2 = "22222222-2222-4222-8222-222222222222"; // GTAM, totalQty=5
const L3 = "33333333-3333-4333-8333-333333333333"; // OUTSOURCED 10
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const base = `http://localhost/api/bom/templates/${T1}`;
const params = { id: T1 };

async function setup(opts: { roles?: string[] } = {}) {
  vi.resetModules();
  const schema = await import("@iot/db/schema");
  const { can } = await import("@iot/shared");
  const tables = {
    bomLine: [],
    bomTemplate: [],
    bomStageMove: [],
    deliverySlip: [],
    deliverySlipLine: [],
    item: [],
    supplier: [],
    seqs: new Map<string, number>(),
    n: 0,
  } as unknown as Tables;
  const fakeDb = createFakeDb(
    tables,
    {
      bomLine: schema.bomLine,
      bomTemplate: schema.bomTemplate,
      bomStageMove: schema.bomStageMove,
      deliverySlip: schema.deliverySlip,
      deliverySlipLine: schema.deliverySlipLine,
      item: schema.item,
      supplier: schema.supplier,
    },
    schema as unknown as Record<string, unknown>,
  );
  const requireCan = vi.fn(async (_req: unknown, action: string, entity: string) => {
    const roles = (opts.roles ?? ["operator"]) as never;
    if (!can(roles, action as never, entity as never)) {
      const { NextResponse } = await import("next/server");
      return { response: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
    }
    return { session: { userId: "u-1", username: "x", fullName: "X", roles, sessionId: null } };
  });
  vi.doMock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  }));
  vi.doMock("@/lib/db", () => ({ db: fakeDb }));
  vi.doMock("@/server/session", () => ({ requireCan }));
  vi.doMock("@/server/services/bom-stage-notify-send", () => ({
    notifyBomStageMoved: vi.fn(async () => undefined),
    notifySlipCreated: vi.fn(async () => undefined),
    notifySlipReceived: vi.fn(async () => undefined),
  }));
  vi.doMock("@/server/services/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
  vi.doMock("drizzle-orm", async () => {
    const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
    const s = await import("@iot/db/schema");
    const keyFor = (col: unknown): string => {
      for (const table of Object.values(s)) {
        if (!table || typeof table !== "object") continue;
        for (const [k, v] of Object.entries(table as Record<string, unknown>)) if (v === col) return k;
      }
      throw new Error("FakeDb: không tìm thấy cột");
    };
    return {
      ...actual,
      eq: (col: unknown, val: unknown) => (r: Row) => r[keyFor(col)] === val,
      and: (...ps: Array<(r: Row) => boolean>) => (r: Row) => ps.every((p) => p(r)),
      inArray: (col: unknown, vals: unknown[]) => (r: Row) => vals.includes(r[keyFor(col)]),
      desc: (c: unknown) => c,
    };
  });
  const create = await import("./[id]/delivery-slips/route");
  const detail = await import("../../delivery-slips/[slipId]/route");
  const receive = await import("../../delivery-slips/[slipId]/receive/route");

  tables.bomTemplate!.push({ id: T1, code: "Z0000002590422", targetQty: "10" });
  tables.supplier!.push({ id: SUP, name: "ASAHI PLATING", address: "KCN Quang Minh" });
  tables.item!.push({ id: "it1", sku: "SKU1", name: "Chi tiết nhôm", dimensions: null, specJson: null });
  const mk = (id: string, category: string, md: Row, extra: Row = {}) => ({
    id,
    templateId: T1,
    componentItemId: "it1",
    category,
    qtyPerParent: "2",
    metadata: md,
    file3dName: `3D-${id.slice(0, 2)}`,
    positionCode: `BL${id.slice(0, 1)}`,
    surfaceTreatment: "Anode bạc",
    ...extra,
  });
  tables.bomLine!.push(
    mk(L1, "GTAM", { size: "70 x 30 x 20" }),
    mk(L2, "GTAM", { totalQty: "5" }),
    mk(L3, "OUTSOURCED", {}, { qtyPerParent: "1" }),
  );
  return { tables, create, detail, receive, requireCan };
}

type Mods = Awaited<ReturnType<typeof setup>>;

const postSlip = (m: Mods, body: unknown) =>
  m.create.POST(
    new NextRequest(`${base}/delivery-slips`, { method: "POST", body: JSON.stringify(body) }),
    { params } as never,
  );
const recv = (m: Mods, slipId: string, lines: Array<{ slipLineId: string; qty: number }>) =>
  m.receive.POST(
    new NextRequest(`http://localhost/api/delivery-slips/${slipId}/receive`, {
      method: "POST",
      body: JSON.stringify({ lines }),
    }),
    { params: { slipId } } as never,
  );
const seedStage = (m: Mods, lineId: string, from: string, to: string, qty: number) =>
  m.tables.bomStageMove!.push({
    id: ++m.tables.n,
    lineId,
    fromStage: from,
    toStage: to,
    qty: String(qty),
    docType: "MANUAL",
  });
/** Đưa `qty` của dòng tới bước MACHINING (gia công xong, chờ giao). */
const toMachining = (m: Mods, lineId: string, qty: number) => seedStage(m, lineId, "BLANK", "MACHINING", qty);
const bucketOf = (m: Mods, lineId: string, stage: string) => {
  let b = lineId === L2 ? 5 : lineId === L3 ? 10 : 20;
  if (stage !== "BLANK" && stage !== "ORDER") b = 0;
  for (const mv of m.tables.bomStageMove!.filter((x) => x.lineId === lineId)) {
    if (mv.fromStage === stage) b -= Number(mv.qty);
    if (mv.toStage === stage) b += Number(mv.qty);
  }
  return b;
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("POST delivery-slips — SURFACE", () => {
  it("tạo SENT, chuyển MACHINING→SURFACE theo SL mặc định = SL đang có, snapshot đủ cột", async () => {
    const m = await setup();
    toMachining(m, L1, 12);
    const res = await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L1, unitPrice: 5000 }] });
    expect(res.status).toBe(201);
    const { slip, lines } = (await res.json()).data;
    expect(slip).toMatchObject({ kind: "SURFACE", status: "SENT", supplierId: SUP, recipientText: "ASAHI PLATING" });
    expect(lines[0]).toMatchObject({ stt: 1, qtyDoc: "12", unitPrice: "5000", fromStage: "MACHINING", toStage: "SURFACE" });
    expect(lines[0].snap).toMatchObject({
      name: "3D-11",
      dims: { l: 70, w: 30, h: 20 },
      surfaceTreatment: "Anode bạc",
      projectCode: "Z0000002590422",
      positionCode: "BL1",
      recipient: { name: "ASAHI PLATING", address: "KCN Quang Minh" },
    });
    expect(bucketOf(m, L1, "SURFACE")).toBe(12);
    expect(bucketOf(m, L1, "MACHINING")).toBe(0);
    const mv = m.tables.bomStageMove!.at(-1)!;
    expect(mv).toMatchObject({ docType: "DELIVERY_SLIP", docId: lines[0].id, fromStage: "MACHINING", toStage: "SURFACE" });
  });

  it("SL > bucket → 422 EXCEEDS_BUCKET, không ghi gì (kể cả số phiếu)", async () => {
    const m = await setup();
    toMachining(m, L1, 12);
    const movesBefore = m.tables.bomStageMove!.length;
    const res = await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L1, qty: 13 }] });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "EXCEEDS_BUCKET", index: 0, lineId: L1 });
    expect(m.tables.bomStageMove).toHaveLength(movesBefore);
    expect(m.tables.deliverySlip).toHaveLength(0);
    expect(m.tables.seqs.size).toBe(0);
  });

  it("all-or-nothing: dòng 2 lỗi thì dòng 1 không bị chuyển bước", async () => {
    const m = await setup();
    toMachining(m, L1, 12);
    toMachining(m, L2, 2);
    const before = m.tables.bomStageMove!.length;
    const res = await postSlip(m, {
      kind: "SURFACE",
      supplierId: SUP,
      lines: [{ lineId: L1, qty: 5 }, { lineId: L2, qty: 3 }],
    });
    expect(res.status).toBe(422);
    expect((await res.json()).lineId).toBe(L2);
    expect(m.tables.bomStageMove).toHaveLength(before);
    expect(m.tables.deliverySlipLine).toHaveLength(0);
  });

  it("thiếu NCC → 422; NCC không tồn tại → 422; category OUTSOURCED → BAD_CATEGORY", async () => {
    const m = await setup();
    toMachining(m, L1, 12);
    expect((await postSlip(m, { kind: "SURFACE", lines: [{ lineId: L1 }] })).status).toBe(422);
    const bad = await postSlip(m, {
      kind: "SURFACE",
      supplierId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      lines: [{ lineId: L1 }],
    });
    expect((await bad.json()).code).toBe("SUPPLIER_NOT_FOUND");
    const cat = await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L3 }] });
    expect((await cat.json()).code).toBe("BAD_CATEGORY");
  });

  it("giao từng phần: ghi chú 'Đợt n · còn x' (n tăng theo số phiếu cùng loại, x = chưa tới bước đích)", async () => {
    const m = await setup();
    toMachining(m, L1, 20);
    const r1 = await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L1, qty: 8 }] });
    expect((await r1.json()).data.lines[0].note).toBe("Đợt 1 · còn 12");
    const r2 = await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L1, qty: 12, note: "gấp" }] });
    const l2 = (await r2.json()).data.lines[0];
    expect(l2.note).toBe("Đợt 2 · gấp");
    expect(m.tables.deliverySlip!.map((s) => s.batchNo)).toEqual([1, 2]);
    // hết hàng ở MACHINING → mặc định không còn gì để giao
    const r3 = await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L1 }] });
    expect((await r3.json()).code).toBe("NO_STOCK");
  });
});

describe("POST delivery-slips — ASSEMBLY & số phiếu", () => {
  it("ASSEMBLY chuyển QC→ASSEMBLY cho mọi category, TO = bộ phận lắp ráp, không đơn giá/NCC", async () => {
    const m = await setup();
    seedStage(m, L3, "ORDER", "QC", 10);
    const res = await postSlip(m, { kind: "ASSEMBLY", lines: [{ lineId: L3, qty: 4, unitPrice: 99 }] });
    expect(res.status).toBe(201);
    const { slip, lines } = (await res.json()).data;
    expect(slip).toMatchObject({ kind: "ASSEMBLY", supplierId: null, recipientText: "BỘ PHẬN LẮP RÁP — XƯỞNG GTAM" });
    expect(lines[0]).toMatchObject({ fromStage: "QC", toStage: "ASSEMBLY", unitPrice: null, note: "Đợt 1 · còn 6" });
    expect(bucketOf(m, L3, "ASSEMBLY")).toBe(4);
    expect(bucketOf(m, L3, "QC")).toBe(6);
  });

  it("số phiếu GT-PG{yymmdd}-0{n}: tuần tự trong ngày (giờ VN), sang ngày mới về 1", async () => {
    vi.useFakeTimers();
    const m = await setup();
    seedStage(m, L3, "ORDER", "QC", 10);
    const no = async () => (await (await postSlip(m, { kind: "ASSEMBLY", lines: [{ lineId: L3, qty: 1 }] })).json()).data.slip.slipNo;
    // 2026-11-11 23:30 giờ VN = 16:30 UTC cùng ngày; 00:10 hôm sau VN = 17:10 UTC.
    vi.setSystemTime(new Date("2026-11-11T16:30:00Z"));
    expect(await no()).toBe("GT-PG261111-01");
    expect(await no()).toBe("GT-PG261111-02");
    expect(await no()).toBe("GT-PG261111-03");
    vi.setSystemTime(new Date("2026-11-11T17:10:00Z"));
    expect(await no()).toBe("GT-PG261112-01");
  });

  it("lỗi sau khi cấp số → hoàn số (rollback), phiếu kế tiếp không bị nhảy cóc", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T03:00:00Z"));
    const m = await setup();
    seedStage(m, L3, "ORDER", "QC", 10);
    await postSlip(m, { kind: "ASSEMBLY", lines: [{ lineId: L3, qty: 1 }] });
    await postSlip(m, { kind: "ASSEMBLY", lines: [{ lineId: L3, qty: 99 }] }); // lỗi
    const r = await postSlip(m, { kind: "ASSEMBLY", lines: [{ lineId: L3, qty: 1 }] });
    expect((await r.json()).data.slip.slipNo).toBe("GT-PG261111-02");
  });
});

describe("POST receive", () => {
  async function surfaceSlip(m: Mods, qty = 12) {
    toMachining(m, L1, 20);
    const res = await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L1, qty }] });
    const d = (await res.json()).data;
    return { slipId: d.slip.id as string, lineId: d.lines[0].id as string };
  }

  it("cộng dồn Thực nhận, SURFACE→QC đúng SL nhận, thiếu ở lại SURFACE; PARTIAL → RECEIVED", async () => {
    const m = await setup();
    const { slipId, lineId } = await surfaceSlip(m);
    const r1 = await recv(m, slipId, [{ slipLineId: lineId, qty: 7 }]);
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()).data;
    expect(b1.slip.status).toBe("PARTIAL_RECEIVED");
    expect(b1.lines[0].qtyReceived).toBe("7");
    expect(bucketOf(m, L1, "SURFACE")).toBe(5);
    expect(bucketOf(m, L1, "QC")).toBe(7);
    expect(m.tables.bomStageMove!.at(-1)).toMatchObject({ docType: "SLIP_RECEIVE", fromStage: "SURFACE", toStage: "QC" });

    // vượt phần còn lại của chứng từ (7 + 6 > 12) → 422, không ghi
    const movesBefore = m.tables.bomStageMove!.length;
    const over = await recv(m, slipId, [{ slipLineId: lineId, qty: 6 }]);
    expect(over.status).toBe(422);
    expect((await over.json()).code).toBe("EXCEEDS_DOC");
    expect(m.tables.bomStageMove).toHaveLength(movesBefore);

    const r2 = await recv(m, slipId, [{ slipLineId: lineId, qty: 5 }]);
    const b2 = (await r2.json()).data;
    expect(b2.slip.status).toBe("RECEIVED");
    expect(b2.lines[0].qtyReceived).toBe("12");
    expect(bucketOf(m, L1, "SURFACE")).toBe(0);
    expect(bucketOf(m, L1, "QC")).toBe(12);

    // đã nhận đủ → không nhận thêm
    expect((await recv(m, slipId, [{ slipLineId: lineId, qty: 1 }])).status).toBe(422);
  });

  it("phiếu ASSEMBLY không nhận hàng về được; slipLine lạ → 404; slip lạ → 404", async () => {
    const m = await setup();
    seedStage(m, L3, "ORDER", "QC", 10);
    const d = (await (await postSlip(m, { kind: "ASSEMBLY", lines: [{ lineId: L3, qty: 2 }] })).json()).data;
    const r = await recv(m, d.slip.id, [{ slipLineId: d.lines[0].id, qty: 1 }]);
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe("NOT_RECEIVABLE");

    const { slipId } = await surfaceSlip(m);
    const bad = await recv(m, slipId, [{ slipLineId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", qty: 1 }]);
    expect(bad.status).toBe(404);
    const none = await recv(m, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", [{ slipLineId: L1, qty: 1 }]);
    expect(none.status).toBe(404);
  });
});

describe("GET + quyền", () => {
  it("GET chi tiết trả slip + lines; id lạ → 404", async () => {
    const m = await setup();
    toMachining(m, L1, 5);
    const { slip } = (await (await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L1 }] })).json()).data;
    const ok = await m.detail.GET(new NextRequest("http://localhost/x"), { params: { slipId: slip.id } } as never);
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.lines).toHaveLength(1);
    const nf = await m.detail.GET(new NextRequest("http://localhost/x"), {
      params: { slipId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
    } as never);
    expect(nf.status).toBe(404);
  });

  it("GET list theo template trả tổng SL; role không đọc BOM → 403 ở mọi route", async () => {
    const m = await setup();
    toMachining(m, L1, 5);
    await postSlip(m, { kind: "SURFACE", supplierId: SUP, lines: [{ lineId: L1 }] });
    const list = await m.create.GET(new NextRequest(`${base}/delivery-slips`), { params } as never);
    const rows = (await list.json()).data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lineCount: 1, totalQtyDoc: 5, totalQtyReceived: 0 });

    const denied = await setup({ roles: [] });
    expect((await postSlip(denied, { kind: "ASSEMBLY", lines: [{ lineId: L3 }] })).status).toBe(403);
    expect((await denied.create.GET(new NextRequest(`${base}/delivery-slips`), { params } as never)).status).toBe(403);
    expect((await recv(denied, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", [])).status).toBe(403);
  });
});
