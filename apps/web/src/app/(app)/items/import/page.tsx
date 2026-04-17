import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ImportWizard } from "@/components/items/ImportWizard";

export const metadata = {
  title: "Nhập vật tư từ Excel",
};

export const dynamic = "force-dynamic";

/**
 * V2 /items/import — PageHeader text-xl + subtitle 12 zinc-500 + ImportWizard.
 *
 * userId lấy từ cookie để phân biệt preset localStorage theo user.
 */
export default async function ItemImportPage() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAccessToken(token) : null;
  const userId = payload?.usr ?? payload?.sub ?? "anon";
  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <Breadcrumb
        items={[
          { label: "Trang chủ", href: "/" },
          { label: "Vật tư", href: "/items" },
          { label: "Nhập Excel" },
        ]}
        className="mb-2"
      />
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Nhập vật tư từ Excel
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Upload → Khớp cột → Preview → Commit. Tuân theo template chuẩn hoặc
          ánh xạ cột tuỳ biến.
        </p>
      </header>
      <ImportWizard userId={userId} />
    </div>
  );
}
