import type { Role } from "@iot/shared";
import { db, sql } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * V1.4 Phase B — RLS context helper.
 *
 * Chọn highest-privilege role trong list (admin > planner > operator >
 * warehouse) → SET LOCAL ROLE iot_<role> đầu transaction → policy RLS fire
 * theo quyền role đó. Sau COMMIT/ROLLBACK session reset về hethong_app.
 *
 * Feature flag: `RLS_ENABLED` ENV.
 *   - `RLS_ENABLED=true`  → SET ROLE iot_<role> (policy active).
 *   - Khác (default) → skip SET ROLE, chạy như hethong_app (owner bypass).
 *
 * Nhờ pattern SET LOCAL ROLE (chỉ có hiệu lực trong transaction hiện tại),
 * connection pool không bị "kẹt" role giữa các request.
 *
 * @example
 *   await withRoleTx(session.roles, async (tx) => {
 *     return tx.select().from(bomTemplate);
 *   });
 */
const ROLE_PRIORITY: Record<Role, number> = {
  admin: 5,
  planner: 4,
  purchaser: 3,
  warehouse: 2,
  operator: 1,
};

const ROLE_TO_PG: Record<Role, string> = {
  admin: "iot_admin",
  planner: "iot_planner",
  purchaser: "iot_purchaser",
  operator: "iot_operator",
  warehouse: "iot_warehouse",
};

function pickHighestRole(roles: Role[] | null | undefined): Role | null {
  if (!roles || roles.length === 0) return null;
  let best: Role | null = null;
  let bestPriority = -1;
  for (const r of roles) {
    const p = ROLE_PRIORITY[r] ?? -1;
    if (p > bestPriority) {
      best = r;
      bestPriority = p;
    }
  }
  return best;
}

export function isRlsEnabled(): boolean {
  return process.env.RLS_ENABLED === "true";
}

/**
 * Chạy callback trong transaction với SET LOCAL ROLE phù hợp.
 * Nếu RLS_ENABLED !== 'true' → chạy as hethong_app (bypass RLS).
 *
 * Callback nhận tham số `tx` tương thích Drizzle (type = typeof db).
 */
export async function withRoleTx<T>(
  roles: Role[] | null | undefined,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  if (!isRlsEnabled()) {
    // RLS disabled → execute directly (no role switch).
    return fn(db);
  }

  const role = pickHighestRole(roles);
  if (!role) {
    throw new Error(
      "withRoleTx: roles rỗng nhưng RLS_ENABLED=true — deny-by-default.",
    );
  }
  const pgRole = ROLE_TO_PG[role];

  return db.transaction(async (tx) => {
    // SET LOCAL ROLE chỉ có hiệu lực trong transaction hiện tại.
    // Dùng postgres-js `sql` interpolation an toàn (role name whitelist).
    await sql.unsafe(`SET LOCAL ROLE ${pgRole}`);
    try {
      return await fn(tx as unknown as typeof db);
    } catch (err) {
      logger.warn(
        { err, roles, pgRole },
        "withRoleTx: transaction failed, rollback",
      );
      throw err;
    }
  });
}

/**
 * Helper không mở transaction — chỉ set role cho connection hiện tại
 * (RESET sau callback). Dùng khi caller đã trong transaction.
 *
 * CẢNH BÁO: Nếu connection pool reuse + quên RESET → leak role. Ưu tiên
 * `withRoleTx` trừ khi có lý do đặc biệt.
 */
export async function withRoleNoTx<T>(
  roles: Role[] | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isRlsEnabled()) return fn();
  const role = pickHighestRole(roles);
  if (!role) {
    throw new Error("withRoleNoTx: roles rỗng nhưng RLS_ENABLED=true.");
  }
  const pgRole = ROLE_TO_PG[role];
  await sql.unsafe(`SET ROLE ${pgRole}`);
  try {
    return await fn();
  } finally {
    await sql.unsafe("RESET ROLE");
  }
}
