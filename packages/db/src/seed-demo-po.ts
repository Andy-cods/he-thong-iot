/**
 * Seed demo PO + PR — V1.9 Phase 1.
 *
 * Mục đích: bổ sung 15 PO + 5 PR đa dạng status cho dev + UAT khi
 * trang /procurement/purchase-orders trống record.
 *
 * Idempotent:
 *   - Xoá toàn bộ PO có po_no prefix "PO-DEMO-%" (+ lines cascade) trước khi
 *     insert lại.
 *   - Tương tự PR có code prefix "PR-DEMO-%".
 *   - Seed items/suppliers do seed-demo.ts quản lý; script này CHỈ dùng
 *     supplier + item sẵn có trong DB (query runtime).
 *
 * Chạy standalone:
 *   pnpm --filter @iot/db exec tsx src/seed-demo-po.ts
 *   hoặc: pnpm --filter @iot/db seed:demo-po
 *
 * Yêu cầu DATABASE_URL trong env (.env).
 */

import "dotenv/config";
import { sql as rawSql, eq } from "drizzle-orm";
import { createDbClient } from "./client";
import { supplier, item } from "./schema/master";
import {
  purchaseOrder,
  purchaseOrderLine,
  purchaseRequest,
  purchaseRequestLine,
} from "./schema/procurement";
import { userAccount } from "./schema/auth";

// ─── Config ──────────────────────────────────────────────────────────────────

const PO_COUNT = 15;
const PR_COUNT = 5;
const PO_PREFIX = "PO-DEMO-";
const PR_PREFIX = "PR-DEMO-";

/**
 * Mix status: 3 DRAFT, 5 SENT, 4 PARTIAL, 2 RECEIVED, 1 CANCELLED = 15.
 */
const PO_STATUS_PLAN: Array<
  "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CANCELLED"
> = [
  "DRAFT",
  "DRAFT",
  "DRAFT",
  "SENT",
  "SENT",
  "SENT",
  "SENT",
  "SENT",
  "PARTIAL",
  "PARTIAL",
  "PARTIAL",
  "PARTIAL",
  "RECEIVED",
  "RECEIVED",
  "CANCELLED",
];

/**
 * Mix PR: 2 DRAFT, 2 SUBMITTED, 1 CONVERTED (link tới PO SENT đầu tiên).
 */
const PR_STATUS_PLAN: Array<"DRAFT" | "SUBMITTED" | "CONVERTED"> = [
  "DRAFT",
  "DRAFT",
  "SUBMITTED",
  "SUBMITTED",
  "CONVERTED",
];

const NOTE_TEMPLATES = [
  "Đơn hàng theo kế hoạch tuần",
  "Gấp cho WO đang triển khai",
  "Bổ sung tồn kho nguyên liệu",
  "Chuẩn bị cho đơn khách hàng mới",
  "Đặt lại lô đã tiêu thụ hết",
  "Dự trù tháng tới",
  "Mua theo yêu cầu kỹ thuật",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const idx = Math.floor(rng() * arr.length);
  return arr[Math.min(idx, arr.length - 1)]!;
}

