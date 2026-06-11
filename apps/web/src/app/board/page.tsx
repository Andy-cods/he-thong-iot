"use client";

import * as React from "react";
import { useProductionBoard, type BoardItem, type BoardStatus } from "@/hooks/useProductionBoard";

/**
 * V3.8 — /board — Màn hình "bảng chờ chuyến bay" chiếu TV xưởng.
 *
 * - Full-screen, nền tối, font lớn tương phản cao cho TV.
 * - Auto-refresh 15s (React Query refetchInterval).
 * - Nếu nhiều mã đang chạy → tự động cuộn trang (page cycling 12s).
 * - Dải dưới: 3-5 mã vừa hoàn thành.
 * - Không sidebar (route ngoài (app) group). Auth qua middleware.
 *
 * Cách dùng trên TV: mở trình duyệt TV → đăng nhập 1 lần → vào /board →
 * full-screen (F11). Bảng tự cập nhật, không cần thao tác.
 */

const ROWS_PER_PAGE = 8;
const PAGE_CYCLE_MS = 12_000;

const STATUS_META: Record<
  BoardStatus,
  { label: string; dot: string; chip: string; row: string }
> = {
  IN_PROGRESS: {
    label: "ĐANG GIA CÔNG",
    dot: "bg-orange-400",
    chip: "bg-orange-500/20 text-orange-300 ring-orange-500/40",
    row: "animate-pulse-slow",
  },
  QC: {
    label: "ĐANG KIỂM (QC)",
    dot: "bg-sky-400",
    chip: "bg-sky-500/20 text-sky-300 ring-sky-500/40",
    row: "",
  },
  QUEUED: {
    label: "SẮP GIA CÔNG",
    dot: "bg-zinc-400",
    chip: "bg-zinc-500/20 text-zinc-300 ring-zinc-500/40",
    row: "",
  },
  COMPLETED: {
    label: "HOÀN THÀNH",
    dot: "bg-emerald-400",
    chip: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
    row: "",
  },
  DELIVERED: {
    label: "ĐÃ GIAO",
    dot: "bg-slate-500",
    chip: "bg-slate-600/20 text-slate-400 ring-slate-600/40",
    row: "opacity-60",
  },
};

