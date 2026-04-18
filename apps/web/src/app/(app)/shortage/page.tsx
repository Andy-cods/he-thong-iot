"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ShortageListTable } from "@/components/shortage/ShortageListTable";
import { BulkCreatePRDialog } from "@/components/shortage/BulkCreatePRDialog";
import {
  useShortageList,
  useRefreshShortageView,
} from "@/hooks/useShortage";
import { useSession } from "@/hooks/useSession";
import type { ShortageBoardFilter } from "@/lib/query-keys";

/**
 * /shortage — Shortage Board (admin+planner).
 *
 * - Polling 60s qua useShortageList.
 * - Manual Refresh button (trigger REFRESH MV).
 * - Filter: search SKU/Name + minShortQty.
 * - Multi-select → BulkActionBar "Tạo PR bulk" mở dialog.
 * - Single row action "Tạo PR" → redirect /procurement/purchase-requests/new?fromShortage=id.
 */
export default function ShortagePage() {
  const router = useRouter();
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const canManage = roles.includes("admin") || roles.includes("planner");

  const [q, setQ] = React.useState("");
  const [minShort, setMinShort] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const filter: ShortageBoardFilter = React.useMemo(
    () => ({
      q: q.trim() || undefined,
      minShortQty: minShort ? Number(minShort) : undefined,
      limit: 500,
    }),
    [q, minShort],
  );

  const query = useShortageList(filter);
  const refresh = useRefreshShortageView();

  const rows = query.data?.data ?? [];

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleTogglePage = (ids: string[]) => {
    setSelected((prev) => {
      const allIn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allIn) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const handleCreatePRSingle = (itemId: string) => {
    router.push(
      `/procurement/purchase-requests/new?fromShortage=${itemId}`,
    );
  };

  const handleRefresh = async () => {
    try {
      await refresh.mutateAsync();
      toast.success("Đã refresh shortage view.");
    } catch (err) {
      toast.error(`Refresh thất bại: ${(err as Error).message}`);
    }
  };

  const selectedIds = Array.from(selected);
  const isEmpty = !query.isLoading && rows.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 hover:underline">
              Tổng quan
            </Link>
            {" / "}
            <span className="text-zinc-900">Thiếu hàng</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Thiếu hàng (Shortage Board)
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {rows.length} item shortage · auto-refresh 60s
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleRefresh()}
              disabled={refresh.isPending}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Refresh
            </Button>
          )}
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-6 py-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm SKU / Tên…"
          className="h-8 max-w-sm"
        />
        <Input
          value={minShort}
          onChange={(e) => setMinShort(e.target.value)}
          placeholder="Min short qty"
          type="number"
          className="h-8 max-w-[140px]"
        />
        {selected.size > 0 && canManage && (
          <Button
            size="sm"
            onClick={() => setBulkOpen(true)}
            className="ml-auto"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Tạo PR bulk ({selected.size})
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {isEmpty ? (
          <EmptyState
            preset="no-bom"
            title="Không có shortage nào"
            description="Tất cả item đang đủ số lượng hoặc đã có PR/PO bao phủ."
          />
        ) : (
          <ShortageListTable
            rows={rows}
            loading={query.isLoading}
            selectedIds={selected}
            onToggle={handleToggle}
            onTogglePage={handleTogglePage}
            onCreatePRSingle={handleCreatePRSingle}
          />
        )}
      </div>

      <BulkCreatePRDialog
        open={bulkOpen}
        itemIds={selectedIds}
        onOpenChange={setBulkOpen}
        onSuccess={(prId) => {
          setSelected(new Set());
          router.push(`/procurement/purchase-requests/${prId}`);
        }}
      />
    </div>
  );
}
