import { and, asc, desc, eq, sql } from "drizzle-orm";
import { bomSnapshotLine, bomRevision, bomTemplate } from "@iot/db/schema";
import type { BomSnapshotLine, BomSnapshotLineState } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Repository cho bom_snapshot_line — kết quả explode recursive CTE của 1
 * revision cho 1 order.
 *
 * V1.2 core repo. Scrap cumulative multiplicative (1+s1)(1+s2)... — chính xác
 * hơn sum. Path ltree dạng "001.002.003" (deterministic sort).
 */

export class ConflictError extends Error {
  public readonly code = "CONFLICT";
  public readonly httpStatus = 409;
  constructor(message: string) {
    super(message);
  }
}

export class StateTransitionError extends Error {
  public readonly code = "STATE_TRANSITION_INVALID";
  public readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
  }
}

const STATE_TRANSITIONS: Record<BomSnapshotLineState, BomSnapshotLineState[]> = {
  PLANNED: ["PURCHASING", "IN_PRODUCTION", "CLOSED"],
  PURCHASING: ["INBOUND_QC", "PLANNED", "CLOSED"],
  IN_PRODUCTION: ["PROD_QC", "PLANNED", "CLOSED"],
  INBOUND_QC: ["AVAILABLE", "PLANNED", "CLOSED"],
  PROD_QC: ["AVAILABLE", "PLANNED", "CLOSED"],
  AVAILABLE: ["RESERVED", "CLOSED"],
  RESERVED: ["ISSUED", "AVAILABLE", "CLOSED"],
  ISSUED: ["ASSEMBLED", "CLOSED"],
  ASSEMBLED: ["CLOSED"],
  CLOSED: [],
};