/** Seeded PRNG để mỗi lần chạy ra cùng kết quả (debug dễ hơn). */
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** ISO date (YYYY-MM-DD) offset N ngày từ base. Negative = trước base. */
function dateOffset(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Làm tròn VND tới 1000. */
function roundPrice(n: number): number {
  return Math.round(n / 1000) * 1000;
}

// ─── Main seed function (exportable) ─────────────────────────────────────────

export interface SeedDemoPoOptions {
  /** Xoá record "DEMO-" cũ trước khi insert. Default true. */
  wipe?: boolean;
  /** Seed PRNG. Default 424242 (ổn định). */
  seed?: number;
}

export interface SeedDemoPoResult {
  poInserted: number;
  prInserted: number;
  poSkipped: number;
  prSkipped: number;
}

export async function seedDemoPo(
  db: ReturnType<typeof createDbClient>["db"],
  opts: SeedDemoPoOptions = {},
): Promise<SeedDemoPoResult> {
  const { wipe = true, seed = 424242 } = opts;
  const rng = makeRng(seed);
  const today = new Date();

  // ── 0. Validate prerequisites ───────────────────────────────────────────
  const suppliers = await db
    .select({ id: supplier.id, code: supplier.code, name: supplier.name })
    .from(supplier)
    .where(eq(supplier.isActive, true))
    .limit(50);
  if (suppliers.length === 0) {
    throw new Error(
      "Không có supplier active trong DB — chạy pnpm --filter @iot/db seed / seed-demo trước.",
    );
  }

  const items = await db
    .select({ id: item.id, sku: item.sku, name: item.name })
    .from(item)
    .where(eq(item.isActive, true))
    .limit(200);
  if (items.length < 3) {
    throw new Error(
      "Cần tối thiểu 3 item active trong DB — chạy seed / seed-demo trước.",
    );
  }

  // Creator = admin (ưu tiên), fallback NULL.
  const [adminUser] = await db
    .select({ id: userAccount.id })
    .from(userAccount)
    .where(eq(userAccount.username, "admin"))
    .limit(1);
  const createdBy = adminUser?.id ?? null;

  // ── 1. Idempotent wipe ──────────────────────────────────────────────────
  if (wipe) {
    console.log(`  🗑  Xoá PO/PR prefix "${PO_PREFIX}" / "${PR_PREFIX}" cũ...`);

    // Xoá inbound_receipt_line + inbound_receipt cho PO demo (tránh FK).
    await db.execute(rawSql`
      DELETE FROM app.inbound_receipt_line WHERE receipt_id IN (
        SELECT id FROM app.inbound_receipt WHERE po_id IN (
          SELECT id FROM app.purchase_order WHERE po_no LIKE ${PO_PREFIX + "%"}
        )
      )
    `);
    await db.execute(rawSql`
      DELETE FROM app.inbound_receipt WHERE po_id IN (
        SELECT id FROM app.purchase_order WHERE po_no LIKE ${PO_PREFIX + "%"}
      )
    `);

    // Xoá PO + lines (cascade).
    await db.execute(rawSql`
      DELETE FROM app.purchase_order_line WHERE po_id IN (
        SELECT id FROM app.purchase_order WHERE po_no LIKE ${PO_PREFIX + "%"}
      )
    `);
    await db.execute(
      rawSql`DELETE FROM app.purchase_order WHERE po_no LIKE ${PO_PREFIX + "%"}`,
    );

    // Xoá PR + lines.
    await db.execute(rawSql`
      DELETE FROM app.purchase_request_line WHERE pr_id IN (
        SELECT id FROM app.purchase_request WHERE code LIKE ${PR_PREFIX + "%"}
      )
    `);
    await db.execute(
      rawSql`DELETE FROM app.purchase_request WHERE code LIKE ${PR_PREFIX + "%"}`,
    );
  }

  // ── 2. Seed PR (cần insert trước để CONVERTED PR link tới PO) ───────────
  console.log(`  📝 Inserting ${PR_COUNT} Purchase Requests...`);
  const prIds: Array<{ id: string; code: string; status: string }> = [];
  for (let i = 0; i < PR_COUNT; i++) {
    const status = PR_STATUS_PLAN[i]!;
    const code = `${PR_PREFIX}${String(i + 1).padStart(3, "0")}`;
    const lineCount = 2 + Math.floor(rng() * 3); // 2-4 lines
    const usedItemIdx = new Set<number>();
    const linesPayload: Array<{
      lineNo: number;
      itemId: string;
      qty: string;
      preferredSupplierId: string | null;
      neededBy: string;
      notes: string | null;
    }> = [];
    for (let l = 0; l < lineCount; l++) {
      let idx = Math.floor(rng() * items.length);
      let guard = 0;
      while (usedItemIdx.has(idx) && guard++ < 20) {
        idx = (idx + 1) % items.length;
      }
      usedItemIdx.add(idx);
      const it = items[idx]!;
      const sup = pick(rng, suppliers);
      const qty = 5 + Math.floor(rng() * 50);
      linesPayload.push({
        lineNo: l + 1,
        itemId: it.id,
        qty: qty.toString(),
        preferredSupplierId: sup.id,
        neededBy: dateOffset(today, 7 + Math.floor(rng() * 14)),
        notes: null,
      });
    }

    const createdAt = dateOffset(today, -Math.floor(rng() * 28));
    const [inserted] = await db
      .insert(purchaseRequest)
      .values({
        code,
        title: `Yêu cầu mua hàng ${code}`,
        status,
        source: "MANUAL",
        requestedBy: createdBy,
        approvedBy: status === "CONVERTED" ? createdBy : null,
        approvedAt:
          status === "CONVERTED" ? new Date(`${createdAt}T09:00:00Z`) : null,
        notes: `${pick(rng, NOTE_TEMPLATES)} — demo seed`,
      })
      .returning({ id: purchaseRequest.id });
    if (!inserted) throw new Error(`PR insert failed: ${code}`);

    await db.insert(purchaseRequestLine).values(
      linesPayload.map((l) => ({
        prId: inserted.id,
        lineNo: l.lineNo,
        itemId: l.itemId,
        qty: l.qty,
        preferredSupplierId: l.preferredSupplierId,
        neededBy: l.neededBy,
        notes: l.notes,
      })),
    );

    prIds.push({ id: inserted.id, code, status });
  }

  // ── 3. Seed PO ──────────────────────────────────────────────────────────
  console.log(`  📦 Inserting ${PO_COUNT} Purchase Orders...`);
  let convertedPrLinkIdx = 0; // sẽ link PR CONVERTED → PO SENT đầu tiên

  for (let i = 0; i < PO_COUNT; i++) {
    const status = PO_STATUS_PLAN[i]!;
    const poNo = `${PO_PREFIX}${String(i + 1).padStart(3, "0")}`;
    const sup = pick(rng, suppliers);
    const lineCount = 2 + Math.floor(rng() * 4); // 2-5 lines
    const usedItemIdx = new Set<number>();

    // Dates
    const orderDate = dateOffset(today, -Math.floor(rng() * 30));
    let expectedEta: string;
    if (status === "RECEIVED") {
      expectedEta = dateOffset(today, -Math.floor(rng() * 7) - 1); // đã qua
    } else if (status === "CANCELLED") {
      expectedEta = dateOffset(today, Math.floor(rng() * 7));
    } else {
      expectedEta = dateOffset(today, 7 + Math.floor(rng() * 14));
    }

    // Link PR CONVERTED → PO SENT đầu tiên (1 link)
    let prId: string | null = null;
    const convertedPr = prIds.find((p) => p.status === "CONVERTED");
    if (
      status === "SENT" &&
      convertedPr &&
      convertedPrLinkIdx === 0
    ) {
      prId = convertedPr.id;
      convertedPrLinkIdx = 1;
    }

    let totalAmount = 0;
    const linesPayload: Array<{
      lineNo: number;
      itemId: string;
      orderedQty: string;
      receivedQty: string;
      unitPrice: string;
      expectedEta: string | null;
      notes: string | null;
    }> = [];

    for (let l = 0; l < lineCount; l++) {
      let idx = Math.floor(rng() * items.length);
      let guard = 0;
      while (usedItemIdx.has(idx) && guard++ < 20) {
        idx = (idx + 1) % items.length;
      }
      usedItemIdx.add(idx);
      const it = items[idx]!;
      const qty = 10 + Math.floor(rng() * 90);
      const unitPrice = roundPrice(50_000 + rng() * 4_950_000);

      // Received qty logic
      let receivedQty = 0;
      if (status === "RECEIVED") {
        receivedQty = qty;
      } else if (status === "PARTIAL") {
        // 40-70% nhận
        const pct = 0.4 + rng() * 0.3;
        receivedQty = Math.max(1, Math.floor(qty * pct));
      }
      totalAmount += qty * unitPrice;

      linesPayload.push({
        lineNo: l + 1,
        itemId: it.id,
        orderedQty: qty.toString(),
        receivedQty: receivedQty.toString(),
        unitPrice: unitPrice.toString(),
        expectedEta,
        notes: null,
      });
    }

    const sentAt =
      status === "SENT" ||
      status === "PARTIAL" ||
      status === "RECEIVED"
        ? new Date(`${orderDate}T08:00:00Z`)
        : null;
    const cancelledAt =
      status === "CANCELLED"
        ? new Date(`${orderDate}T14:00:00Z`)
        : null;

    const [inserted] = await db
      .insert(purchaseOrder)
      .values({
        poNo,
        supplierId: sup.id,
        status,
        prId,
        orderDate,
        expectedEta,
        currency: "VND",
        totalAmount: totalAmount.toString(),
        notes: `${pick(rng, NOTE_TEMPLATES)} ${i + 1} — demo seed`,
        sentAt,
        cancelledAt,
        createdBy,
      })
      .returning({ id: purchaseOrder.id });
    if (!inserted) throw new Error(`PO insert failed: ${poNo}`);

    await db.insert(purchaseOrderLine).values(
      linesPayload.map((l) => ({
        poId: inserted.id,
        lineNo: l.lineNo,
        itemId: l.itemId,
        orderedQty: l.orderedQty,
        receivedQty: l.receivedQty,
        unitPrice: l.unitPrice,
        expectedEta: l.expectedEta,
        notes: l.notes,
      })),
    );
  }

  return {
    poInserted: PO_COUNT,
    prInserted: PR_COUNT,
    poSkipped: 0,
    prSkipped: 0,
  };
}

// ─── Standalone runner ───────────────────────────────────────────────────────

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL required — set in .env");
  }
  const { db, sql: pgSql } = createDbClient({ url, max: 3 });

  console.log("🌱 [seed-demo-po] Bắt đầu seed 15 PO + 5 PR demo...");
  const start = Date.now();
  try {
    const result = await seedDemoPo(db);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(
      `✅ Xong sau ${elapsed}s — PO: ${result.poInserted}, PR: ${result.prInserted}`,
    );
  } finally {
    await pgSql.end({ timeout: 5 });
  }
}

// Run khi gọi trực tiếp (không import)
// tsx ES module: import.meta.url chính xác khi là entrypoint
const isMain = (() => {
  try {
    const entry = process.argv[1]?.replace(/\\/g, "/");
    const thisFile = new URL(import.meta.url).pathname.replace(/^\//, "");
    return entry ? thisFile.endsWith(entry.replace(/^\//, "").split("/").slice(-2).join("/")) : false;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((err) => {
    console.error("❌ seed-demo-po failed:", err);
    process.exit(1);
  });
}
