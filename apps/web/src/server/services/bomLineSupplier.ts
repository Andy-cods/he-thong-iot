import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { bomLine, bomLineChange, supplier } from "@iot/db/schema";
import { db } from "@/lib/db";
import { resolveLineSupplier } from "@/lib/bom-line-supplier";

/**
 * BOM V5 / WP2 — đổi NCC của 1 dòng BOM.
 * Toàn bộ trong 1 transaction, khoá dòng bằng SELECT ... FOR UPDATE nên kiểm
 * `expectedVersion` + ghi + tăng `row_version` là nguyên tử.
 *
 * Quy ước:
 *  - Chỉ ghi `bom_line.supplier_id` (+ xoá `supplier_pending`); đồng bộ
 *    `metadata.sourcing.{supplierId,supplierName,supplierCode}` cho code cũ còn
 *    đọc (PRQuickDialog...). `supplier_item_code` KHÔNG đụng (= part number NCC).
 *  - NCC tạo nhanh: needs_review = true, code tự sinh `NCC-XXXXXX`; nếu đã có
 *    NCC trùng tên (không phân biệt hoa/thường) thì dùng lại, không tạo thêm.
 *  - Mỗi lần đổi ghi `bom_line_change` (field = 'supplier').
 */

export interface SupplierRef {
  id: string;
  name: string;
}

export type ChangeLineSupplierInput = {
  templateId: string;
  lineId: string;
  actorId: string | null;
  /** undefined → bỏ qua kiểm phiên bản (client cũ). */
  expectedVersion?: number;
} & (
  | { supplierId: string | null; newSupplier?: undefined }
  | { newSupplier: { name: string; phone?: string | null }; supplierId?: undefined }
);

export interface VersionConflictCurrent {
  rowVersion: number;
  supplier: SupplierRef | null;
  pending: string | null;
  changedBy: string | null;
  changedAt: string | null;
}

export type ChangeLineSupplierResult =
  | {
      ok: true;
      changed: boolean;
      line: {
        id: string;
        rowVersion: number;
        supplierId: string | null;
        supplierPending: string | null;
      };
      supplier: { id: string; name: string; code: string; needsReview: boolean } | null;
      createdSupplier: boolean;
      before: { supplier: SupplierRef | null; pending: string | null };
    }
  | { ok: false; code: "NOT_FOUND" }
  | { ok: false; code: "SUPPLIER_NOT_FOUND" }
  | { ok: false; code: "VERSION_CONFLICT"; current: VersionConflictCurrent };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function supplierName(tx: Tx, id: string | null): Promise<string | null> {
  if (!id) return null;
  const [row] = await tx
    .select({ name: supplier.name })
    .from(supplier)
    .where(eq(supplier.id, id))
    .limit(1);
  return row?.name ?? null;
}

