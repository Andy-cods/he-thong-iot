import { auditEvent } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { Session } from "../session";

type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "RELEASE"
  | "SNAPSHOT"
  | "POST"
  | "CANCEL"
  | "UPLOAD"
  | "COMMIT"
  // V1.2 additions
  | "TRANSITION"
  | "RESERVE"
  | "ISSUE"
  | "RECEIVE"
  | "APPROVE"
  | "CONVERT";

export interface AuditInput {
  actor: Session | null;
  action: AuditAction;
  objectType: string;
  objectId?: string | null;
  before?: unknown;
  after?: unknown;
  notes?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Chỉ lấy field khác nhau giữa before/after để audit gọn. */
export function diffObjects(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
} {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  if (!before || !after) {
    return {
      before: (before as Record<string, unknown>) ?? {},
      after: (after as Record<string, unknown>) ?? {},
    };
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const bv = before[k];
    const av = after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a };
}

/** Ghi log audit non-blocking (ok nếu ghi audit fail → chỉ log warn). */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvent).values({
      actorUserId: input.actor?.userId ?? null,
      actorUsername: input.actor?.username ?? null,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId ?? null,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      beforeJson: (input.before as object | undefined) ?? null,
      afterJson: (input.after as object | undefined) ?? null,
      notes: input.notes ?? null,
    });
  } catch (err) {
    logger.warn({ err, audit: input }, "audit write failed");
  }
}
