/**
 * Vitest cho `cloneTemplate` (V4.2 PERF_REDUNDANCY.md #5) — trước đây INSERT
 * từng dòng BOM tuần tự (N round-trip / N dòng), sửa thành batch insert theo
 * TỪNG LEVEL (cha luôn insert trước, `level = parent.level + 1` — xem
 * `bomLines.ts` `resolveLevel`). Test này kiểm chứng đúng chuỗi cha/con
 * (`parentLineId` map old→new) và `lineCount` không đổi sau khi batch hoá,
 * theo đúng pattern FakeDb in-memory của `goodsIssues.test.ts` (không có
 * Postgres thật trong CI).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

interface Tables {
  bomTemplate: Row[];
  bomSheet: Row[];
  bomLine: Row[];
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

  const tx = { select, insert, execute: vi.fn() };
  return {
    ...tx,
    transaction: async <T>(fn: (h: typeof tx) => Promise<T>) => fn(tx),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

async function loadWithFakeDb() {
  vi.resetModules();
  const schema = await import("@iot/db/schema");
  const tables: Tables = { bomTemplate: [], bomSheet: [], bomLine: [], seq: 0 };
  const fakeDb = createFakeDb(
    tables,
    {
      bomTemplate: schema.bomTemplate,
      bomSheet: schema.bomSheet,
      bomLine: schema.bomLine,
    },
    schema as unknown as Record<string, unknown>,
  );

  vi.doMock("@/lib/db", () => ({ db: fakeDb }));
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

  const repo = await import("./bomTemplates");
  return { repo, tables };
}

function seedSource(tables: Tables) {
  tables.bomTemplate.push({
    id: "src-1",
    code: "BOM-SRC",
    name: "BOM nguồn",
    description: "desc",
    parentItemId: "item-parent",
    targetQty: "10",
    status: "ACTIVE",
    metadata: {},
  });
  tables.bomSheet.push({
    id: "sheet-1",
    templateId: "src-1",
    name: "Sheet 1",
    kind: "PROJECT",
    position: 1,
    metadata: {},
  });
  // Cây: L1 (root) → L2, L3 (con L1) → L4 (con L2). Dùng componentItemId để
  // nhận diện lại dòng sau khi clone (test không truy cập idMap nội bộ).
  tables.bomLine.push(
    {
      id: "L1",
      templateId: "src-1",
      sheetId: "sheet-1",
      parentLineId: null,
      componentItemId: "item-A",
      level: 1,
      position: 1,
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "cái",
      description: "Line A",
      supplierItemCode: null,
      metadata: {},
    },
    {
      id: "L2",
      templateId: "src-1",
      sheetId: "sheet-1",
      parentLineId: "L1",
      componentItemId: "item-B",
      level: 2,
      position: 1,
      qtyPerParent: "2",
      scrapPercent: "0",
      uom: "cái",
      description: "Line B",
      supplierItemCode: null,
      metadata: {},
    },
    {
      id: "L3",
      templateId: "src-1",
      sheetId: "sheet-1",
      parentLineId: "L1",
      componentItemId: "item-C",
      level: 2,
      position: 2,
      qtyPerParent: "3",
      scrapPercent: "0",
      uom: "cái",
      description: "Line C",
      supplierItemCode: null,
      metadata: {},
    },
    {
      id: "L4",
      templateId: "src-1",
      sheetId: "sheet-1",
      parentLineId: "L2",
      componentItemId: "item-D",
      level: 3,
      position: 1,
      qtyPerParent: "4",
      scrapPercent: "0",
      uom: "cái",
      description: "Line D",
      supplierItemCode: null,
      metadata: {},
    },
  );
}

describe("cloneTemplate — batch insert theo level", () => {
  it("clone đúng 4 dòng, giữ nguyên cây cha/con qua idMap", async () => {
    const { repo, tables } = await loadWithFakeDb();
    seedSource(tables);

    const result = await repo.cloneTemplate("src-1", "BOM-NEW", "BOM bản sao", "user-1");

    expect(result).not.toBeNull();
    expect(result?.lineCount).toBe(4);

    const newTemplateId = result!.template.id;
    const clonedLines = tables.bomLine.filter((r) => r.templateId === newTemplateId);
    expect(clonedLines).toHaveLength(4);

    const byComponent = new Map(clonedLines.map((r) => [r.componentItemId as string, r]));
    const newA = byComponent.get("item-A")!;
    const newB = byComponent.get("item-B")!;
    const newC = byComponent.get("item-C")!;
    const newD = byComponent.get("item-D")!;

    // Root vẫn không cha.
    expect(newA.parentLineId).toBeNull();
    // B, C đều là con của A (id MỚI, không phải "L1" cũ).
    expect(newB.parentLineId).toBe(newA.id);
    expect(newC.parentLineId).toBe(newA.id);
    // D là con của B.
    expect(newD.parentLineId).toBe(newB.id);

    // Không còn id cũ nào lọt vào bản clone.
    for (const row of clonedLines) {
      expect(["L1", "L2", "L3", "L4"]).not.toContain(row.id);
    }

    // Level/qty giữ nguyên theo dòng nguồn.
    expect(newA.level).toBe(1);
    expect(newB.level).toBe(2);
    expect(newD.level).toBe(3);
    expect(newD.qtyPerParent).toBe("4");
  });

  it("trả về null nếu template nguồn không tồn tại", async () => {
    const { repo } = await loadWithFakeDb();
    const result = await repo.cloneTemplate("khong-ton-tai", "BOM-X", null, "user-1");
    expect(result).toBeNull();
  });
});