function newSupplierCode(): string {
  return `NCC-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function changeLineSupplier(
  input: ChangeLineSupplierInput,
): Promise<ChangeLineSupplierResult> {
  return db.transaction(async (tx): Promise<ChangeLineSupplierResult> => {
    const [line] = await tx
      .select()
      .from(bomLine)
      .where(and(eq(bomLine.id, input.lineId), eq(bomLine.templateId, input.templateId)))
      .for("update");
    if (!line) return { ok: false, code: "NOT_FOUND" };

    const meta = (line.metadata ?? {}) as Record<string, unknown>;
    const oldResolved = resolveLineSupplier({
      supplierId: line.supplierId,
      supplierPending: line.supplierPending,
      metadata: meta,
    });
    const oldName = await supplierName(tx, oldResolved.id);
    const oldRef: SupplierRef | null = oldResolved.id
      ? { id: oldResolved.id, name: oldName ?? oldResolved.name ?? "" }
      : null;

    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== line.rowVersion
    ) {
      const last = (await tx.execute(sql`
        SELECT u.full_name AS by, c.at AS at
        FROM app.bom_line_change c
        LEFT JOIN app.user_account u ON u.id = c.actor_id
        WHERE c.line_id = ${input.lineId} AND c.field = 'supplier'
        ORDER BY c.at DESC LIMIT 1
      `)) as unknown as Array<{ by: string | null; at: Date | string | null }>;
      return {
        ok: false,
        code: "VERSION_CONFLICT",
        current: {
          rowVersion: line.rowVersion,
          supplier: oldRef,
          pending: line.supplierPending ?? null,
          changedBy: last[0]?.by ?? null,
          changedAt: last[0]?.at ? new Date(last[0].at).toISOString() : null,
        },
      };
    }

    // ── Xác định NCC đích ──
    let target: { id: string; name: string; code: string; needsReview: boolean } | null =
      null;
    let created = false;

    if (input.newSupplier) {
      const name = input.newSupplier.name.trim();
      const dup = (await tx.execute(sql`
        SELECT id, code, name, needs_review AS "needsReview"
        FROM app.supplier
        WHERE lower(btrim(name)) = lower(btrim(${name})) AND is_active = true
        ORDER BY created_at ASC LIMIT 1
      `)) as unknown as Array<{
        id: string;
        code: string;
        name: string;
        needsReview: boolean;
      }>;
      if (dup[0]) {
        target = dup[0];
      } else {
        const [row] = await tx
          .insert(supplier)
          .values({
            code: newSupplierCode(),
            name,
            phone: input.newSupplier.phone?.trim() || null,
            needsReview: true,
          })
          .returning();
        if (!row) throw new Error("insert supplier trả về rỗng");
        target = {
          id: row.id,
          name: row.name,
          code: row.code,
          needsReview: row.needsReview,
        };
        created = true;
      }
    } else if (input.supplierId) {
      const [row] = await tx
        .select()
        .from(supplier)
        .where(eq(supplier.id, input.supplierId))
        .limit(1);
      if (!row || row.isActive === false) return { ok: false, code: "SUPPLIER_NOT_FOUND" };
      target = {
        id: row.id,
        name: row.name,
        code: row.code,
        needsReview: row.needsReview,
      };
    }

    const before = { supplier: oldRef, pending: line.supplierPending ?? null };

    // Không đổi gì (cùng NCC, không còn pending) → không bump version, không log.
    const sameSupplier = (target?.id ?? null) === (line.supplierId ?? null);
    const pendingStays = target ? line.supplierPending == null : true;
    if (sameSupplier && pendingStays && !created) {
      return {
        ok: true,
        changed: false,
        line: {
          id: line.id,
          rowVersion: line.rowVersion,
          supplierId: line.supplierId ?? null,
          supplierPending: line.supplierPending ?? null,
        },
        supplier: target,
        createdSupplier: false,
        before,
      };
    }

    // ── Đồng bộ metadata.sourcing cho code cũ ──
    const sourcing: Record<string, unknown> = {
      ...((meta.sourcing as Record<string, unknown> | undefined) ?? {}),
    };
    if (target) {
      sourcing.supplierId = target.id;
      sourcing.supplierName = target.name;
      sourcing.supplierCode = target.code;
    } else {
      delete sourcing.supplierId;
      delete sourcing.supplierName;
      delete sourcing.supplierCode;
    }
    const nextMeta: Record<string, unknown> = { ...meta };
    if (Object.keys(sourcing).length > 0) nextMeta.sourcing = sourcing;
    else delete nextMeta.sourcing;
    delete nextMeta.supplierId; // field phẳng cũ → không để lệch với cột

    const nextVersion = line.rowVersion + 1;
    const [updated] = await tx
      .update(bomLine)
      .set({
        supplierId: target?.id ?? null,
        // Chọn xong 1 NCC → chốt, xoá text chờ chốt. Bỏ chọn → giữ nguyên pending.
        supplierPending: target ? null : (line.supplierPending ?? null),
        rowVersion: nextVersion,
        metadata: nextMeta,
        updatedAt: new Date(),
      })
      .where(eq(bomLine.id, line.id))
      .returning();

    await tx.insert(bomLineChange).values({
      lineId: line.id,
      templateId: input.templateId,
      field: "supplier",
      oldValue: {
        id: oldRef?.id ?? null,
        name: oldRef?.name ?? null,
        ...(line.supplierPending ? { pending: line.supplierPending } : {}),
      },
      newValue: { id: target?.id ?? null, name: target?.name ?? null },
      actorId: input.actorId,
    });

    return {
      ok: true,
      changed: true,
      line: {
        id: line.id,
        rowVersion: updated?.rowVersion ?? nextVersion,
        supplierId: updated?.supplierId ?? target?.id ?? null,
        supplierPending: updated?.supplierPending ?? null,
      },
      supplier: target,
      createdSupplier: created,
      before,
    };
  });
}

export interface LineChangeRow {
  id: number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
  actorName: string | null;
  at: string;
}

export async function listLineChanges(
  lineId: string,
  limit = 100,
): Promise<LineChangeRow[]> {
  const rows = (await db.execute(sql`
    SELECT c.id, c.field, c.old_value AS "oldValue", c.new_value AS "newValue",
           c.actor_id AS "actorId", u.full_name AS "actorName", c.at
    FROM app.bom_line_change c
    LEFT JOIN app.user_account u ON u.id = c.actor_id
    WHERE c.line_id = ${lineId}
    ORDER BY c.at DESC, c.id DESC
    LIMIT ${limit}
  `)) as unknown as Array<
    Omit<LineChangeRow, "at" | "id"> & { id: number | string; at: Date | string }
  >;
  return rows.map((r) => ({
    ...r,
    id: Number(r.id),
    at: new Date(r.at).toISOString(),
  }));
}
