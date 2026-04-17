import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { importBatch, type ImportBatch } from "@iot/db/schema";
import { db } from "@/lib/db";

export async function findRecentByHash(
  fileHash: string,
  kind: "item" | "bom",
  sinceMinutes = 60,
): Promise<ImportBatch | null> {
  const sinceDate = new Date(Date.now() - sinceMinutes * 60_000);
  const [row] = await db
    .select()
    .from(importBatch)
    .where(
      and(
        eq(importBatch.fileHash, fileHash),
        eq(importBatch.kind, kind),
        gte(importBatch.createdAt, sinceDate),
        inArray(importBatch.status, ["preview_ready", "committing", "done"]),
      ),
    )
    .orderBy(desc(importBatch.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getImportBatch(id: string) {
  const [row] = await db
    .select()
    .from(importBatch)
    .where(eq(importBatch.id, id))
    .limit(1);
  return row ?? null;
}

export async function createImportBatch(input: {
  kind: "item" | "bom";
  fileHash: string;
  fileName: string;
  fileSizeBytes: number;
  fileKey?: string | null;
  duplicateMode: "skip" | "upsert" | "error";
  uploadedBy: string | null;
}) {
  const [row] = await db
    .insert(importBatch)
    .values({
      kind: input.kind,
      fileHash: input.fileHash,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      fileKey: input.fileKey ?? null,
      duplicateMode: input.duplicateMode,
      uploadedBy: input.uploadedBy,
      status: "queued",
    })
    .returning();
  return row;
}

export async function updateImportBatch(
  id: string,
  patch: Partial<Omit<ImportBatch, "id" | "createdAt">>,
) {
  const [row] = await db
    .update(importBatch)
    .set(patch)
    .where(eq(importBatch.id, id))
    .returning();
  return row ?? null;
}

export async function incrementImportCounters(
  id: string,
  delta: { success?: number; fail?: number },
) {
  await db
    .update(importBatch)
    .set({
      rowSuccess: sql`${importBatch.rowSuccess} + ${delta.success ?? 0}`,
      rowFail: sql`${importBatch.rowFail} + ${delta.fail ?? 0}`,
    })
    .where(eq(importBatch.id, id));
}
