import { and, desc, eq } from "drizzle-orm";
import { activityLog } from "@iot/db/schema";
import { db } from "@/lib/db";

export interface ActivityLogInsertInput {
  userId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  diffJson?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ActivityLogRow {
  id: number;
  userId: string | null;
  action: string;
  diffJson: unknown;
  at: Date;
}

export async function insertActivityLog(
  input: ActivityLogInsertInput,
): Promise<void> {
  await db.insert(activityLog).values({
    userId: input.userId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    diffJson: (input.diffJson ?? {}) as Record<string, unknown>,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function listActivityLogs(
  entityType: string,
  entityId: string,
  limit = 20,
): Promise<ActivityLogRow[]> {
  return db
    .select({
      id: activityLog.id,
      userId: activityLog.userId,
      action: activityLog.action,
      diffJson: activityLog.diffJson,
      at: activityLog.at,
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.entityType, entityType),
        eq(activityLog.entityId, entityId),
      ),
    )
    .orderBy(desc(activityLog.at))
    .limit(limit) as Promise<ActivityLogRow[]>;
}
