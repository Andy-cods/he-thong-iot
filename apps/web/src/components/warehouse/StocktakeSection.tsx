"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-badge";
import { formatDate, formatQty } from "@/lib/format";
import { StocktakeCreateSheet } from "./StocktakeCreateSheet";
import { StocktakeSessionSheet } from "./StocktakeSessionSheet";

/**
 * V4.3 Việc 2 — Section "Kiểm kê kho" trong tab Báo cáo kho (gộp chung, không
 * thêm tab cấp 1 mới — mục 3 `WAREHOUSE_UX_AND_FLOW.md`).
 */

interface SessionRow {
  id: string;
  code: string;
  status: string;
  scope_note: string | null;
  created_at: string;
  creator_name: string | null;
  line_count: number;
  counted_count: number;
  bin_count: number;
}

export function StocktakeSection() {
  const searchParams = useSearchParams();
  const [rows, setRows] = React.useState<SessionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [openSessionId, setOpenSessionId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/warehouse/stocktake?pageSize=30");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: SessionRow[] };
      setRows(json.data ?? []);
    } catch {
      // im lặng — section phụ, không chặn cả trang Báo cáo kho.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Mở đúng phiên khi tới từ link thông báo (?tab=report&stocktake=<id>).
  React.useEffect(() => {
    const id = searchParams?.get("stocktake");
    if (id) setOpenSessionId(id);
  }, [searchParams]);

  return (
    // V4.4 B (tự rà màn mới) — card container đổi về token V4.3 §2.2
    // (rounded-xl + shadow-xs, không viền) khớp chuẩn chung.
    <section className="rounded-xl bg-white shadow-xs dark:bg-zinc-900">
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            <ClipboardList className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            Kiểm kê kho
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Chụp tồn sổ sách → đếm thực tế → Giám đốc duyệt chốt ghi điều chỉnh.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Tạo phiên
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Chưa có phiên kiểm kê nào.
        </p>
      ) : (
        <>
          {/* V4.4 B — thêm card-list mobile (bảng 6 cột trước không có nhánh
              < md, N9). */}
          <table className="hidden w-full text-sm md:table">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Mã phiếu</th>
                <th className="px-3 py-2 text-left">Phạm vi</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-right">Tiến độ đếm</th>
                <th className="px-3 py-2 text-left">Người tạo</th>
                <th className="px-3 py-2 text-left">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60"
                  onClick={() => setOpenSessionId(r.id)}
                >
                  <td className="px-3 py-2 font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                    {r.code}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {r.scope_note ?? `${r.bin_count} ô`}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill domain="stocktake" code={r.status} />
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                    {r.counted_count}/{r.line_count}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{r.creator_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatDate(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
            {rows.map((r) => (
              <li
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenSessionId(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setOpenSessionId(r.id);
                }}
                className="flex min-h-[44px] cursor-pointer items-start justify-between gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">{r.code}</span>
                    <StatusPill domain="stocktake" code={r.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
                    {r.scope_note ?? `${r.bin_count} ô`} · {r.creator_name ?? "—"} · {formatDate(r.created_at)}
                  </p>
                </div>
                <span className="shrink-0 text-right text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {formatQty(r.counted_count)}/{formatQty(r.line_count)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <StocktakeCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          void load();
          setOpenSessionId(id);
        }}
      />
      <StocktakeSessionSheet
        sessionId={openSessionId}
        open={openSessionId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenSessionId(null);
        }}
        onChanged={() => void load()}
      />
    </section>
  );
}