function useClock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function fmtClock(d: Date | null): { time: string; date: string } {
  if (!d) return { time: "--:--:--", date: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  const dow = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.getDay()];
  return {
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    date: `${dow} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
  };
}

function deadlineTone(deadline: string | null): string {
  if (!deadline) return "text-zinc-500";
  const d = new Date(deadline).getTime();
  const now = Date.now();
  const days = (d - now) / 86_400_000;
  if (days < 0) return "text-red-400 font-bold"; // quá hạn
  if (days <= 3) return "text-amber-300 font-semibold"; // sắp hết hạn
  return "text-zinc-300";
}

function fmtDeadline(deadline: string | null): string {
  if (!deadline) return "—";
  const d = new Date(deadline);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function ProgressBar({ done, planned }: { done: number; planned: number }) {
  const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-700/60">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            pct >= 100
              ? "bg-emerald-400"
              : pct > 0
                ? "bg-orange-400"
                : "bg-zinc-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-right font-mono text-xl tabular-nums text-zinc-200">
        {pct}%
      </span>
    </div>
  );
}

export default function BoardPage() {
  const now = useClock();
  const clock = fmtClock(now);
  const { data, isLoading, isError } = useProductionBoard({
    completedLimit: 5,
    refetchInterval: 15_000,
  });

  const items = data?.data ?? [];
  const active = items.filter(
    (i) => i.status === "QUEUED" || i.status === "IN_PROGRESS" || i.status === "QC",
  );
  const completed = items.filter(
    (i) => i.status === "COMPLETED" || i.status === "DELIVERED",
  );

  // Page cycling cho active rows.
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
  // Clamp page nếu list co lại.
  React.useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  const pageItems = active.slice(
    page * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE + ROWS_PER_PAGE,
  );

  const counts = data?.counts;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b-2 border-zinc-800 bg-gradient-to-r from-zinc-900 to-zinc-950 px-8 py-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/logo-gtam.png"
            alt="GTAM"
            className="h-12 w-auto object-contain"
          />
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white">
              BẢNG ĐIỀU HÀNH SẢN XUẤT
            </h1>
            <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
              Xưởng cơ khí GTAM · Production Board
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {/* Counts */}
          {counts && (
            <div className="flex items-center gap-4 text-center">
              <Counter n={counts.IN_PROGRESS} label="Đang GC" color="text-orange-400" />
              <Counter n={counts.QC} label="QC" color="text-sky-400" />
              <Counter n={counts.QUEUED} label="Sắp GC" color="text-zinc-300" />
            </div>
          )}
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 font-mono text-4xl font-bold tabular-nums text-white">
              {clock.time}
              <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/40">
                <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
                LIVE
              </span>
            </div>
            <p className="text-base font-medium text-zinc-400">{clock.date}</p>
          </div>
        </div>
      </header>

      {/* Main board */}
      <main className="flex flex-1 flex-col overflow-hidden px-8 py-5">
        {/* Table header */}
        <div className="grid grid-cols-[3rem_11rem_1fr_6rem_9rem_16rem_13rem] items-center gap-4 border-b border-zinc-800 px-4 pb-3 text-sm font-bold uppercase tracking-wider text-zinc-500">
          <span>#</span>
          <span>Mã hàng</span>
          <span>Sản phẩm</span>
          <span className="text-center">KH</span>
          <span className="text-right">SL (đạt/KH)</span>
          <span>Tiến độ</span>
          <span className="text-center">Trạng thái</span>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-2xl text-zinc-600">
              Đang tải bảng…
            </div>
          ) : isError ? (
            <div className="flex h-full items-center justify-center text-2xl text-red-400">
              Lỗi kết nối — đang thử lại…
            </div>
          ) : active.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-600">
              <span className="text-6xl">🏭</span>
              <span className="text-2xl">Chưa có mã hàng nào đang chạy</span>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              {pageItems.map((it, idx) => (
                <BoardRow
                  key={it.id}
                  item={it}
                  index={page * ROWS_PER_PAGE + idx + 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Page indicator */}
        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            {Array.from({ length: pageCount }).map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === page ? "w-8 bg-orange-400" : "w-2 bg-zinc-700"
                }`}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer: vừa hoàn thành */}
      <footer className="border-t-2 border-zinc-800 bg-zinc-900/80 px-8 py-4">
        <div className="flex items-center gap-4">
          <span className="flex shrink-0 items-center gap-2 text-lg font-bold text-emerald-400">
            <span className="text-2xl">✓</span> VỪA HOÀN THÀNH
          </span>
          <div className="flex flex-1 items-center gap-3 overflow-hidden">
            {completed.length === 0 ? (
              <span className="text-zinc-600">— Chưa có</span>
            ) : (
              completed.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2 text-lg font-semibold text-emerald-200 ring-1 ring-emerald-500/30"
                >
                  <span className="font-mono text-emerald-400">
                    {shortCode(c.productCode)}
                  </span>
                  <span className="max-w-[18rem] truncate text-emerald-100/80">
                    {firstLine(c.productName)}
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes pulse-slow {
          0%,
          100% {
            background-color: rgba(249, 115, 22, 0.06);
          }
          50% {
            background-color: rgba(249, 115, 22, 0.14);
          }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function BoardRow({ item, index }: { item: BoardItem; index: number }) {
  const meta = STATUS_META[item.status];
  const done = Number(item.qtyDone) || 0;
  const planned = Number(item.qtyPlanned) || 0;
  return (
    <div
      className={`grid grid-cols-[3rem_11rem_1fr_6rem_9rem_16rem_13rem] items-center gap-4 rounded-xl px-4 py-3 ${meta.row} ${
        item.isPinned ? "ring-1 ring-orange-500/30" : ""
      }`}
      style={{ minHeight: "4.2rem" }}
    >
      <span className="font-mono text-2xl font-bold text-zinc-600">
        {item.isPinned ? "★" : index}
      </span>
      <span className="font-mono text-2xl font-bold tracking-tight text-white">
        {shortCode(item.productCode)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-2xl font-semibold text-zinc-100">
          {firstLine(item.productName)}
        </p>
        {item.currentStage && (
          <p className="truncate text-base text-zinc-500">
            ▸ {item.currentStage}
          </p>
        )}
      </div>
      <span className="text-center text-xl font-medium text-zinc-300">
        {item.customer ?? "—"}
      </span>
      <div className="text-right">
        <span className="font-mono text-3xl font-bold tabular-nums text-white">
          {done.toLocaleString("vi-VN")}
        </span>
        <span className="font-mono text-xl text-zinc-500">
          /{planned.toLocaleString("vi-VN")}
        </span>
        <span className="ml-1 text-base text-zinc-600">{item.uom}</span>
      </div>
      <ProgressBar done={done} planned={planned} />
      <div className="flex flex-col items-center gap-1">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-lg font-bold ring-1 ring-inset ${meta.chip}`}
        >
          <span className={`h-3 w-3 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {item.deadline && (
          <span className={`text-sm ${deadlineTone(item.deadline)}`}>
            Hạn: {fmtDeadline(item.deadline)}
          </span>
        )}
      </div>
    </div>
  );
}

function Counter({
  n,
  label,
  color,
}: {
  n: number;
  label: string;
  color: string;
}) {
  return (
    <div className="text-center">
      <p className={`font-mono text-4xl font-black tabular-nums ${color}`}>
        {n}
      </p>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-600">
        {label}
      </p>
    </div>
  );
}

/** Rút gọn mã BQMS dài (Z0000002-259491 → 259491). */
function shortCode(code: string): string {
  const m = code.match(/-(\d+)$/);
  return m?.[1] ?? code;
}

/** Lấy dòng đầu của spec (Excel có spec nhiều dòng \n). */
function firstLine(s: string): string {
  return s.split(/[\n,]/)[0]?.trim() || s;
}
