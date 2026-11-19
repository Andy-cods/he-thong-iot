import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@iot/shared";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { isModuleLockedRoles } from "@/lib/shift-output/access";

export const dynamic = "force-dynamic";

/** /san-luong → tài khoản xưởng mở thẳng "Nhập ca"; quản lý mở "Hôm nay". */
export default async function ShiftOutputIndex() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  const roles = (payload?.roles ?? []) as Role[];
  redirect(isModuleLockedRoles(roles) ? "/san-luong/nhap" : "/san-luong/hom-nay");
}
