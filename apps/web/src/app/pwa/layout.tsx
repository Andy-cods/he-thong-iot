import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PWA layout — tách ra khỏi `(app)` group. Minimal chrome (không sidebar /
 * topbar) để tập trung vào workflow quét/nhập.
 *
 * Auth vẫn bắt buộc: verify JWT trong RSC, redirect /login nếu miss.
 */
export default async function PwaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) redirect("/login?next=/pwa");
  const payload = await verifyAccessToken(token);
  if (!payload) redirect("/login?next=/pwa");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-topbar flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-2 rounded px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:shadow-focus"
          aria-label="Về trang chính"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Thoát PWA
        </Link>
        <span className="ml-auto text-sm font-semibold text-slate-900">
          Trạm nhận hàng
        </span>
      </header>
      <main id="main" className="pb-20">
        {children}
      </main>
    </div>
  );
}
