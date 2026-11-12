/**
 * BOM V5 / WP6 — sổ bước: GET stages, POST stage-moves (single + bulk), reverse, lịch sử.
 * FakeDb in-memory (cùng pattern line-supplier.route.test.ts) — không có Postgres thật,
 * nên "đồng thời" được kiểm bằng 2 yêu cầu nối tiếp (người sau thấy bucket đã trừ);
 * tính nguyên tử thật do SELECT ... FOR UPDATE ở DB (chưa test được ở đây).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
interface Tables {
  bomLine: Row[];
  bomTemplate: Row[];
  bomStageMove: Row[];
  seq: number;
}

function createFakeDb(t: Tables, named: Record<string, unknown>, schema: Record<string, unknown>) {
  const arr = (table: unknown): Row[] => {
    for (const [k, v] of Object.entries(named)) if (v === table) return t[k as "bomLine"];
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
    const doInsert = () => {
      const inserted = vals.map((v) => ({
        id: ++t.seq,
        at: new Date(),
        ...v,
      }));
      arr(table).push(...inserted);
      return inserted;
    };
    const b = {
      values(v: Row | Row[]) {
        vals = Array.isArray(v) ? v : [v];
        return b;
      },
      onConflictDoNothing() {
        return b;
      },
      returning() {
        return Promise.resolve(doInsert());
      },
    };
    return b;
  }
  const execute = vi.fn(async (q: { queryChunks: unknown[] }) => {
    const isStr = (c: unknown): c is { value: string[] } =>
      typeof c === "object" && c !== null && Array.isArray((c as { value?: unknown }).value);
    const text = q.queryChunks.map((c) => (isStr(c) ? c.value.join("") : "?")).join("");
    const params = q.queryChunks
      .filter((c) => !isStr(c))
      .map((c) => (typeof c === "object" && c !== null && "value" in c ? (c as { value: unknown }).value : c));
    if (text.includes("FROM app.bom_line l")) {
      const tid = params[0];
      const tpl = t.bomTemplate.find((x) => x.id === tid);
      const out: Row[] = [];
      for (const l of t.bomLine.filter((x) => x.templateId === tid)) {
        const mv = t.bomStageMove.filter((m) => m.lineId === l.id);
        const base = {
          lineId: l.id,
          category: l.category ?? null,
          qtyPerParent: l.qtyPerParent,
          metadata: l.metadata ?? {},
          targetQty: tpl?.targetQty,
        };
        if (mv.length === 0) out.push({ ...base, fromStage: null, toStage: null, qty: "0" });
        const groups = new Map<string, Row>();
        for (const m of mv) {
          const k = `${m.fromStage}>${m.toStage}`;
          const g = groups.get(k);
          if (g) g.qty = String(Number(g.qty) + Number(m.qty));
          else groups.set(k, { ...base, fromStage: m.fromStage, toStage: m.toStage, qty: String(m.qty) });
        }
        out.push(...groups.values());
      }
      return out;
    }
    if (text.includes("FROM app.bom_stage_move m")) {
      const lineId = params[0];
      return t.bomStageMove
        .filter((m) => m.lineId === lineId)
        .reverse()
        .map((m) => ({
          ...m,
          actorName: "Hùng",
          reversedById: t.bomStageMove.find((r) => r.reversesId === m.id)?.id ?? null,
        }));
    }
    return [];
  });
  const tx = { select, insert, execute };
  return {
    ...tx,
    // Giả lập rollback: khôi phục bảng sổ nếu callback ném lỗi.
    transaction: async <T,>(fn: (h: typeof tx) => Promise<T>) => {
      const snap = t.bomStageMove.length;
      try {
        return await fn(tx);
      } catch (e) {
        t.bomStageMove.length = snap;
        throw e;
      }
    },
  };
}

const L1 = "11111111-1111-4111-8111-111111111111"; // GTAM, 2 × 10 = 20
const L2 = "22222222-2222-4222-8222-222222222222"; // GTAM, totalQty=5 (metadata thắng)
const L3 = "33333333-3333-4333-8333-333333333333"; // category NULL → OTHER, 1 × 10 = 10
const base = "http://localhost/api/bom/templates/T1";
const params = { id: "T1" };

async function setup(opts: { roles?: string[] } = {}) {
  vi.resetModules();
  const schema = await import("@iot/db/schema");
  const { can } = await import("@iot/shared");
  const tables: Tables = { bomLine: [], bomTemplate: [], bomStageMove: [], seq: 0 };
  const fakeDb = createFakeDb(
    tables,
    { bomLine: schema.bomLine, bomTemplate: schema.bomTemplate, bomStageMove: schema.bomStageMove },
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
  vi.doMock("@/server/services/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));
  vi.doMock("@/server/repos/bomLines", () => ({
    lineBelongsToTemplate: async (lid: string, tid: string) =>
      tables.bomLine.some((l) => l.id === lid && l.templateId === tid),
  }));
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
    };
  });
  const stages = await import("./[id]/stages/route");
  const moves = await import("./[id]/stage-moves/route");
  const reverse = await import("./[id]/stage-moves/[moveId]/reverse/route");
  const history = await import("./[id]/lines/[lid]/stage-moves/route");

  tables.bomTemplate.push({ id: "T1", targetQty: "10" });
  tables.bomLine.push(
    { id: L1, templateId: "T1", category: "GTAM", qtyPerParent: "2", metadata: {} },
    { id: L2, templateId: "T1", category: "GTAM", qtyPerParent: "2", metadata: { totalQty: "5" } },
    { id: L3, templateId: "T1", category: null, qtyPerParent: "1", metadata: {} },
  );
  return { tables, stages, moves, reverse, history, requireCan };
}

type Mods = Awaited<ReturnType<typeof setup>>;

const post = (m: Mods, body: unknown) =>
  m.moves.POST(
    new NextRequest(`${base}/stage-moves`, { method: "POST", body: JSON.stringify(body) }),
    { params } as never,
  );
const getStages = async (m: Mods) => {
  const res = await m.stages.GET(new NextRequest(`${base}/stages`), { params } as never);
  return { res, body: await res.json() };
};
const rev = (m: Mods, id: number | string) =>
  m.reverse.POST(
    new NextRequest(`${base}/stage-moves/${id}/reverse`, { method: "POST" }),
    { params: { id: "T1", moveId: String(id) } } as never,
  );
const mv = (lineId: string, from: string, to: string, qty: number) => ({ lineId, from, to, qty });

afterEach(() => vi.clearAllMocks());

describe("GET .../stages", () => {
  it("SL cần = metadata.totalQty nếu có, ngược lại qty_per_parent × targetQty; category NULL → OTHER", async () => {
    const m = await setup();
    const { res, body } = await getStages(m);
    expect(res.status).toBe(200);
    const lines = body.data.lines;
    expect(lines[L1]).toMatchObject({ category: "GTAM", required: 20 });
    expect(lines[L1].buckets).toEqual({ BLANK: 20, MACHINING: 0, SURFACE: 0, QC: 0, ASSEMBLY: 0 });
    expect(lines[L2].required).toBe(5);
    expect(lines[L3]).toMatchObject({ category: "OTHER", required: 10 });
    expect(Object.keys(lines[L3].buckets)).toEqual(["PROPOSE", "PO", "STOCK", "QC", "ASSEMBLY"]);
    expect(body.data.categories.GTAM[0]).toEqual({ code: "BLANK", label: "Chờ phôi" });
  });

  it("role không đọc được BOM → 403", async () => {
    const m = await setup({ roles: [] });
    expect((await getStages(m)).res.status).toBe(403);
  });
});

describe("POST .../stage-moves", () => {
  it("chuyển từng phần đúng bucket, giữ nguyên tổng", async () => {
    const m = await setup();
    const r1 = await post(m, mv(L1, "BLANK", "MACHINING", 8));
    expect(r1.status).toBe(200);
    expect((await r1.json()).data.buckets).toMatchObject({ BLANK: 12, MACHINING: 8 });
    const r2 = await post(m, mv(L1, "MACHINING", "SURFACE", 3));
    expect(r2.status).toBe(200);
    const { body } = await getStages(m);
    const b = body.data.lines[L1].buckets;
    expect(b).toEqual({ BLANK: 12, MACHINING: 5, SURFACE: 3, QC: 0, ASSEMBLY: 0 });
    expect(Object.values(b as Record<string, number>).reduce((a, x) => a + x, 0)).toBe(20);
    expect(m.tables.bomStageMove[0]).toMatchObject({ docType: "MANUAL", actorId: "u-1", qty: "8" });
  });

  it("vượt bucket → 422 EXCEEDS_BUCKET, không ghi; người thứ hai sau khi bucket đã trừ cũng bị chặn", async () => {
    const m = await setup();
    const over = await post(m, mv(L1, "BLANK", "MACHINING", 21));
    expect(over.status).toBe(422);
    const body = await over.json();
    expect(body.code).toBe("EXCEEDS_BUCKET");
    expect(body.message).toMatch(/vượt/);
    expect(m.tables.bomStageMove).toHaveLength(0);
    // "2 người cùng bấm hết 15": người đầu thành công, người sau bị chặn.
    expect((await post(m, mv(L1, "BLANK", "MACHINING", 15))).status).toBe(200);
    expect((await post(m, mv(L1, "BLANK", "MACHINING", 15))).status).toBe(422);
    expect(m.tables.bomStageMove).toHaveLength(1);
  });

  it("SL cần lấy từ metadata.totalQty (không vượt 5 dù qty×target = 20)", async () => {
    const m = await setup();
    expect((await post(m, mv(L2, "BLANK", "MACHINING", 6))).status).toBe(422);
    expect((await post(m, mv(L2, "BLANK", "MACHINING", 5))).status).toBe(200);
  });

  it("chặn lùi, cùng bước, bước lạ, SL ≤ 0; category NULL dùng bước OTHER", async () => {
    const m = await setup();
    await post(m, mv(L1, "BLANK", "MACHINING", 4));
    const code = async (b: unknown) => (await (await post(m, b)).json()).code;
    expect(await code(mv(L1, "MACHINING", "BLANK", 1))).toBe("BACKWARD");
    expect(await code(mv(L1, "BLANK", "BLANK", 1))).toBe("SAME_STAGE");
    expect(await code(mv(L1, "PO", "STOCK", 1))).toBe("BAD_STAGE");
    expect((await post(m, mv(L1, "BLANK", "MACHINING", 0))).status).toBe(422); // zod positive
    expect((await post(m, mv(L3, "BLANK", "MACHINING", 1))).status).toBe(422); // BAD_STAGE
    expect((await post(m, mv(L3, "PROPOSE", "PO", 10))).status).toBe(200);
  });

  it("dòng không thuộc template → 404", async () => {
    const m = await setup();
    m.tables.bomLine.push({ id: "44444444-4444-4444-8444-444444444444", templateId: "OTHER", qtyPerParent: "1" });
    const res = await post(m, mv("44444444-4444-4444-8444-444444444444", "BLANK", "MACHINING", 1));
    expect(res.status).toBe(404);
  });

  it("bulk all-or-nothing: 1 dòng lỗi → không dòng nào được ghi", async () => {
    const m = await setup();
    const res = await post(m, {
      items: [mv(L1, "BLANK", "MACHINING", 5), mv(L2, "BLANK", "MACHINING", 9)],
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ code: "EXCEEDS_BUCKET", index: 1, lineId: L2 });
    expect(m.tables.bomStageMove).toHaveLength(0);

    const ok = await post(m, {
      items: [mv(L2, "BLANK", "MACHINING", 5), mv(L1, "BLANK", "MACHINING", 5)],
    });
    expect(ok.status).toBe(200);
    expect(m.tables.bomStageMove).toHaveLength(2);
  });

  it("bulk: cùng 1 dòng 2 mục cộng dồn vào bucket, mục vượt làm hỏng cả lô", async () => {
    const m = await setup();
    const bad = await post(m, {
      items: [mv(L2, "BLANK", "MACHINING", 3), mv(L2, "BLANK", "MACHINING", 3)],
    });
    expect(bad.status).toBe(422);
    expect(m.tables.bomStageMove).toHaveLength(0);
  });

  it("quyền: gate = read bomTemplate; role không có → 403 và không ghi", async () => {
    const ok = await setup({ roles: ["warehouse"] });
    expect((await post(ok, mv(L1, "BLANK", "MACHINING", 1))).status).toBe(200);
    expect(ok.requireCan).toHaveBeenCalledWith(expect.anything(), "read", "bomTemplate");
    const no = await setup({ roles: [] });
    expect((await post(no, mv(L1, "BLANK", "MACHINING", 1))).status).toBe(403);
    expect(no.tables.bomStageMove).toHaveLength(0);
  });
});

describe("POST .../stage-moves/[moveId]/reverse", () => {
  it("đảo đúng: tạo bút toán ngược (reverses_id), bucket về như cũ, không xoá bút toán gốc", async () => {
    const m = await setup();
    await post(m, mv(L1, "BLANK", "MACHINING", 8));
    const id = m.tables.bomStageMove[0]!.id as number;
    const res = await rev(m, id);
    expect(res.status).toBe(200);
    expect(m.tables.bomStageMove).toHaveLength(2);
    expect(m.tables.bomStageMove[1]).toMatchObject({
      fromStage: "MACHINING",
      toStage: "BLANK",
      qty: "8",
      reversesId: id,
    });
    const { body } = await getStages(m);
    expect(body.data.lines[L1].buckets.BLANK).toBe(20);
    expect(body.data.lines[L1].buckets.MACHINING).toBe(0);
  });

  it("chặn đảo lần 2 (409) và chặn đảo một bút toán đảo (422)", async () => {
    const m = await setup();
    await post(m, mv(L1, "BLANK", "MACHINING", 8));
    const id = m.tables.bomStageMove[0]!.id as number;
    expect((await rev(m, id)).status).toBe(200);
    const again = await rev(m, id);
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe("ALREADY_REVERSED");
    const revId = m.tables.bomStageMove[1]!.id as number;
    const rr = await rev(m, revId);
    expect(rr.status).toBe(422);
    expect((await rr.json()).code).toBe("CANNOT_REVERSE");
    expect(m.tables.bomStageMove).toHaveLength(2);
  });

  it("hàng đã chuyển tiếp thì không đảo được (EXCEEDS_BUCKET)", async () => {
    const m = await setup();
    await post(m, mv(L1, "BLANK", "MACHINING", 8));
    await post(m, mv(L1, "MACHINING", "SURFACE", 8));
    const first = m.tables.bomStageMove[0]!.id as number;
    const res = await rev(m, first);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("EXCEEDS_BUCKET");
    // đảo bước sau trước rồi mới đảo được bước đầu
    expect((await rev(m, m.tables.bomStageMove[1]!.id as number)).status).toBe(200);
    expect((await rev(m, first)).status).toBe(200);
  });

  it("id không tồn tại / không hợp lệ → 404 / 422; không quyền → 403", async () => {
    const m = await setup();
    expect((await rev(m, 999)).status).toBe(404);
    expect((await rev(m, "abc")).status).toBe(422);
    const no = await setup({ roles: [] });
    expect((await rev(no, 1)).status).toBe(403);
  });
});

describe("GET .../lines/[lid]/stage-moves", () => {
  it("trả lịch sử kèm reversedById", async () => {
    const m = await setup();
    await post(m, mv(L1, "BLANK", "MACHINING", 8));
    const id = m.tables.bomStageMove[0]!.id as number;
    await rev(m, id);
    const res = await m.history.GET(
      new NextRequest(`${base}/lines/${L1}/stage-moves`),
      { params: { id: "T1", lid: L1 } } as never,
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()).data as Row[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === id)).toMatchObject({ reversedById: expect.any(Number), actorName: "Hùng" });
    const miss = await m.history.GET(
      new NextRequest(`${base}/lines/NOPE/stage-moves`),
      { params: { id: "T1", lid: "NOPE" } } as never,
    );
    expect(miss.status).toBe(404);
  });
});
