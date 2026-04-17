import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-3 py-10">
      <header className="mb-6">
        <p className="font-mono text-sm text-slate-500">v0.1.0 · foundation</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 md:text-4xl">
          he-thong-iot — Xưởng IoT
        </h1>
        <p className="mt-2 max-w-2xl text-base text-slate-600">
          Hệ thống MES/ERP nhẹ, BOM-centric cho xưởng cơ khí Việt Nam. Đăng
          nhập để truy cập bảng điều khiển đơn hàng, BOM, tồn kho và lắp ráp.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <Link
          href="/login"
          className="group rounded-md border border-slate-200 bg-white p-3 transition hover:border-cta hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-slate-900">
              Đăng nhập
            </span>
            <span
              aria-hidden
              className="text-cta transition group-hover:translate-x-1"
            >
              →
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            4 role: Quản trị, Kế hoạch, Thủ kho, Công nhân xưởng.
          </p>
        </Link>

        <Link
          href="/api/health"
          className="group rounded-md border border-slate-200 bg-white p-3 transition hover:border-info"
        >
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-slate-900">
              Kiểm tra hệ thống
            </span>
            <span aria-hidden className="font-mono text-info">
              /api/health
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Liveness và readiness cho giám sát (UptimeRobot, Telegram alert).
          </p>
        </Link>
      </section>

      <footer className="mt-10 text-xs text-slate-500">
        Phiên bản V1 · 10 tuần · {new Date().getFullYear()} · Nội bộ
      </footer>
    </div>
  );
}