export function canTransition(
  from: BomSnapshotLineState,
  to: BomSnapshotLineState,
  options: { adminOverride?: boolean } = {},
): boolean {
  if (options.adminOverride) {
    // Admin: cho phép mọi transition trừ từ CLOSED (final state)
    return from !== "CLOSED";
  }
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface ExplodeInput {
  orderId: string;
  revisionId: string;
  targetQty: number;
  userId: string | null;
}

export interface ExplodeResult {
  orderId: string;
  revisionId: string;
  linesCreated: number;
  maxDepth: number;
  durationMs: number;
}

/**
 * Explode 1 BOM revision cho 1 order thành bom_snapshot_line rows.
 *
 * Thuật toán: recursive CTE trên `frozen_snapshot.lines[]` (đã lưu sẵn trong
 * bom_revision). Duyệt tree theo BFS, tính:
 *   - required_qty = targetQty × product(qty_per_parent từ root)
 *   - gross_required_qty = required_qty × product(1 + scrap_pct) cumulative
 *   - path ltree: "001.002.003" LPAD 3 digit
 *
 * Implementation thực tế: chạy recursive TypeScript (đọc frozen_snapshot JSON)
 * rồi insert bulk. CTE SQL over JSON phức tạp hơn cho V1.2; khi frozen_snapshot
 * đã sẵn trong memory thì duyệt TS đơn giản hơn.
 *
 * Benchmark target: 1000 node < 5s (local SSD).
 *
 * @throws ConflictError nếu snapshot đã tồn tại cho order+revision.
 */
export async function explodeSnapshot(
  input: ExplodeInput,
): Promise<ExplodeResult> {
  const startedAt = Date.now();

  return db.transaction(async (tx) => {
    // 1) Guard: chưa có snapshot cho cặp order+revision (tránh double)
    const existing = await tx
      .select({ id: bomSnapshotLine.id })
      .from(bomSnapshotLine)
      .where(
        and(
          eq(bomSnapshotLine.orderId, input.orderId),
          eq(bomSnapshotLine.revisionId, input.revisionId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictError(
        "Snapshot đã tồn tại cho order+revision này, xóa trước nếu muốn explode lại",
      );
    }

    // 2) Load revision + frozen snapshot
    const [revision] = await tx
      .select()
      .from(bomRevision)
      .where(eq(bomRevision.id, input.revisionId))
      .limit(1);
    if (!revision) throw new Error("REVISION_NOT_FOUND");
    if (revision.status !== "RELEASED") {
      throw new Error(
        `REVISION_NOT_RELEASED (status=${revision.status}) — chỉ RELEASED mới explode được`,
      );
    }

    const frozen = revision.frozenSnapshot as unknown as {
      lines: Array<{
        id: string;
        parentLineId: string | null;
        componentItemId: string;
        level: number;
        position: number;
        qtyPerParent: string;
        scrapPercent: string;
      }>;
      totalLines?: number;
    };
    const frozenLines = frozen?.lines ?? [];
    if (frozenLines.length === 0) throw new Error("REVISION_EMPTY");

    // 3) Build children map + detect root(s)
    const byParent = new Map<string | null, typeof frozenLines>();
    for (const l of frozenLines) {
      const k = l.parentLineId ?? null;
      const arr = byParent.get(k) ?? [];
      arr.push(l);
      byParent.set(k, arr);
    }
    // Sort children theo position để path deterministic
    for (const [, arr] of byParent) {
      arr.sort((a, b) => a.position - b.position);
    }

    // 4) Load component SKU/name lookup 1-shot
    const componentIds = [
      ...new Set(frozenLines.map((l) => l.componentItemId)),
    ];
    const compRows = await tx.execute(sql`
      SELECT id, sku, name FROM app.item WHERE id = ANY(${componentIds})
    `);
    const compList = compRows as unknown as Array<{
      id: string;
      sku: string;
      name: string;
    }>;
    const compMap = new Map(
      compList.map((r) => [r.id, { sku: r.sku, name: r.name }]),
    );

    // 5) BFS duyệt tree, tính qty cumulative + path
    type InsertRow = {
      id: string;
      orderId: string;
      revisionId: string;
      parentSnapshotLineId: string | null;
      level: number;
      path: string;
      componentItemId: string;
      componentSku: string;
      componentName: string;
      requiredQty: string;
      grossRequiredQty: string;
    };
    const toInsert: InsertRow[] = [];

    // Stack frame: mỗi frame = 1 line + parent_snapshot_line_id + cumulative qty/scrap
    interface Frame {
      line: (typeof frozenLines)[number];
      parentSnapLineId: string | null;
      cumQtyPer: number; // product of qty_per_parent từ root tới line này (loại trừ line này)
      cumScrapMult: number; // product of (1 + scrap_pct) cumulative
      pathPrefix: string; // e.g. "001.002"
    }

    const roots = byParent.get(null) ?? [];
    const queue: Frame[] = roots.map((r) => ({
      line: r,
      parentSnapLineId: null,
      cumQtyPer: 1,
      cumScrapMult: 1,
      pathPrefix: "",
    }));

    // Track mapping frozen line.id → snapshot line id mới (để set parent cho children)
    const newIdByFrozenId = new Map<string, string>();
    let maxDepth = 0;

    // Cần pre-generate id để con trỏ parent được biết trước (bulk insert 1 lần).
    // Dùng gen_random_uuid() server-side sau insert là ổn, nhưng ở đây mình
    // cần id cho parent_snapshot_line_id → dùng crypto.randomUUID() TS-side.
    const { randomUUID } = await import("node:crypto");

    while (queue.length > 0) {
      const frame = queue.shift();
      if (!frame) continue;
      const l = frame.line;

      const qtyPer = Number.parseFloat(l.qtyPerParent);
      const scrap = Number.parseFloat(l.scrapPercent);
      // Postgres scrap_percent lưu dạng % (e.g. 3 = 3%), divide 100 cho multiplier.
      const scrapMult = 1 + scrap / 100;

      const newCumQty = frame.cumQtyPer * qtyPer;
      const newCumScrap = frame.cumScrapMult * scrapMult;

      const requiredQty = input.targetQty * newCumQty;
      const grossRequiredQty = requiredQty * newCumScrap;

      const positionStr = l.position.toString().padStart(3, "0");
      const path =
        frame.pathPrefix === "" ? positionStr : `${frame.pathPrefix}.${positionStr}`;

      if (l.level > maxDepth) maxDepth = l.level;

      const newId = randomUUID();
      newIdByFrozenId.set(l.id, newId);

      const comp = compMap.get(l.componentItemId);
      if (!comp) {
        throw new Error(`COMPONENT_ITEM_NOT_FOUND: ${l.componentItemId}`);
      }

      toInsert.push({
        id: newId,
        orderId: input.orderId,
        revisionId: input.revisionId,
        parentSnapshotLineId: frame.parentSnapLineId,
        level: l.level,
        path,
        componentItemId: l.componentItemId,
        componentSku: comp.sku,
        componentName: comp.name,
        requiredQty: requiredQty.toFixed(6),
        grossRequiredQty: grossRequiredQty.toFixed(6),
      });

      // Enqueue children
      const kids = byParent.get(l.id) ?? [];
      for (const k of kids) {
        queue.push({
          line: k,
          parentSnapLineId: newId,
          cumQtyPer: newCumQty,
          cumScrapMult: newCumScrap,
          pathPrefix: path,
        });
      }
    }

    // 6) Bulk insert với id pre-generated (để parent_snapshot_line_id trỏ đúng).
    //    Drizzle insert với id explicit — ok. Batch 200/lần.
    if (toInsert.length === 0) {
      return {
        orderId: input.orderId,
        revisionId: input.revisionId,
        linesCreated: 0,
        maxDepth: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH);
      await tx.insert(bomSnapshotLine).values(
        slice.map((r) => ({
          id: r.id,
          orderId: r.orderId,
          revisionId: r.revisionId,
          parentSnapshotLineId: r.parentSnapshotLineId,
          level: r.level,
          path: r.path,
          componentItemId: r.componentItemId,
          componentSku: r.componentSku,
          componentName: r.componentName,
          requiredQty: r.requiredQty,
          grossRequiredQty: r.grossRequiredQty,
        })),
      );
    }

    const durationMs = Date.now() - startedAt;
    logger.info(
      {
        orderId: input.orderId,
        revisionId: input.revisionId,
        linesCreated: toInsert.length,
        maxDepth,
        durationMs,
      },
      "explodeSnapshot benchmark",
    );

    return {
      orderId: input.orderId,
      revisionId: input.revisionId,
      linesCreated: toInsert.length,
      maxDepth,
      durationMs,
    };
  });
}

export interface ListSnapshotLinesFilter {
  state?: BomSnapshotLineState;
  level?: number;
  shortOnly?: boolean;
}

export async function listSnapshotLines(
  orderId: string,
  filter: ListSnapshotLinesFilter = {},
) {
  const conds = [eq(bomSnapshotLine.orderId, orderId)];
  if (filter.state) conds.push(eq(bomSnapshotLine.state, filter.state));
  if (filter.level !== undefined)
    conds.push(eq(bomSnapshotLine.level, filter.level));
  if (filter.shortOnly) {
    conds.push(sql`${bomSnapshotLine.remainingShortQty} > 0`);
  }

  return db
    .select()
    .from(bomSnapshotLine)
    .where(and(...conds))
    .orderBy(asc(bomSnapshotLine.path));
}

export async function getSnapshotLine(
  id: string,
): Promise<BomSnapshotLine | null> {
  const [row] = await db
    .select()
    .from(bomSnapshotLine)
    .where(eq(bomSnapshotLine.id, id))
    .limit(1);
  return row ?? null;
}

export interface TransitionInput {
  lineId: string;
  toState: BomSnapshotLineState;
  expectedVersionLock: number;
  userId: string | null;
  adminOverride?: boolean;
}

/**
 * Transition 1 snapshot line state với optimistic lock.
 * - Check transition rule (STATE_TRANSITIONS map) hoặc admin override.
 * - UPDATE WHERE version_lock = expected; nếu 0 row → ConflictError (409).
 * - Return updated row.
 */
export async function transitionState(
  input: TransitionInput,
): Promise<BomSnapshotLine> {
  const [current] = await db
    .select({
      state: bomSnapshotLine.state,
      versionLock: bomSnapshotLine.versionLock,
    })
    .from(bomSnapshotLine)
    .where(eq(bomSnapshotLine.id, input.lineId))
    .limit(1);
  if (!current) throw new Error("SNAPSHOT_LINE_NOT_FOUND");

  if (!canTransition(current.state, input.toState, { adminOverride: input.adminOverride })) {
    throw new StateTransitionError(
      `Không thể transition ${current.state} → ${input.toState}`,
    );
  }

  const rows = await db
    .update(bomSnapshotLine)
    .set({
      state: input.toState,
      versionLock: current.versionLock + 1,
      transitionedAt: new Date(),
      transitionedBy: input.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bomSnapshotLine.id, input.lineId),
        eq(bomSnapshotLine.versionLock, input.expectedVersionLock),
      ),
    )
    .returning();

  if (rows.length === 0) {
    throw new ConflictError(
      "State đã bị thay đổi bởi user khác (version_lock mismatch). Vui lòng refresh.",
    );
  }
  const first = rows[0];
  if (!first) throw new Error("TRANSITION_UPDATE_FAILED");
  return first;
}

/** Lấy template code của 1 revision — tiện cho API response. */
export async function getRevisionTemplateCode(revisionId: string) {
  const [row] = await db
    .select({ code: bomTemplate.code })
    .from(bomRevision)
    .innerJoin(bomTemplate, eq(bomTemplate.id, bomRevision.templateId))
    .where(eq(bomRevision.id, revisionId))
    .limit(1);
  return row?.code ?? null;
}
