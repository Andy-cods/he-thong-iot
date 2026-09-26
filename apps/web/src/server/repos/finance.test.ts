/**
 * Vitest cho phân hệ Tài chính (TASK-20260922-001, Phase B) — tập trung vào
 * BẤT BIẾN CHỐNG ĐẾM TRÙNG "tổng đã thu/đã chi" (xem
 * plans/v4-finance/wave-2-finance.md §C.2 + comment đầu file `finPayments.ts`).
 *
 * Không có DB thật trong CI (`pnpm test` chạy vitest thuần, không spin
 * Postgres) — theo đúng pattern `rbac.test.ts` (mock `@/lib/db`), ta mock
 * một fluent query-builder giả lập đủ các chain mà `finPayments.ts` /
 * `finInvoices.ts` dùng (select/from/where/for/limit/insert/values/returning/
 * update/set/delete) để test được LOGIC THẬT của `createPaymentWithAllocations`
 * (không phải chỉ pure function tách rời) — đây là cách kiểm chứng chắc chắn
 * nhất rằng bước (e) "insert đúng 1 fin_transaction / allocation" không bao
 * giờ bị bỏ sót, đúng yêu cầu brief "viết vitest kiểm chứng ràng buộc double-
 * count, nếu không mock được DB thì test phần logic thuần".
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// ----------------------------------------------------------------------------
// In-memory fake "database" — đủ để chạy qua toàn bộ createPaymentWithAllocations
// và voidPaymentWithAllocations mà không cần Postgres thật.
// ----------------------------------------------------------------------------
interface FakeRow {
  [key: string]: unknown;
}

function makeId(prefix: string, n: number) {
  return `${prefix}-${n}`;
}

class FakeTables {
  finAccount: FakeRow[] = [];
  finInvoice: FakeRow[] = [];
  finPayment: FakeRow[] = [];
  finPaymentAllocation: FakeRow[] = [];
  finTransaction: FakeRow[] = [];
  seq = 0;
  nextId(prefix: string) {
    this.seq += 1;
    return makeId(prefix, this.seq);
  }
}

/**
 * Query builder giả — nhận diện bảng đích qua so sánh tham chiếu (Drizzle
 * table object thật từ `@iot/db/schema`) rồi thao tác trực tiếp trên mảng
 * tương ứng trong `FakeTables`. Đủ hỗ trợ các method mà repo thực tế gọi.
 */
