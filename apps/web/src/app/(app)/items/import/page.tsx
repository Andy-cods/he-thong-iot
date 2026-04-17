import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { ImportWizard } from "@/components/items/ImportWizard";

export const metadata = {
  title: "Nhập Excel — Item Master",
};

export const dynamic = "force-dynamic";

export default async function ItemImportPage() {
  // Lấy username để làm key preset localStorage. Layout đã verify; đọc lại
  // token để tách user. Cost 1 verify JWT ~ sub-ms, acceptable.
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  const userId = payload?.usr ?? payload?.sub ?? "anon";
  return <ImportWizard userId={userId} />;
}
