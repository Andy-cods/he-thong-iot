"use client";

import * as React from "react";
import {
  useProductionBoard,
  type BoardItem,
  type BoardStatus,
} from "@/hooks/useProductionBoard";

/**
 * V3.8.1 — /board — Bảng thông báo sản xuất phong cách "departure board" sân bay.
 *
 * Thiết kế: nền navy sâu + accent vàng hổ phách (Solari), mono tabular-nums,
 * zebra rows, status pill rõ ràng, ticker mã hoàn thành chạy ở chân màn.
 * 12 mã/trang, auto page-cycling 12s + fade, đồng hồ LIVE, auto-refresh 15s.
 *
 * Dùng trên TV: đăng nhập 1 lần → /board → F11 full-screen.
 */

const ROWS_PER_PAGE = 12;
const PAGE_CYCLE_MS = 12_000;

const STATUS_META: Record<
  BoardStatus,
  { label: string; dot: string; chip: string; bar: string; boarding?: boolean }
> = {
  IN_PROGRESS: {
    label: "ĐANG GIA CÔNG",
    dot: "bg-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.6)]",
    chip: "bg-amber-400/15 text-amber-300 ring-amber-400/40",
    bar: "from-amber-500 to-amber-300",
    boarding: true,
  },
  QC: {
    label: "KIỂM TRA QC",
    dot: "bg-cyan-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.5)]",
    chip: "bg-cyan-400/15 text-cyan-300 ring-cyan-400/40",
    bar: "from-cyan-500 to-cyan-300",
  },
  QUEUED: {
    label: "CHỜ SẢN XUẤT",
    dot: "bg-slate-400",
    chip: "bg-slate-400/10 text-slate-300 ring-slate-400/30",
    bar: "from-slate-500 to-slate-400",
  },
  COMPLETED: {
    label: "HOÀN THÀNH",
    dot: "bg-emerald-400",
    chip: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40",
    bar: "from-emerald-500 to-emerald-300",
  },
  DELIVERED: {
    label: "ĐÃ GIAO",
    dot: "bg-slate-500",
    chip: "bg-slate-500/10 text-slate-400 ring-slate-500/30",
    bar: "from-slate-600 to-slate-500",
  },
};

const GRID =
  "grid grid-cols-[13rem_1fr_5rem_9.5rem_15rem_6.5rem_13rem] items-center gap-4";