function createFakeDb(
  tables: FakeTables,
  namedTables: {
    finAccount: unknown;
    finInvoice: unknown;
    finPayment: unknown;
    finPaymentAllocation: unknown;
    finTransaction: unknown;
  },
  schema: Record<string, unknown>,
) {
  function tableArrayFor(table: unknown): FakeRow[] {
    if (table === namedTables.finAccount) return tables.finAccount;
    if (table === namedTables.finInvoice) return tables.finInvoice;
    if (table === namedTables.finPayment) return tables.finPayment;
    if (table === namedTables.finPaymentAllocation) return tables.finPaymentAllocation;
    if (table === namedTables.finTransaction) return tables.finTransaction;
    throw new Error("FakeDb: bảng không được hỗ trợ trong test");
  }

  function tablePrefixFor(table: unknown): string {
    if (table === namedTables.finPayment) return "payment";
    if (table === namedTables.finPaymentAllocation) return "alloc";
    if (table === namedTables.finTransaction) return "txn";
    return "row";
  }

  // where predicate được biểu diễn đơn giản bằng closure filter (bỏ qua cú
  // pháp SQL thật — repo test tự dựng predicate tương ứng bằng helper dưới).
  //
  // `cols` (nếu có) là object { alias: column | SQL } giống drizzle `.select({...})`.
  // LƯU Ý: Drizzle column.name là tên cột DB (snake_case, vd "total_amount"),
  // KHÔNG phải property key JS ("totalAmount") — fake row của ta dùng key JS
  // (giống object insert trong repo thật), nên KHÔNG dùng `col.name` để tra
  // cứu. Thay vào đó, so khớp column object bằng reference với từng field của
  // bảng schema thật (`schema.finXxx`) để tìm đúng property key JS tương ứng.
  //
  // Ta chỉ cần hỗ trợ 2 dạng dùng trong finInvoices.ts/finPayments.ts:
  //  - alias -> column thật (đối chiếu reference) → project trực tiếp field đó.
  //  - alias 'paid' trên bảng finPaymentAllocation (coalesce(sum(amount))) →
  //    tính SUM(amount) của các row đã lọc, coi như 1 aggregate row duy nhất.
  function jsKeyForColumn(col: unknown): string | null {
    for (const table of Object.values(schema)) {
      if (!table || typeof table !== "object") continue;
      for (const [key, val] of Object.entries(table as Record<string, unknown>)) {
        if (val === col) return key;
      }
    }
    return null;
  }

  function select(cols?: Record<string, unknown>) {
    let filterFn: ((row: FakeRow) => boolean) | null = null;
    let sourceTable: unknown;

    function project(rows: FakeRow[]): FakeRow[] {
      if (!cols) return rows;
      const isAggregate = Object.keys(cols).some(
        (k) => k === "paid" || k === "count" || k === "cnt",
      );
      if (isAggregate) {
        // Aggregate giả lập: "paid"/"count" luôn coalesce(sum|count) trên rows đã lọc.
        const agg: FakeRow = {};
        if ("paid" in cols) {
          agg.paid = String(rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0));
        }
        if ("count" in cols || "cnt" in cols) {
          const key = "count" in cols ? "count" : "cnt";
          agg[key] = rows.length;
        }
        return [agg];
      }
      return rows.map((row) => {
        const projected: FakeRow = {};
        for (const [alias, col] of Object.entries(cols)) {
          const key = jsKeyForColumn(col) ?? alias;
          projected[alias] = row[key];
        }
        return projected;
      });
    }

    const builder = {
      from(table: unknown) {
        sourceTable = table;
        return builder;
      },
      where(fn: ((row: FakeRow) => boolean) | undefined) {
        filterFn = fn ?? null;
        return builder;
      },
      for(_mode: string) {
        return builder;
      },
      limit(n: number) {
        const rows = tableArrayFor(sourceTable).filter((r) => (filterFn ? filterFn(r) : true));
        return Promise.resolve(project(rows).slice(0, n));
      },
      orderBy() {
        return builder;
      },
      offset() {
        return builder;
      },
      // Khi không gọi .limit(), builder tự resolve như 1 Promise (await trực
      // tiếp) — mô phỏng drizzle-orm cho phép await query builder.
      then(resolve: (rows: FakeRow[]) => void) {
        const rows = tableArrayFor(sourceTable).filter((r) => (filterFn ? filterFn(r) : true));
        resolve(project(rows));
      },
    };
    return builder;
  }

  function insert(table: unknown) {
    const arr = tableArrayFor(table);
    const prefix = tablePrefixFor(table);
    let toInsert: FakeRow[] = [];
    const builder = {
      values(v: FakeRow | FakeRow[]) {
        toInsert = Array.isArray(v) ? v : [v];
        return builder;
      },
      returning() {
        const inserted = toInsert.map((row) => ({ id: tables.nextId(prefix), ...row }));
        arr.push(...inserted);
        return Promise.resolve(inserted);
      },
      then(resolve: (v: undefined) => void) {
        const inserted = toInsert.map((row) => ({ id: tables.nextId(prefix), ...row }));
        arr.push(...inserted);
        resolve(undefined);
      },
    };
    return builder;
  }

  function update(table: unknown) {
    const arr = tableArrayFor(table);
    let patch: FakeRow = {};
    let filterFn: ((row: FakeRow) => boolean) | null = null;
    const builder = {
      set(p: FakeRow) {
        patch = p;
        return builder;
      },
      where(fn: ((row: FakeRow) => boolean) | undefined) {
        filterFn = fn ?? null;
        return builder;
      },
      returning() {
        const affected: FakeRow[] = [];
        for (const row of arr) {
          if (!filterFn || filterFn(row)) {
            Object.assign(row, patch);
            affected.push(row);
          }
        }
        return Promise.resolve(affected);
      },
      then(resolve: (v: undefined) => void) {
        for (const row of arr) {
          if (!filterFn || filterFn(row)) Object.assign(row, patch);
        }
        resolve(undefined);
      },
    };
    return builder;
  }

  function del(table: unknown) {
    const arr = tableArrayFor(table);
    let filterFn: ((row: FakeRow) => boolean) | null = null;
    const builder = {
      where(fn: ((row: FakeRow) => boolean) | undefined) {
        filterFn = fn ?? null;
        const kept = arr.filter((r) => (filterFn ? !filterFn(r) : false));
        const removedCount = arr.length - kept.length;
        arr.length = 0;
        arr.push(...kept);
        return Promise.resolve({ rowCount: removedCount });
      },
    };
    return builder;
  }

  const txHandle = { select, insert, update, delete: del, execute: vi.fn() };

  return {
    select,
    insert,
    update,
    delete: del,
    transaction: async (fn: (tx: typeof txHandle) => Promise<unknown>) => fn(txHandle),
  };
}

