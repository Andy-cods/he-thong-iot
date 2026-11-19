import { cookies } from "next/headers";
import type { Role } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { canWithOverrides, type PermissionOverrideLite } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { listActiveOverridesByUser } from "@/server/repos/userPermissionOverrides";
import { ShiftOutputShell } from "@/components/shift-output/ShiftOutputShell";

export const dynamic = "force-dynamic";

/**
 * V4.10 (TASK-20261118-001) — khung "Sản lượng ca". `(app)/layout.tsx` đã xác
 * thực + route-guard (/san-luong, /san-luong/bao-cao, /san-luong/cai-dat) + khoá
 * tài khoản xưởng; ở đây chỉ tính tab nào hiện (Báo cáo / Cài đặt theo quyền).
 */
export default async function ShiftOutputLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  const roles = (payload?.roles ?? []) as Role[];
  let overrides: PermissionOverrideLite[] = [];
  if (payload && !roles.includes("admin")) {
    try {
      overrides = (await listActiveOverridesByUser(payload.sub)).map((o) => ({
        entity: o.entity,
        action: o.action,
        granted: o.granted,
      }));
    } catch (err) {
      logger.warn({ err }, "san-luong layout: load overrides failed");
    }
  }
  return (
    <ShiftOutputShell
      permissions={{
        report: canWithOverrides(roles, overrides, "read", "shiftOutputReport"),
        setup: canWithOverrides(roles, overrides, "read", "shiftOutputSetup"),
      }}
    >
      {children}
    </ShiftOutputShell>
  );
}
