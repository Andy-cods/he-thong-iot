"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Đang đếm",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị trả lại",
  CANCELLED: "Đã huỷ",
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  APPROVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  REJECTED: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  CANCELLED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

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
    <section className="rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Chưa có phiên kiểm kê nào.
        </p>
      ) : (
        <table className="w-full text-sm">
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
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[r.status])}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                  {r.counted_count}/{r.line_count}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{r.creator_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(r.created_at).toLocaleDateString("vi-VN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
