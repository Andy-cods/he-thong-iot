import { and, asc, desc, eq, sql } from "drizzle-orm";
import { bomLine, bomRevision, bomTemplate } from "@iot/db/schema";
import type { BomRevision } from "@iot/db/schema";
import { db } from "@/lib/db";

/**
 * Repository cho bom_revision — bản đóng băng immutable của bom_template.
 *
 * V1.2 flow:
 *  - releaseRevision: clone toàn bộ tree bom_line hiện tại của template →
 *    serialize thành JSON → INSERT 1 row bom_revision status=RELEASED.
 *  - listRevisions/getRevision: read-only.
 *  - supersedeRevision: chuyển sang SUPERSEDED (giữ lịch sử, chặn dùng explode mới).
 */

export interface ReleaseRevisionInput {
  templateId: string;
  userId: string | null;
  notes?: string | null;
}

export interface FrozenSnapshotNode {
  id: string;
  parentLineId: string | null;
  componentItemId: string;
  level: number;
  position: number;
  qtyPerParent: string;
  scrapPercent: string;
  uom: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
}

export interface FrozenSnapshot {
  templateId: string;
  templateCode: string;
  templateName: string;
  capturedAt: string; // ISO
  totalLines: number;
  maxDepth: number;
  lines: FrozenSnapshotNode[];
}

function nextRevisionNo(existing: string[]): string {
  // R01, R02, ... (2-digit zero-pad, up to R99 → sau đó R100 cũng được)
  let max = 0;
  for (const r of existing) {
    const match = /^R(\d+)$/.exec(r);
    if (match?.[1]) {
      const n = Number.parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  const next = max + 1;
  return `R${next.toString().padStart(2, "0")}`;
}

/**
 * RELEASE 1 revision mới cho template: clone tree hiện tại → bom_revision
 * row với frozen_snapshot = full JSON + status=RELEASED + revision_no auto
 * increment (R01, R02…).
 *
 * Atomic: Drizzle transaction. Guard: template tồn tại + có ít nhất 1 line.
 */
export async function releaseRevision(
  input: ReleaseRevisionInput,
): Promise<BomRevision> {
  return db.transaction(async (tx) => {
    const [tpl] = await tx
      .select()
      .from(bomTemplate)
      .where(eq(bomTemplate.id, input.templateId))
      .limit(1);
    if (!tpl) throw new Error("TEMPLATE_NOT_FOUND");

    const lines = await tx
      .select()
      .from(bomLine)
      .where(eq(bomLine.templateId, input.templateId))
      .orderBy(asc(bomLine.level), asc(bomLine.position));

    if (lines.length === 0) throw new Error("TEMPLATE_EMPTY");

    const maxDepth = lines.reduce((m, l) => Math.max(m, l.level), 0);

    const snapshotLines: FrozenSnapshotNode[] = lines.map((l) => ({
      id: l.id,
      parentLineId: l.parentLineId,
      componentItemId: l.componentItemId,
      level: l.level,
      position: l.position,
      qtyPerParent: l.qtyPerParent,
      scrapPercent: l.scrapPercent,
      uom: l.uom,
      description: l.description,
      metadata: l.metadata as Record<string, unknown>,
    }));

    const frozen: FrozenSnapshot = {
      templateId: tpl.id,
      templateCode: tpl.code,
      templateName: tpl.name,
      capturedAt: new Date().toISOString(),
      totalLines: lines.length,
      maxDepth,
      lines: snapshotLines,
    };

    const existing = await tx
      .select({ revisionNo: bomRevision.revisionNo })
      .from(bomRevision)
      .where(eq(bomRevision.templateId, input.templateId));

    const revisionNo = nextRevisionNo(existing.map((r) => r.revisionNo));

    const [inserted] = await tx
      .insert(bomRevision)
      .values({
        templateId: input.templateId,
        revisionNo,
        status: "RELEASED",
        frozenSnapshot: frozen as unknown as Record<string, unknown>,
        releasedAt: new Date(),
        releasedBy: input.userId,
        notes: input.notes ?? null,
      })
      .returning();

    if (!inserted) throw new Error("RELEASE_FAILED");
    return inserted;
  });
}

export async function listRevisions(templateId: string) {
  return db
    .select()
    .from(bomRevision)
    .where(eq(bomRevision.templateId, templateId))
    .orderBy(desc(bomRevision.releasedAt), desc(bomRevision.createdAt));
}

export async function getRevision(id: string): Promise<BomRevision | null> {
  const [row] = await db
    .select()
    .from(bomRevision)
    .where(eq(bomRevision.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * SUPERSEDE 1 revision: chuyển RELEASED → SUPERSEDED. Không xóa — giữ audit.
 * Block explode mới từ revision này (app-side guard).
 */
export async function supersedeRevision(
  id: string,
  userId: string | null,
): Promise<BomRevision | null> {
  const [row] = await db
    .update(bomRevision)
    .set({
      status: "SUPERSEDED",
      updatedAt: new Date(),
      notes: sql`COALESCE(${bomRevision.notes}, '') || ${
        "\n[SUPERSEDED by " + (userId ?? "system") + " at " + new Date().toISOString() + "]"
      }`,
    })
    .where(and(eq(bomRevision.id, id), eq(bomRevision.status, "RELEASED")))
    .returning();
  return row ?? null;
}
