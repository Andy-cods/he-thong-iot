import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Factory } from "lucide-react";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * V2 PWA layout — minimal chrome cho workflow quét/nhận hàng tablet.
 *
 * - Header h-12 px-4 border-b zinc-200 bg-white (thay slate-200 V1).
 * - Logo (Factory icon 14 + "MES Xưởng" 13) · user name (from JWT) · Thoát.
 * - ScanQueueBadge được render trong từng page con (không floating chung
 *   để tránh conflict khi ngoài flow receive).
 * - main pb-20 cho action bar bottom sticky room.
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

  const username = payload.usr ?? payload.sub ?? "User";

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-topbar flex h-12 items-center gap-3 border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-1.5">
          <Factory
            className="h-3.5 w-3.5 text-zinc-500"
            aria-hidden="true"
          />
          <span className="text-base font-semibold text-zinc-900">
            MES Xưởng
          </span>
          <span className="text-xs text-zinc-500">· PWA</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-zinc-600 sm:inline">
            {username}
          </span>
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            aria-label="Thoát PWA"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Thoát
          </Link>
        </div>
      </header>
      <main id="main" className="pb-20">
        {children}
      </main>
    </div>
  );
}