// ----------------------------------------------------------------------------
// Setup mocks — @/lib/db trỏ vào fakeDb; genDocNo trả mã tuần tự đơn giản
// (bỏ qua advisory lock thật, không cần thiết trong unit test đơn luồng).
// ----------------------------------------------------------------------------
let fakeTables: FakeTables;
let docNoSeq = 0;

afterEach(() => {
  vi.clearAllMocks();
  docNoSeq = 0;
});

/**
 * Helper: dựng lại module `finPayments`/`finInvoices` với 1 fakeDb mới cho mỗi
 * test — vì `db.transaction` được import 1 lần lúc module load, ta cần
 * `vi.resetModules()` + re-mock `@/lib/db` mỗi lần để trỏ đúng fakeDb instance.
 */
async function loadReposWithFreshDb() {
  vi.resetModules();
  docNoSeq = 0;
  const schema = await import("@iot/db/schema");
  fakeTables = new FakeTables();
  const fakeDb = createFakeDb(
    fakeTables,
    {
      finAccount: schema.finAccount,
      finInvoice: schema.finInvoice,
      finPayment: schema.finPayment,
      finPaymentAllocation: schema.finPaymentAllocation,
      finTransaction: schema.finTransaction,
    },
    schema as unknown as Record<string, unknown>,
  );

  vi.doMock("@/lib/db", () => ({ db: fakeDb }));
  vi.doMock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  }));
  vi.doMock("./_docNumber", () => ({
    genDocNo: vi.fn(async (_tx: unknown, opts: { prefix: string; pad?: number }) => {
      docNoSeq += 1;
      return `${opts.prefix}-${String(docNoSeq).padStart(opts.pad ?? 4, "0")}`;
    }),
    currentYymm: () => "2609",
  }));

  // Mock các operator drizzle-orm dùng bởi finPayments/finInvoices để trả về
  // PREDICATE FUNCTION thuần (row) => boolean thay vì cây SQL thật — khớp với
  // cách FakeDb.where() ở trên diễn giải điều kiện. Giữ nguyên `sql` tag +
  // các export khác (không dùng trong 2 file này ở path được test).
  //
  // LƯU Ý quan trọng: dùng chung `jsKeyForColumn` (tra theo reference trong
  // schema thật) để map column → JS property key, TUYỆT ĐỐI KHÔNG dùng
  // `col.name` (đó là tên cột DB snake_case như "invoice_id", trong khi fake
  // row dùng key JS "invoiceId" giống hệt input insert của repo thật).
  vi.doMock("drizzle-orm", async () => {
    const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
    const schemaForOps = await import("@iot/db/schema");
    function keyFor(col: unknown): string {
      for (const table of Object.values(schemaForOps)) {
        if (!table || typeof table !== "object") continue;
        for (const [key, val] of Object.entries(table as Record<string, unknown>)) {
          if (val === col) return key;
        }
      }
      throw new Error("FakeDb drizzle-orm mock: không tìm thấy JS key cho column");
    }
    return {
      ...actual,
      eq: (col: unknown, val: unknown) => (row: FakeRow) => row[keyFor(col)] === val,
      inArray: (col: unknown, vals: unknown[]) => (row: FakeRow) =>
        vals.includes(row[keyFor(col)]),
      and: (...preds: Array<(row: FakeRow) => boolean>) => (row: FakeRow) =>
        preds.every((p) => p(row)),
      or: (...preds: Array<(row: FakeRow) => boolean>) => (row: FakeRow) =>
        preds.some((p) => p(row)),
      gte: (col: unknown, val: unknown) => (row: FakeRow) =>
        (row[keyFor(col)] as string) >= (val as string),
      lte: (col: unknown, val: unknown) => (row: FakeRow) =>
        (row[keyFor(col)] as string) <= (val as string),
      isNull: (col: unknown) => (row: FakeRow) => row[keyFor(col)] == null,
      isNotNull: (col: unknown) => (row: FakeRow) => row[keyFor(col)] != null,
      desc: (col: unknown) => col,
      asc: (col: unknown) => col,
    };
  });

  const finInvoicesRepo = await import("./finInvoices");
  const finPaymentsRepo = await import("./finPayments");
  const { db: fakeDbFromMock } = await import("@/lib/db");
  return { finInvoicesRepo, finPaymentsRepo, schema, fakeTables, fakeDb: fakeDbFromMock };
}

