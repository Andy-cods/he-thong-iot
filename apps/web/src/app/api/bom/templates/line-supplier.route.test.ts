/**
 * BOM V5 / WP2 — route PATCH .../lines/[lid]/supplier + GET history.
 * FakeDb in-memory (cùng pattern bomTemplates.test.ts): không có Postgres thật.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
interface Tables {
  bomLine: Row[];
  supplier: Row[];
  bomLineChange: Row[];
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
      const inserted = vals.map((v) => ({ id: `id-${++t.seq}`, isActive: true, ...v }));
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
    let vals: Row = {};
    let pred: (r: Row) => boolean = () => true;
    const run = () => {
      const hit = arr(table).filter(pred);
      for (const r of hit) Object.assign(r, vals);
      return hit.map((r) => ({ ...r }));
    };
    const b = {
      set(v: Row) {
        vals = v;
        return b;
      },
      where(p: (r: Row) => boolean) {
        pred = p;
        return b;
      },
      returning() {
        return Promise.resolve(run());
      },
      then(resolve: (v: undefined) => void) {
        run();
        resolve(undefined);
      },
    };
    return b;
  }
  // execute: nhận diện các truy vấn thô của service qua text + tham số.
  const execute = vi.fn(async (q: { queryChunks: unknown[] }) => {
    // StringChunk = object có value là mảng chuỗi; còn lại là tham số (nguyên thuỷ hoặc Param).
    const isStr = (c: unknown): c is { value: string[] } =>
      typeof c === "object" && c !== null && Array.isArray((c as { value?: unknown }).value);
    const text = q.queryChunks.map((c) => (isStr(c) ? c.value.join("") : "?")).join("");
    const params = q.queryChunks
      .filter((c) => !isStr(c))
      .map((c) => (typeof c === "object" && c !== null && "value" in c ? (c as { value: unknown }).value : c));
    if (text.includes("lower(btrim(name))")) {
      const needle = String(params[0]).trim().toLowerCase();
      return t.supplier.filter(
        (s) => String(s.name).trim().toLowerCase() === needle && s.isActive !== false,
      );
    }
    if (text.includes("FROM app.bom_line_change c")) {
      const lineId = params[0];
      const rows = t.bomLineChange.filter((c) => c.lineId === lineId).reverse();
      return text.includes("LIMIT 1")
        ? rows.slice(0, 1).map((c) => ({ by: "Hùng", at: c.at ?? new Date() }))
        : rows.map((c) => ({ ...c, actorName: "Hùng", at: c.at ?? new Date() }));
    }
    return [];
  });
  const tx = { select, insert, update, execute };
  return { ...tx, transaction: async <T,>(fn: (h: typeof tx) => Promise<T>) => fn(tx) };
}

const S_OLD = "11111111-1111-4111-8111-111111111111";
const S_NEW = "22222222-2222-4222-8222-222222222222";
const URL_BASE = "http://localhost/api/bom/templates/T1/lines/L1/supplier";
const params = { id: "T1", lid: "L1" };

async function setup(opts: { roles?: string[] } = {}) {
  vi.resetModules();
  const schema = await import("@iot/db/schema");
  const { can } = await import("@iot/shared");
  const tables: Tables = { bomLine: [], supplier: [], bomLineChange: [], seq: 0 };
  const fakeDb = createFakeDb(
    tables,
    { bomLine: schema.bomLine, supplier: schema.supplier, bomLineChange: schema.bomLineChange },
    schema as unknown as Record<string, unknown>,
  );
  const requireCan = vi.fn(async (_req: unknown, action: string, entity: string) => {
    const roles = (opts.roles ?? ["operator"]) as never;
    if (!can(roles, action as never, entity as never)) {
      const { NextResponse } = await import("next/server");
      return { response: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
    }
    return {
      session: { userId: "u-1", username: "viewer", fullName: "Viewer", roles, sessionId: null },
    };
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
  const route = await import("./[id]/lines/[lid]/supplier/route");
  const history = await import("./[id]/lines/[lid]/history/route");
  return { tables, route, history, requireCan };
}

function seedLine(t: Tables, over: Row = {}) {
  t.supplier.push(
    { id: S_OLD, code: "NCC-OLD", name: "Cũ", needsReview: false, isActive: true },
    { id: S_NEW, code: "NCC-NEW", name: "Misumi", needsReview: false, isActive: true },
  );
  t.bomLine.push({
    id: "L1",
    templateId: "T1",
    supplierId: S_OLD,
    supplierPending: null,
    rowVersion: 3,
    metadata: { sourcing: { supplierId: S_OLD, supplierName: "Cũ", leadTimeDays: 7 } },
    ...over,
  });
}

const patch = (route: { PATCH: (r: NextRequest, c: never) => Promise<Response> }, body: unknown) =>
  route.PATCH(
    new NextRequest(URL_BASE, { method: "PATCH", body: JSON.stringify(body) }),
    { params } as never,
  );

afterEach(() => vi.clearAllMocks());

describe("PATCH .../lines/[lid]/supplier", () => {
  it("user role chỉ-xem (operator) sửa được; gate = read bomTemplate", async () => {
    const { tables, route, requireCan } = await setup({ roles: ["operator"] });
    seedLine(tables);
    const res = await patch(route, { supplierId: S_NEW, expectedVersion: 3 });
    expect(res.status).toBe(200);
    expect(requireCan).toHaveBeenCalledWith(expect.anything(), "read", "bomTemplate");
    const { can } = await import("@iot/shared");
    expect(can(["operator"], "update", "bomTemplate")).toBe(false); // đúng là chỉ-xem
  });

  it("role không có quyền đọc BOM → 403, không ghi", async () => {
    const { tables, route } = await setup({ roles: [] });
    seedLine(tables);
    const res = await patch(route, { supplierId: S_NEW });
    expect(res.status).toBe(403);
    expect(tables.bomLine[0]!.supplierId).toBe(S_OLD);
  });

  it("409 VERSION_CONFLICT khi expectedVersion lệch, kèm current, không ghi gì", async () => {
    const { tables, route } = await setup();
    seedLine(tables);
    tables.bomLineChange.push({ lineId: "L1", field: "supplier", at: new Date() });
    const res = await patch(route, { supplierId: S_NEW, expectedVersion: 2 });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("VERSION_CONFLICT");
    expect(body.current).toMatchObject({
      rowVersion: 3,
      supplier: { id: S_OLD, name: "Cũ" },
      changedBy: "Hùng",
    });
    expect(tables.bomLine[0]!.supplierId).toBe(S_OLD);
    expect(tables.bomLine[0]!.rowVersion).toBe(3);
    expect(tables.bomLineChange).toHaveLength(1); // chỉ dòng seed
  });

  it("thành công: row_version+1, ghi bom_line_change {old,new,actor}, đồng bộ metadata.sourcing", async () => {
    const { tables, route } = await setup();
    seedLine(tables);
    const res = await patch(route, { supplierId: S_NEW, expectedVersion: 3 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.line.rowVersion).toBe(4);
    const line = tables.bomLine[0]!;
    expect(line.supplierId).toBe(S_NEW);
    expect(line.rowVersion).toBe(4);
    expect(line.metadata).toMatchObject({
      sourcing: {
        supplierId: S_NEW,
        supplierName: "Misumi",
        supplierCode: "NCC-NEW",
        leadTimeDays: 7,
      },
    });
    expect(tables.bomLineChange).toHaveLength(1);
    expect(tables.bomLineChange[0]).toMatchObject({
      lineId: "L1",
      templateId: "T1",
      field: "supplier",
      oldValue: { id: S_OLD, name: "Cũ" },
      newValue: { id: S_NEW, name: "Misumi" },
      actorId: "u-1",
    });
  });

  it("client cũ không gửi expectedVersion vẫn ghi được", async () => {
    const { tables, route } = await setup();
    seedLine(tables);
    const res = await patch(route, { supplierId: S_NEW });
    expect(res.status).toBe(200);
    expect(tables.bomLine[0]!.rowVersion).toBe(4);
  });

  it("cùng NCC → không đổi, không bump version, không log", async () => {
    const { tables, route } = await setup();
    seedLine(tables);
    const res = await patch(route, { supplierId: S_OLD, expectedVersion: 3 });
    expect(res.status).toBe(200);
    expect((await res.json()).data.changed).toBe(false);
    expect(tables.bomLine[0]!.rowVersion).toBe(3);
    expect(tables.bomLineChange).toHaveLength(0);
  });

  it("tạo NCC mới ngay từ ô: needs_review=true, code NCC-xxxxxx, gắn vào dòng trong cùng tx", async () => {
    const { tables, route } = await setup();
    seedLine(tables);
    const res = await patch(route, { newSupplier: { name: "  Công ty ABC  " }, expectedVersion: 3 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.createdSupplier).toBe(true);
    const created = tables.supplier.find((s) => s.name === "Công ty ABC")!;
    expect(created).toBeTruthy();
    expect(created.needsReview).toBe(true);
    expect(String(created.code)).toMatch(/^NCC-[0-9A-F]{6}$/);
    expect(tables.bomLine[0]!.supplierId).toBe(created.id);
    expect(tables.bomLineChange[0]!.newValue).toMatchObject({ id: created.id, name: "Công ty ABC" });
  });

  it("newSupplier trùng tên NCC có sẵn (không phân biệt hoa/thường) → dùng lại, không tạo thêm", async () => {
    const { tables, route } = await setup();
    seedLine(tables);
    const before = tables.supplier.length;
    const res = await patch(route, { newSupplier: { name: "MISUMI" } });
    expect(res.status).toBe(200);
    expect((await res.json()).data.createdSupplier).toBe(false);
    expect(tables.supplier).toHaveLength(before);
    expect(tables.bomLine[0]!.supplierId).toBe(S_NEW);
  });

  it("dòng supplier_pending: chọn 1 NCC → supplier_pending=NULL, log giữ text gốc", async () => {
    const { tables, route } = await setup();
    seedLine(tables, { supplierId: null, supplierPending: "Tân Tiến/Phạm Gia", metadata: {} });
    const res = await patch(route, { supplierId: S_NEW, expectedVersion: 3 });
    expect(res.status).toBe(200);
    const line = tables.bomLine[0]!;
    expect(line.supplierId).toBe(S_NEW);
    expect(line.supplierPending).toBeNull();
    expect(tables.bomLineChange[0]!.oldValue).toMatchObject({
      id: null,
      pending: "Tân Tiến/Phạm Gia",
    });
  });

  it("dòng chỉ có NCC trong metadata.sourcing: old value đọc qua fallback", async () => {
    const { tables, route } = await setup();
    seedLine(tables, { supplierId: null, metadata: { sourcing: { supplierId: S_OLD } } });
    await patch(route, { supplierId: S_NEW });
    expect(tables.bomLineChange[0]!.oldValue).toMatchObject({ id: S_OLD, name: "Cũ" });
  });

  it("NCC không tồn tại / ngừng → 422; dòng sai template → 404; body thiếu → 422", async () => {
    const { tables, route } = await setup();
    seedLine(tables);
    expect(
      (await patch(route, { supplierId: "7b1f0f5e-0000-4000-8000-000000000000" })).status,
    ).toBe(422);
    const wrong = await route.PATCH(
      new NextRequest(URL_BASE, { method: "PATCH", body: JSON.stringify({ supplierId: null }) }),
      { params: { id: "T1", lid: "NOPE" } } as never,
    );
    expect(wrong.status).toBe(404);
    expect((await patch(route, {})).status).toBe(422);
  });

  it("NCC đã ngừng hoạt động → 422", async () => {
    const { tables, route } = await setup();
    seedLine(tables);
    tables.supplier.push({
      id: "3f2b5a76-1111-4222-8333-444444444444",
      code: "X",
      name: "Ngừng",
      needsReview: false,
      isActive: false,
    });
    const res = await patch(route, { supplierId: "3f2b5a76-1111-4222-8333-444444444444" });
    expect(res.status).toBe(422);
  });

  it("bỏ chọn (supplierId=null) xoá khoá NCC trong sourcing, giữ pending", async () => {
    const { tables, route } = await setup();
    seedLine(tables, { supplierPending: "A/B" });
    const res = await patch(route, { supplierId: null });
    expect(res.status).toBe(200);
    const line = tables.bomLine[0]!;
    expect(line.supplierId).toBeNull();
    expect(line.supplierPending).toBe("A/B");
    expect((line.metadata as { sourcing: Row }).sourcing).toEqual({ leadTimeDays: 7 });
  });
});

describe("GET .../lines/[lid]/history", () => {
  it("trả lịch sử của dòng cho user chỉ-xem", async () => {
    const { tables, route, history } = await setup();
    seedLine(tables);
    await patch(route, { supplierId: S_NEW });
    const res = await history.GET(
      new NextRequest("http://localhost/api/bom/templates/T1/lines/L1/history"),
      { params } as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ field: "supplier", actorName: "Hùng" });
  });
});
