import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { auditEvent, userAccount } from "@iot/db/schema";
import { db } from "@/lib/db";

export interface AuditListQuery {
  q?: string;
  entity?: string[];
  action?: string[];
  actorUsername?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export interface AuditListRow {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  occurredAt: Date;
  requestId: string | null;
  ipAddress: string | null;
  notes: string | null;
  beforeJson: unknown;
  afterJson: unknown;
}

export async function listAudit(q: AuditListQuery) {
  const where: SQL[] = [];

  if (q.entity && q.entity.length > 0) {
    where.push(inArray(auditEvent.objectType, q.entity));
  }
  if (q.action && q.action.length > 0) {
    where.push(
      inArray(
        auditEvent.action,
        q.action as unknown as (typeof auditEvent.action.enumValues)[number][],
      ),
    );
  }
  if (q.actorUsername) {
    where.push(eq(auditEvent.actorUsername, q.actorUsername));
  }
  if (q.userId) {
    where.push(eq(auditEvent.actorUserId, q.userId));
  }
  if (q.from) where.push(gte(auditEvent.occurredAt, q.from));
  if (q.to) where.push(lte(auditEvent.occurredAt, q.to));

  if (q.q && q.q.trim().length > 0) {
    const needle = q.q.trim();
    where.push(
      sql`(
        ${auditEvent.objectType} ILIKE ('%' || ${needle} || '%')
        OR ${auditEvent.actorUsername} ILIKE ('%' || ${needle} || '%')
        OR ${auditEvent.notes} ILIKE ('%' || ${needle} || '%')
      )`,
    );
  }

  const whereExpr = where.length > 0 ? and(...where) : undefined;
  const offset = (q.page - 1) * q.pageSize;

  const [totalResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEvent)
      .where(whereExpr ?? sql`true`),
    db
      .select({
        id: auditEvent.id,
        actorUserId: auditEvent.actorUserId,
        actorUsername: auditEvent.actorUsername,
        actorDisplayName: userAccount.fullName,
        action: auditEvent.action,
        objectType: auditEvent.objectType,
        objectId: auditEvent.objectId,
        occurredAt: auditEvent.occurredAt,
        requestId: auditEvent.requestId,
        ipAddress: auditEvent.ipAddress,
        notes: auditEvent.notes,
        beforeJson: auditEvent.beforeJson,
        afterJson: auditEvent.afterJson,
      })
      .from(auditEvent)
      .leftJoin(userAccount, eq(userAccount.id, auditEvent.actorUserId))
      .where(whereExpr ?? sql`true`)
      .orderBy(desc(auditEvent.occurredAt))
      .limit(q.pageSize)
      .offset(offset),
  ]);

  return {
    rows: rows as AuditListRow[],
    total: totalResult[0]?.count ?? 0,
  };
}