function seedInvoice(
  tables: FakeTables,
  overrides: Partial<{
    id: string;
    totalAmount: string;
    paidAmount: string;
    status: string;
    dueDate: string | null;
    direction: "IN" | "OUT";
  }> = {},
) {
  const row = {
    id: overrides.id ?? tables.nextId("invoice"),
    invoiceNo: "HD-001",
    direction: overrides.direction ?? "IN",
    supplierId: null,
    purchaseOrderId: null,
    salesOrderId: null,
    issueDate: "2026-09-01",
    dueDate: overrides.dueDate ?? "2026-10-01",
    subtotalAmount: "1000000",
    vatRate: "8",
    vatAmount: "80000",
    totalAmount: overrides.totalAmount ?? "1080000",
    paidAmount: overrides.paidAmount ?? "0",
    status: overrides.status ?? "UNPAID",
    notes: null,
    attachmentUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
  };
  tables.finInvoice.push(row);
  return row;
}

describe("createPaymentWithAllocations — chiều thanh toán vs chiều hoá đơn", () => {
  it("CHI (OUT) phân bổ vào hoá đơn BÁN (OUT) → từ chối, không ghi gì", async () => {
    const { finPaymentsRepo, fakeTables: tables } = await loadReposWithFreshDb();
    const inv = seedInvoice(tables, { totalAmount: "500000", direction: "OUT" });

    await expect(
      finPaymentsRepo.createPaymentWithAllocations(
        {
          direction: "OUT",
          accountId: "acc-1",
          supplierId: null,
          paymentDate: new Date("2026-09-22"),
          totalAmount: 500_000,
          method: "BANK_TRANSFER",
          referenceNo: null,
          notes: null,
          allocations: [{ invoiceId: inv.id as string, amount: 500_000 }],
        },
        "user-1",
      ),
    ).rejects.toThrow(/FIN_PAYMENT_DIRECTION_MISMATCH/);
    expect(tables.finPayment).toHaveLength(0);
    expect(tables.finTransaction).toHaveLength(0);
  });

  it("THU (IN) phân bổ vào hoá đơn BÁN (OUT) → hợp lệ", async () => {
    const { finPaymentsRepo, fakeTables: tables } = await loadReposWithFreshDb();
    const inv = seedInvoice(tables, { totalAmount: "500000", direction: "OUT" });

    const result = await finPaymentsRepo.createPaymentWithAllocations(
      {
        direction: "IN",
        accountId: "acc-1",
        supplierId: null,
        paymentDate: new Date("2026-09-22"),
        totalAmount: 500_000,
        method: "BANK_TRANSFER",
        referenceNo: null,
        notes: null,
        allocations: [{ invoiceId: inv.id as string, amount: 500_000 }],
      },
      "user-1",
    );
    expect(result.allocations).toHaveLength(1);
  });
});