function useClock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmtClock(d: Date | null): { time: string; sec: string; date: string } {
  if (!d) return { time: "--:--", sec: "--", date: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  const dow = ["CHỦ NHẬT", "THỨ HAI", "THỨ BA", "THỨ TƯ", "THỨ NĂM", "THỨ SÁU", "THỨ BẢY"][
    d.getDay()
  ];
  return {
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    sec: pad(d.getSeconds()),
    date: `${dow} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
  };
}

function deadlineInfo(deadline: string | null): { text: string; cls: string } {
  if (!deadline) return { text: "—", cls: "text-slate-600" };
  const d = new Date(deadline);
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const days = (d.getTime() - Date.now()) / 86_400_000;
  if (days < 0) return { text, cls: "text-rose-400 font-bold" };
  if (days <= 3) return { text, cls: "text-amber-300 font-semibold" };
  return { text, cls: "text-slate-300" };
}

export default function BoardPage() {
  const now = useClock();
  const clock = fmtClock(now);
  const { data, isLoading, isError } = useProductionBoard({
    completedLimit: 8,
    refetchInterval: 15_000,
  });

  const items = data?.data ?? [];
  const active = items.filter(
    (i) =>
      i.status === "QUEUED" ||
      i.status === "IN_PROGRESS" ||
      i.status === "QC",
  );
  const completed = items.filter(
    (i) => i.status === "COMPLETED" || i.status === "DELIVERED",
  );

  const pageCount = Math.max(1, Math.ceil(active.length / ROWS_PER_PAGE));
  const [page, setPage] = React.useState(0);
  React.useEffect(() => {
    if (pageCount <= 1) {
      setPage(0);
      return;
    }
    const t = setInterval(
      () => setPage((p) => (p + 1) % pageCount),
      PAGE_CYCLE_MS,
    );
    return () => clearInterval(t);
  }, [pageCount]);
  React.useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  const pageItems = active.slice(
    page * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE + ROWS_PER_PAGE,
  );
  const counts = data?.counts;
  const totalActive =
    (counts?.IN_PROGRESS ?? 0) + (counts?.QC ?? 0) + (counts?.QUEUED ?? 0);

  return (
    <div className="board-root flex h-screen w-screen flex-col overflow-hidden text-slate-100">
      {/* ===== Header ===== */}
      <header className="relative flex items-center justify-between px-10 py-4">
        <div className="flex items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/logo-gtam.png"
            alt="GTAM"
            className="h-14 w-auto object-contain drop-shadow"
          />
          <div>
            <h1 className="text-[2rem] font-black uppercase leading-none tracking-[0.18em] text-white">
              Bảng Sản Xuất
            </h1>
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.35em] text-amber-400/90">
              Xưởng cơ khí GTAM — Production Status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          {counts && (
            <div className="flex items-center gap-6">
              <HeaderStat n={counts.IN_PROGRESS} label="Đang GC" tone="text-amber-300" />
              <HeaderStat n={counts.QC} label="QC" tone="text-cyan-300" />
              <HeaderStat n={counts.QUEUED} label="Chờ SX" tone="text-slate-300" />
            </div>
          )}
          <div className="h-12 w-px bg-amber-400/20" />
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-1 font-mono font-bold tabular-nums leading-none text-white">
              <span className="text-[2.6rem]">{clock.time}</span>
              <span className="text-2xl text-amber-400/80">:{clock.sec}</span>
              <span className="ml-3 inline-flex items-center gap-1.5 self-center rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold tracking-wider text-emerald-300 ring-1 ring-emerald-400/40">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                LIVE
              </span>
            </div>
            <p className="mt-1.5 text-sm font-medium uppercase tracking-widest text-slate-400">
              {clock.date}
            </p>
          </div>
        </div>
        {/* frame accent */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
      </header>

      {/* ===== Column header ===== */}
      <div
        className={`${GRID} mx-10 mt-3 border-b border-amber-400/20 px-4 pb-2.5 text-[13px] font-bold uppercase tracking-[0.15em] text-amber-400/80`}
      >
        <span>Mã hàng</span>
        <span>Sản phẩm</span>
        <span className="text-center">KH</span>
        <span className="text-right">SL đạt / KH</span>
        <span>Tiến độ</span>
        <span className="text-center">Hạn</span>
        <span className="text-center">Trạng thái</span>
      </div>

      {/* ===== Rows ===== */}
      <main className="flex flex-1 flex-col overflow-hidden px-10 pt-1">
        {isLoading ? (
          <Center>Đang tải bảng…</Center>
        ) : isError ? (
          <Center className="text-rose-400">Lỗi kết nối — đang thử lại…</Center>
        ) : active.length === 0 ? (
          <Center>
            <span className="mb-3 block text-7xl opacity-40">🛬</span>
            Chưa có lệnh nào đang chạy
          </Center>
        ) : (
          <div key={page} className="board-page flex flex-1 flex-col">
            {pageItems.map((it, idx) => (
              <BoardRow
                key={it.id}
                item={it}
                zebra={idx % 2 === 1}
              />
            ))}
          </div>
        )}

        {/* page dots */}
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-2 py-2">
            {Array.from({ length: pageCount }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === page ? "w-10 bg-amber-400" : "w-1.5 bg-slate-700"
                }`}
              />
            ))}
            <span className="ml-3 font-mono text-xs text-slate-500">
              {page + 1}/{pageCount} · {totalActive} lệnh
            </span>
          </div>
        )}
      </main>

      {/* ===== Ticker: vừa hoàn thành ===== */}
      <footer className="relative flex items-center gap-5 border-t border-amber-400/20 bg-black/30 px-10 py-3.5">
        <span className="z-10 flex shrink-0 items-center gap-2 rounded-md bg-emerald-400/10 px-3 py-1.5 text-sm font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/30">
          <span className="text-base">✓</span> Vừa hoàn thành
        </span>
        <div className="relative flex-1 overflow-hidden">
          {completed.length === 0 ? (
            <span className="text-slate-600">— Chưa có</span>
          ) : (
            <div className="ticker-track flex w-max items-center gap-10">
              {[...completed, ...completed].map((c, i) => (
                <span
                  key={`${c.id}-${i}`}
                  className="inline-flex shrink-0 items-center gap-2.5 text-base"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="font-mono font-bold text-emerald-300">
                    {shortCode(c.productCode)}
                  </span>
                  <span className="text-slate-400">
                    {firstLine(c.productName)}
                  </span>
                  {c.customer && (
                    <span className="text-slate-600">· {c.customer}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </footer>

      <style jsx global>{`
        .board-root {
          background:
            radial-gradient(120% 80% at 50% -10%, #16203a 0%, transparent 55%),
            linear-gradient(180deg, #0b1124 0%, #070a16 100%);
        }
        @keyframes boardPageIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .board-page {
          animation: boardPageIn 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes boardingPulse {
          0%,
          100% {
            background-color: rgba(251, 191, 36, 0.05);
          }
          50% {
            background-color: rgba(251, 191, 36, 0.12);
          }
        }
        .row-boarding {
          animation: boardingPulse 2.4s ease-in-out infinite;
        }
        @keyframes tickerScroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        .ticker-track {
          animation: tickerScroll 42s linear infinite;
        }
      `}</style>
    </div>
  );
}

function BoardRow({ item, zebra }: { item: BoardItem; zebra: boolean }) {
  const meta = STATUS_META[item.status];
  const done = Number(item.qtyDone) || 0;
  const planned = Number(item.qtyPlanned) || 0;
  const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
  const dl = deadlineInfo(item.deadline);

  return (
    <div
      className={[
        GRID,
        "flex-1 rounded-lg px-4",
        zebra ? "bg-white/[0.018]" : "",
        item.isPinned
          ? "border-l-[3px] border-amber-400 bg-amber-400/[0.05]"
          : "border-l-[3px] border-transparent",
        meta.boarding ? "row-boarding" : "",
      ].join(" ")}
    >
      {/* Mã hàng */}
      <div className="flex items-center gap-2">
        {item.isPinned && (
          <span className="text-lg leading-none text-amber-400">★</span>
        )}
        <span className="font-mono text-[1.7rem] font-bold leading-none tracking-tight text-white">
          {shortCode(item.productCode)}
        </span>
      </div>

      {/* Sản phẩm + công đoạn */}
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold leading-tight text-slate-100">
          {firstLine(item.productName)}
        </p>
        {item.currentStage && (
          <p className="mt-0.5 truncate text-sm font-medium text-amber-400/70">
            ▸ {item.currentStage}
          </p>
        )}
      </div>

      {/* KH */}
      <span className="text-center text-lg font-semibold text-slate-300">
        {item.customer ?? "—"}
      </span>

      {/* SL */}
      <div className="text-right leading-none">
        <span className="font-mono text-[1.7rem] font-bold tabular-nums text-white">
          {done.toLocaleString("vi-VN")}
        </span>
        <span className="font-mono text-lg text-slate-500">
          /{planned.toLocaleString("vi-VN")}
        </span>
        <span className="ml-1 text-sm text-slate-600">{item.uom}</span>
      </div>

      {/* Tiến độ */}
      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${meta.bar} transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-11 text-right font-mono text-lg font-semibold tabular-nums text-slate-200">
          {pct}%
        </span>
      </div>

      {/* Hạn */}
      <span className={`text-center font-mono text-lg tabular-nums ${dl.cls}`}>
        {dl.text}
      </span>

      {/* Trạng thái */}
      <div className="flex justify-center">
        <span
          className={`inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-base font-bold uppercase tracking-wide ring-1 ring-inset ${meta.chip}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>
    </div>
  );
}

function HeaderStat({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: string;
}) {
  return (
    <div className="text-center">
      <p className={`font-mono text-[2.1rem] font-black leading-none tabular-nums ${tone}`}>
        {n}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
    </div>
  );
}

function Center({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center text-center text-2xl text-slate-500 ${className}`}
    >
      {children}
    </div>
  );
}

function shortCode(code: string): string {
  const m = code.match(/-(\d+)$/);
  return m?.[1] ?? code;
}
function firstLine(s: string): string {
  return s.split(/[\n,]/)[0]?.trim() || s;
}
