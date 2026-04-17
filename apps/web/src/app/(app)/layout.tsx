import Link from "next/link";
import { Boxes, FileUp, LogOut, Package, Truck } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, verifyAccessToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { href: "/items", label: "Danh mục vật tư", icon: Package },
  { href: "/items/import", label: "Nhập Excel", icon: FileUp },
  { href: "/suppliers", label: "Nhà cung cấp", icon: Truck },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) redirect("/login");
  const payload = await verifyAccessToken(token);
  if (!payload) redirect("/login");

  return (
    <div className="flex min-h-screen w-full bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-3">
          <Boxes className="h-5 w-5 text-cta" aria-hidden />
          <span className="font-heading text-base font-semibold text-slate-900">
            he-thong-iot
          </span>
        </div>
        <nav className="flex-1 px-2 py-3">
          <ul className="space-y-0.5">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className="flex h-10 items-center gap-2 rounded px-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/35"
                >
                  <n.icon className="h-4 w-4" aria-hidden />
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-slate-200 p-2">
          <div className="mb-2 text-xs text-slate-500">
            <div className="font-medium text-slate-700">{payload.usr}</div>
            <div>{payload.roles.join(", ")}</div>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Đăng xuất
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">{children}</div>
    </div>
  );
}