describe("createPaymentWithAllocations — chống đếm trùng (§C.2)", () => {
  it("payment với 2 allocation cho 2 invoice khác nhau → sinh ĐÚNG 2 fin_transaction, không phải 1 hoặc 3", async () => {
    const { finPaymentsRepo, fakeTables: tables } = await loadReposWithFreshDb();
    const inv1 = seedInvoice(tables, { totalAmount: "500000" });
    const inv2 = seedInvoice(tables, { totalAmount: "700000" });

    const result = await finPaymentsRepo.createPaymentWithAllocations(
      {
        direction: "OUT",
        accountId: "acc-1",
        supplierId: null,
        paymentDate: new Date("2026-09-22"),
        totalAmount: 1_200_000,
        method: "BANK_TRANSFER",
        referenceNo: null,
        notes: null,
        allocations: [
          { invoiceId: inv1.id as string, amount: 500_000 },
          { invoiceId: inv2.id as string, amount: 700_000 },
        ],
      },
      "user-1",
    );

    expect(result.allocations).toHaveLength(2);
    // Bất biến cốt lõi: đúng 2 fin_transaction — không double-insert, không thiếu.
    expect(tables.finTransaction).toHaveLength(2);
    expect(tables.finPayment).toHaveLength(1);

    // SUM(fin_transaction.amount) phải khớp SUM(fin_payment_allocation.amount)
    // khớp fin_payment.totalAmount — đây chính là assertion "không double-count".
    const sumTransactions = tables.finTransaction.reduce(
      (acc, t) => acc + Number(t.amount),
      0,
    );
    const sumAllocations = tables.finPaymentAllocation.reduce(
      (acc, a) => acc + Number(a.amount),
      0,
    );
    expect(sumTransactions).toBe(sumAllocations);
    expect(sumTransactions).toBe(Number(tables.finPayment[0]?.totalAmount));

    // Mỗi transaction PHẢI có paymentId trỏ đúng về payment vừa tạo.
    for (const t of tables.finTransaction) {
      expect(t.paymentId).toBe(result.payment.id);
    }

    // Đồng thời invoice paidAmount/status phải được recalc đúng (PAID vì trả đủ).
    const updatedInv1 = tables.finInvoice.find((r) => r.id === inv1.id);
    const updatedInv2 = tables.finInvoice.find((r) => r.id === inv2.id);
    expect(updatedInv1?.status).toBe("PAID");
    expect(updatedInv2?.status).toBe("PAID");
  });

  it("KHÔNG cho phép tính 'tổng đã chi' bằng cách cộng fin_payment.totalAmount SONG SONG với fin_transaction — mô phỏng lỗi double-count nếu ai đó làm sai", async () => {
    const { finPaymentsRepo, fakeTables: tables } = await loadReposWithFreshDb();
    const inv1 = seedInvoice(tables, { totalAmount: "300000" });

    await finPaymentsRepo.createPaymentWithAllocations(
      {
        direction: "OUT",
        accountId: "acc-1",
        supplierId: null,
        paymentDate: new Date("2026-09-22"),
        totalAmount: 300_000,
        method: "CASH",
        referenceNo: null,
        notes: null,
        allocations: [{ invoiceId: inv1.id as string, amount: 300_000 }],
      },
      "user-1",
    );

    // Nguồn sự thật DUY NHẤT: SUM(fin_transaction).
    const correctTotal = tables.finTransaction.reduce((acc, t) => acc + Number(t.amount), 0);
    // Cách SAI (double-count): cộng thêm fin_payment.totalAmount song song.
    const wrongDoubleCountedTotal =
      correctTotal + tables.finPayment.reduce((acc, p) => acc + Number(p.totalAmount), 0);

    expect(correctTotal).toBe(300_000);
    // Chứng minh cách tính sai sẽ ra gấp đôi — đúng như cảnh báo §C.2.
    expect(wrongDoubleCountedTotal).toBe(600_000);
    expect(wrongDoubleCountedTotal).not.toBe(correctTotal);
  });

  it("chặn tạo payment khi SUM(allocations) !== totalAmount (phòng thủ lại ở repo, không tin mù zod)", async () => {
    const { finPaymentsRepo, fakeTables: tables } = await loadReposWithFreshDb();
    const inv1 = seedInvoice(tables, { totalAmount: "1000000" });

    await expect(
      finPaymentsRepo.createPaymentWithAllocations(
        {
          direction: "OUT",
          accountId: "acc-1",
          supplierId: null,
          paymentDate: new Date("2026-09-22"),
          totalAmount: 1_000_000,
          method: "CASH",
          referenceNo: null,
          notes: null,
          // Cố tình sai lệch nhiều hơn ±1đ cho phép.
          allocations: [{ invoiceId: inv1.id as string, amount: 900_000 }],
        },
        "user-1",
      ),
    ).rejects.toThrow("FIN_PAYMENT_ALLOCATION_SUM_MISMATCH");

    // Không có gì được ghi khi validate fail.
    expect(tables.finPayment).toHaveLength(0);
    expect(tables.finTransaction).toHaveLength(0);
  });

  it("chặn allocation vượt quá số còn nợ của hoá đơn", async () => {
    const { finPaymentsRepo, fakeTables: tables } = await loadReposWithFreshDb();
    const inv1 = seedInvoice(tables, { totalAmount: "500000", paidAmount: "400000" });

    await expect(
      finPaymentsRepo.createPaymentWithAllocations(
        {
          direction: "OUT",
          accountId: "acc-1",
          supplierId: null,
          paymentDate: new Date("2026-09-22"),
          totalAmount: 200_000,
          method: "CASH",
          referenceNo: null,
          notes: null,
          // Còn nợ chỉ 100k nhưng cố phân bổ 200k.
          allocations: [{ invoiceId: inv1.id as string, amount: 200_000 }],
        },
        "user-1",
      ),
    ).rejects.toThrow(/FIN_PAYMENT_ALLOCATION_EXCEEDS_REMAINING/);
  });

  it("partial payment 2 đợt cho 1 invoice → status PARTIAL rồi PAID, paidAmount cộng dồn đúng", async () => {
    const { finPaymentsRepo, fakeTables: tables } = await loadReposWithFreshDb();
    const inv1 = seedInvoice(tables, { totalAmount: "1000000" });

    await finPaymentsRepo.createPaymentWithAllocations(
      {
        direction: "OUT",
        accountId: "acc-1",
        supplierId: null,
        paymentDate: new Date("2026-09-10"),
        totalAmount: 400_000,
        method: "CASH",
        referenceNo: null,
        notes: null,
        allocations: [{ invoiceId: inv1.id as string, amount: 400_000 }],
      },
      "user-1",
    );
    let invRow = tables.finInvoice.find((r) => r.id === inv1.id);
    expect(invRow?.status).toBe("PARTIAL");
    expect(Number(invRow?.paidAmount)).toBe(400_000);

    await finPaymentsRepo.createPaymentWithAllocations(
      {
        direction: "OUT",
        accountId: "acc-1",
        supplierId: null,
        paymentDate: new Date("2026-09-22"),
        totalAmount: 600_000,
        method: "CASH",
        referenceNo: null,
        notes: null,
        allocations: [{ invoiceId: inv1.id as string, amount: 600_000 }],
      },
      "user-1",
    );
    invRow = tables.finInvoice.find((r) => r.id === inv1.id);
    expect(invRow?.status).toBe("PAID");
    expect(Number(invRow?.paidAmount)).toBe(1_000_000);
    // 2 payment → 2 transaction (không phải 1 gộp, không phải nhiều hơn 2).
    expect(tables.finTransaction).toHaveLength(2);
  });
});

