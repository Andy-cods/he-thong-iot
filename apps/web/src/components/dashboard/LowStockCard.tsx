"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, PackageOpen, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQty } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V3.2 LowStockCard — bảng top 5 SKU thiếu hàng cho Dashboard Tổng quan
 * (TASK-20260427-027).
 *
 * Data: GET /api/inventory/balance?hasLotOnly=true&pageSize=500 (endpoint có
 * sẵn, 500 = max cho phép theo zod ở route). Filter client-side
 * `available < minStockQty`, sort theo gap, top 5.
 *
 * Lý do client-side filter: endpoint hiện chưa có query param `lowStockOnly`,
 * tránh sửa repo + migration trong scope dashboard. Volume nhỏ, OK.
 *
 * V4.4 fix P2 (REGRESSION.md mục 3.7 — "treo ở trạng thái skeleton rỗng") —
 * không tái hiện được hiện tượng treo vĩnh viễn với code/dữ liệu hiện tại
 * (API thật trả 200 trong ~0.25s, `loading` luôn được set false trong
 * `finally` dù thành công/lỗi/abort — xác nhận qua Playwright trên staging).
 * Có 2 khả năng: (a) đã được sửa gián tiếp bởi 1 đợt dọn dẹp khác trước đó,
 * (b) chỉ xảy ra khi API chậm bất thường trên môi trường khác (nhiều dữ liệu
 * hơn, DB tải cao). Vá phòng thủ: thêm TIMEOUT cho request (không bao giờ
 * treo skeleton quá `FETCH_TIMEOUT_MS` dù backend không phản hồi) — đảm bảo
 * đúng yêu cầu "có dữ liệu thì hiện, rỗng thì empty state, lỗi thì trạng
 * thái lỗi — không bao giờ treo skeleton" trong MỌI trường hợp, không chỉ
 * trường hợp đã tái hiện được. Tăng `pageSize` 200→500 (max cho phép) để
 * giảm khả năng bỏ sót SKU thiếu hàng nằm ngoài trang đầu khi danh mục lớn.
 */

interface BalanceRow {
  itemId: string;
  sku: string;
  name: string;
  uom: string;
  category: string | null;
  minStockQty: number;
  onHand: number;
  reserved: number;
  holdQty: number;
  available: number;
}

interface BalanceResponse {
  data: BalanceRow[];
  meta?: { page: number; pageSize: number; total: number };
}

const POLL_MS = 120_000;
/** V4.4 fix P2 — timeout cứng cho request, đảm bảo không treo skeleton vô hạn. */
const FETCH_TIMEOUT_MS = 15_000;

// V4.4 (A3) — dùng `formatQty` (lib/format.ts, maxDecimals=2, không UOM vì
// cột đã có span ĐVT riêng) thay toLocaleString cục bộ.
function formatNum(n: number): string {
  return formatQty(n, null, 2);
}

interface LowStockCardProps {
  className?: string;
}

export function LowStockCard({ className }: LowStockCardProps) {
  const [rows, setRows] = React.useState<BalanceRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async (externalSignal?: AbortSignal) => {
    // V4.4 fix P2 — tách controller RIÊNG cho timeout, nối với externalSignal
    // (huỷ khi unmount/đổi hiệu lực). PHÂN BIỆT 2 lý do abort: unmount (im
    // lặng, component đã rời đi, không cần set state) vs HẾT GIỜ thật (phải
    // báo lỗi rõ cho người dùng) — nếu không phân biệt, request treo quá lâu
    // (backend chậm) sẽ không bao giờ rời trạng thái skeleton vì nhánh
    // AbortError cũ return thẳng, bỏ qua luôn cả setError.
    const timeoutCtrl = new AbortController();
    const onExternalAbort = () => timeoutCtrl.abort();
    externalSignal?.addEventListener("abort", onExternalAbort);
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(
        "/api/inventory/balance?hasLotOnly=true&pageSize=500",
        {
          signal: timeoutCtrl.signal,
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as BalanceResponse;
      const data = Array.isArray(payload?.data) ? payload.data : [];
      // Filter low-stock: minStockQty > 0 AND available < minStockQty.
      const low = data
        .filter((r) => r.minStockQty > 0 && r.available < r.minStockQty)
        .sort((a, b) => {
          const gapA = a.minStockQty - a.available;
          const gapB = b.minStockQty - b.available;
          return gapB - gapA;
        })
        .slice(0, 5);
      setRows(low);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        if (externalSignal?.aborted) return; // unmount — không cần cập nhật state
        setError("Tải tồn kho quá lâu, thử lại sau.");
        return;
      }
      setError("Không tải được tồn kho.");
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", onExternalAbort);
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const ctrl = new AbortController();
    void fetchData(ctrl.signal);
    const id = setInterval(() => fetchData(ctrl.signal), POLL_MS);
    return () => {
      clearInterval(id);
      ctrl.abort();
    };
  }, [fetchData]);

  return (
    <section
      className={cn(
        "dashboard-stagger-fade relative flex flex-col gap-4 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:p-5",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100/80 text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800/60"
          >
            <TrendingDown className="h-4 w-4" strokeWidth={2} />
          </span>
          <h2 className="text-[14px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Top SKU thiếu hàng
          </h2>
        </div>
        <Link
          href="/items?lowStock=true"
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-indigo-700 transition-colors hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
        >
          Xem tất cả
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </header>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows && rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-white/60 dark:border-zinc-800/70 dark:bg-zinc-900/60">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-zinc-200/70 bg-zinc-50/60 dark:border-zinc-800/70 dark:bg-zinc-800/40">
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  SKU
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  Còn lại
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  Tồn min
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  Trạng thái
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.minStockQty > 0
                  ? r.available / r.minStockQty
                  : 0;
                const critical = pct < 0.3;
                return (
                  <tr
                    key={r.itemId}
                    className="border-b border-zinc-100/70 last:border-0 transition-colors hover:bg-zinc-50/60 dark:border-zinc-800/70 dark:hover:bg-zinc-800/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/items/${r.itemId}`}
                        className="block min-w-0 group"
                      >
                        <p className="truncate font-mono text-[12px] font-semibold text-zinc-900 group-hover:text-indigo-700 dark:text-zinc-50 dark:group-hover:text-indigo-300">
                          {r.sku}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                          {r.name}
                        </p>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span
                        className={cn(
                          "font-semibold",
                          critical ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300",
                        )}
                      >
                        {formatNum(r.available)}
                      </span>
                      <span className="ml-1 text-[10.5px] text-zinc-500 dark:text-zinc-400">
                        {r.uom}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {formatNum(r.minStockQty)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
                          critical
                            ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200/60 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800/60"
                            : "bg-amber-100 text-amber-800 ring-1 ring-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800/60",
                        )}
                      >
                        {critical ? "Thiếu gấp" : "Sắp hết"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 py-10 dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-emerald-200/60 dark:bg-zinc-900 dark:ring-emerald-800/60">
            <PackageOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
          </div>
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            Tồn kho đầy đủ
          </p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Không có SKU nào dưới ngưỡng tối thiểu.
          </p>
        </div>
      )}
    </section>
  );
}