describe("recalcInvoicePaidAmount — tính status theo quy tắc §A.3.2", () => {
  it("paid = 0, chưa quá hạn → UNPAID", async () => {
    const { finInvoicesRepo, fakeTables: tables, fakeDb } = await loadReposWithFreshDb();
    const inv = seedInvoice(tables, { totalAmount: "500000", dueDate: "2099-01-01" });
    const row = await fakeDb.transaction((tx: any) =>
      finInvoicesRepo.recalcInvoicePaidAmount(tx, inv.id as string),
    );
    expect(row?.status).toBe("UNPAID");
  });

  it("paid = 0, đã quá hạn → OVERDUE", async () => {
    const { finInvoicesRepo, fakeTables: tables, fakeDb } = await loadReposWithFreshDb();
    const inv = seedInvoice(tables, { totalAmount: "500000", dueDate: "2020-01-01" });
    const row = await fakeDb.transaction((tx: any) =>
      finInvoicesRepo.recalcInvoicePaidAmount(tx, inv.id as string),
    );
    expect(row?.status).toBe("OVERDUE");
  });

  it("0 < paid < total → PARTIAL (chưa quá hạn)", async () => {
    const { finInvoicesRepo, fakeTables: tables, fakeDb } = await loadReposWithFreshDb();
    const inv = seedInvoice(tables, { totalAmount: "500000", dueDate: "2099-01-01" });
    tables.finPaymentAllocation.push({
      id: "a1",
      paymentId: "p1",
      invoiceId: inv.id,
      amount: "200000",
      createdAt: new Date(),
    });
    const row = await fakeDb.transaction((tx: any) =>
      finInvoicesRepo.recalcInvoicePaidAmount(tx, inv.id as string),
    );
    expect(row?.status).toBe("PARTIAL");
    expect(Number(row?.paidAmount)).toBe(200_000);
  });

  it("paid >= total → PAID dù đã quá hạn (trả đủ thì không còn overdue)", async () => {
    const { finInvoicesRepo, fakeTables: tables, fakeDb } = await loadReposWithFreshDb();
    const inv = seedInvoice(tables, { totalAmount: "500000", dueDate: "2020-01-01" });
    tables.finPaymentAllocation.push({
      id: "a1",
      paymentId: "p1",
      invoiceId: inv.id,
      amount: "500000",
      createdAt: new Date(),
    });
    const row = await fakeDb.transaction((tx: any) =>
      finInvoicesRepo.recalcInvoicePaidAmount(tx, inv.id as string),
    );
    expect(row?.status).toBe("PAID");
  });

  it("invoice đã CANCELLED → giữ nguyên, không tự đổi status", async () => {
    const { finInvoicesRepo, fakeTables: tables, fakeDb } = await loadReposWithFreshDb();
    const inv = seedInvoice(tables, { totalAmount: "500000", status: "CANCELLED" });
    const row = await fakeDb.transaction((tx: any) =>
      finInvoicesRepo.recalcInvoicePaidAmount(tx, inv.id as string),
    );
    expect(row).toBeNull();
    expect(tables.finInvoice.find((r) => r.id === inv.id)?.status).toBe("CANCELLED");
  });
});

describe("voidPaymentWithAllocations — rollback + recalc", () => {
  it("huỷ payment → xoá allocation, void transaction liên quan, invoice quay lại UNPAID", async () => {
    const { finPaymentsRepo, fakeTables: tables } = await loadReposWithFreshDb();
    const inv = seedInvoice(tables, { totalAmount: "500000" });

    const created = await finPaymentsRepo.createPaymentWithAllocations(
      {
        direction: "OUT",
        accountId: "acc-1",
        supplierId: null,
        paymentDate: new Date("2026-09-22"),
        totalAmount: 500_000,
        method: "CASH",
        referenceNo: null,
        notes: null,
        allocations: [{ invoiceId: inv.id as string, amount: 500_000 }],
      },
      "user-1",
    );
    expect(tables.finInvoice.find((r) => r.id === inv.id)?.status).toBe("PAID");

    await finPaymentsRepo.voidPaymentWithAllocations(created.payment.id as string);

    expect(tables.finPaymentAllocation).toHaveLength(0);
    expect(
      tables.finTransaction.every((t) => t.paymentId !== created.payment.id || t.status === "VOID"),
    ).toBe(true);
    expect(tables.finInvoice.find((r) => r.id === inv.id)?.status).toBe("UNPAID");
  });
});
