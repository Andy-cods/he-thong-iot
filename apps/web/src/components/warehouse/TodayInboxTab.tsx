"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { StatTile } from "@/components/ui/data-table";
import { QueryError } from "@/components/ui/query-error";
import { cn } from "@/lib/utils";
import { formatDateTime, formatQty } from "@/lib/format";
import {
  useWarehouseToday,
  type TodayStagingLot,
} from "@/hooks/useWarehouseToday";
import {
  TransferDialog,
  type BinContent,
  type BinNode,
} from "@/components/warehouse/BinActions";

/**
 * V4.3 mục 3 — Tab "Việc cần làm hôm nay", MẶC ĐỊNH khi vào `/warehouse`.
 *
 * V4.3 Đợt 2 mục 4 — làm GIỐNG mẫu B đã duyệt (`huong-giao-dien.html` `.B`):
 * 4 ô số lớn (StatTile hero, ô "Chờ xếp kệ" tô xanh vì quan trọng nhất —
 * nhiều thao tác nhất/ca) phía trên, dưới là danh sách nhóm inset theo loại
 * việc (Chờ xếp kệ / Chờ duyệt xuất / PO sắp về / Chờ QC) — mỗi dòng: icon
 * vuông màu, tên + dòng phụ (mã chứng từ · gợi ý vị trí), số lượng, nút viên
 * thuốc hành động. Chỉ đọc `GET /api/warehouse/today` (gộp API có sẵn) +
 * `GET /api/warehouse/putaway-suggestion` (ĐÃ có, gọi thêm để hiện gợi ý vị
 * trí ngay trên danh sách — không đổi payload/API nào).
 */

interface LayoutBinsResponse {
  data?: { bins?: Array<BinNode & { area?: string | null; rack?: string | null }> };
}

interface PutawaySuggestionResponse {
  data?: Array<{ binFullCode: string }>;
}

/** Icon vuông màu (mock `.ico`) — 32px, bo 8px, icon trắng giữa. */
function RowIcon({
  icon: Icon,
  tone,
}: {
  icon: React.ElementType;
  tone: "blue" | "amber" | "emerald" | "red" | "violet";
}) {
  const toneClasses: Record<string, string> = {
    blue: "bg-blue-600",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    red: "bg-red-500",
    violet: "bg-violet-500",
  };
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white",
        toneClasses[tone],
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

/** Nút hành động dạng viên thuốc (mock `.act`) — nền xanh nhạt, chữ xanh đậm. */
function PillButton({
  children,
  onClick,
  href,
  disabled,
  tone = "blue",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: "blue" | "emerald";
}) {
  const toneClasses =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950/80"
      : "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/80";
  const classes = cn(
    "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    toneClasses,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}

function GroupCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h4 className="text-base font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </h4>
        {count > 0 && (
          <span className="text-base tabular-nums text-zinc-400 dark:text-zinc-500">{count}</span>
        )}
      </div>
      {/* V4.3 Đợt 2 mục 1 — thẻ trắng bo 14px KHÔNG viền, shadow rất nhẹ.
          `divide-y` tạo hairline giữa các dòng (mock `.row+.row::before`). */}
      <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl bg-white shadow-xs dark:divide-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-4 text-base text-zinc-500 dark:text-zinc-400">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
      {children}
    </div>
  );
}

function GroupRow({
  icon,
  tone,
  title,
  subtitle,
  qty,
  action,
}: {
  icon: React.ElementType;
  tone: "blue" | "amber" | "emerald" | "red" | "violet";
  title: React.ReactNode;
  subtitle: React.ReactNode;
  qty?: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-3">
      <RowIcon icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-medium text-zinc-900 dark:text-zinc-50">{title}</p>
        <p className="truncate text-base text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      </div>
      {qty ? (
        <span className="shrink-0 tabular-nums text-lg font-medium text-zinc-900 dark:text-zinc-50">
          {qty}
        </span>
      ) : null}
      {action}
    </div>
  );
}

/** Hook nhỏ: prefetch gợi ý vị trí cho DANH SÁCH lô chờ xếp kệ (hiện inline ở
 * dòng phụ "SKU · gợi ý A-01-1-01"), dùng lại đúng API/contract của nút
 * "Xếp kệ" — chỉ gọi thêm, KHÔNG đổi payload/endpoint. */
function useStagingSuggestions(
  items: TodayStagingLot[],
  excludeBinId: string | null | undefined,
) {
  const [suggestions, setSuggestions] = React.useState<Record<string, string>>({});
  const key = items.map((i) => `${i.lotSerialId}:${i.itemId}:${i.qty}`).join(",");

  React.useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        items.map(async (lot) => {
          try {
            const params = new URLSearchParams({
              itemId: lot.itemId,
              qty: String(lot.qty || 1),
            });
            if (excludeBinId) params.set("excludeBinIds", excludeBinId);
            const res = await fetch(`/api/warehouse/putaway-suggestion?${params.toString()}`);
            if (!res.ok) return [lot.lotSerialId, null] as const;
            const json = (await res.json()) as PutawaySuggestionResponse;
            return [lot.lotSerialId, json.data?.[0]?.binFullCode ?? null] as const;
          } catch {
            return [lot.lotSerialId, null] as const;
          }
        }),
      );
      if (!cancelled) {
        setSuggestions(
          Object.fromEntries(entries.filter((e): e is [string, string] => !!e[1])),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, excludeBinId]);

  return suggestions;
}

export function TodayInboxTab() {
  const { data, isLoading, isError, error, refetch, isFetching } = useWarehouseToday();
  const [bins, setBins] = React.useState<Array<BinNode & { area?: string | null; rack?: string | null }>>([]);
  const [putawayTarget, setPutawayTarget] = React.useState<{
    lot: TodayStagingLot;
    initialToBinId?: string;
  } | null>(null);
  const [approvingId, setApprovingId] = React.useState<string | null>(null);

  const stagingItems = React.useMemo(() => data?.staging.items ?? [], [data?.staging.items]);
  const suggestions = useStagingSuggestions(stagingItems, data?.staging.binId);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/warehouse/layout");
        const json = (await res.json()) as LayoutBinsResponse;
        if (!cancelled) setBins((json.data?.bins ?? []).filter((b) => b.isActive));
      } catch {
        // ignore — dialog vẫn mở được, chỉ thiếu danh sách bin đích đầy đủ
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPutaway = async (lot: TodayStagingLot) => {
    const stagingBinId = data?.staging.binId;
    let initialToBinId: string | undefined;
    try {
      const params = new URLSearchParams({
        itemId: lot.itemId,
        qty: String(lot.qty || 1),
      });
      if (stagingBinId) params.set("excludeBinIds", stagingBinId);
      const res = await fetch(`/api/warehouse/putaway-suggestion?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{ binId: string }>;
        };
        initialToBinId = json.data?.[0]?.binId;
      }
    } catch {
      // ignore — mở dialog không prefill vẫn dùng được
    }
    setPutawayTarget({ lot, initialToBinId });
  };

  const approveIsr = async (id: string) => {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/warehouse/issue-request/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      toast.success("Đã duyệt yêu cầu xuất kho.");
      void refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApprovingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-lg text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Đang tải…
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-6">
        <QueryError
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
          title="Không tải được 'Việc cần làm hôm nay'"
        />
      </div>
    );
  }

  const stagingBinNode: BinNode | null = data.staging.binId
    ? {
        id: data.staging.binId,
        fullCode: data.staging.binFullCode ?? "Chờ xếp kệ",
        isActive: true,
        capacity: null,
        totalQty: data.staging.totalQty,
      }
    : null;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* V4.3 Đợt 2 mục 4 — 4 ô số lớn, ô "Chờ xếp kệ" tô xanh (quan trọng
          nhất, nhiều thao tác nhất/ca — khớp mẫu B `.tile.hot`). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          size="hero"
          icon={Package}
          label="Chờ xếp kệ"
          value={data.staging.count}
          tone="progress"
        />
        <StatTile
          size="hero"
          icon={Clock}
          label="Chờ duyệt xuất"
          value={data.pendingIssues.count}
        />
        <StatTile
          size="hero"
          icon={Truck}
          label="PO sắp về"
          value={data.incomingPos.count}
        />
        <StatTile
          size="hero"
          icon={ShieldCheck}
          label="Chờ QC"
          value={data.qcPending.count}
        />
      </div>

      <GroupCard title="Chờ xếp kệ" count={data.staging.count}>
        {data.staging.items.length === 0 ? (
          <EmptyRow>Không có lô nào đang ở &quot;Chờ xếp kệ&quot;.</EmptyRow>
        ) : (
          data.staging.items.map((lot) => {
            const suggested = suggestions[lot.lotSerialId];
            return (
              <GroupRow
                key={lot.lotSerialId}
                icon={Package}
                tone="blue"
                title={
                  <span className="inline-flex items-center gap-1.5">
                    <code className="font-mono">{lot.sku}</code>
                    {lot.status === "HOLD" ? (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                        Chờ QC
                      </span>
                    ) : null}
                  </span>
                }
                subtitle={
                  <>
                    {lot.itemName}
                    {lot.lotCode ? ` · lô ${lot.lotCode}` : ""}
                    {suggested ? ` · gợi ý ${suggested}` : ""}
                  </>
                }
                qty={`${formatQty(lot.qty)} ${lot.uom ?? ""}`}
                action={
                  <PillButton onClick={() => void openPutaway(lot)}>
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Xếp kệ
                  </PillButton>
                }
              />
            );
          })
        )}
      </GroupCard>

      <GroupCard title="Chờ duyệt xuất" count={data.pendingIssues.count}>
        {data.pendingIssues.items.length === 0 ? (
          <EmptyRow>Không có yêu cầu xuất nào đang chờ.</EmptyRow>
        ) : (
          data.pendingIssues.items.map((r) => (
            <GroupRow
              key={`${r.kind}-${r.id}`}
              icon={r.kind === "ISR" ? Clock : Package}
              tone="amber"
              title={<code className="font-mono">{r.code}</code>}
              subtitle={
                <>
                  {r.kind === "ISR" ? "Yêu cầu xuất kho" : "Đề xuất vật tư"} ·{" "}
                  {r.reasonLabel ?? "—"} · {formatDateTime(r.requestedAt)}
                </>
              }
              qty={r.totalQty != null ? formatQty(r.totalQty) : undefined}
              action={
                r.kind === "ISR" ? (
                  <PillButton
                    tone="emerald"
                    disabled={approvingId === r.id}
                    onClick={() => void approveIsr(r.id)}
                  >
                    {approvingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Duyệt + xuất
                  </PillButton>
                ) : (
                  <PillButton href={r.href}>Xử lý</PillButton>
                )
              }
            />
          ))
        )}
      </GroupCard>

      <GroupCard title="PO sắp về / quá hạn" count={data.incomingPos.count}>
        {data.incomingPos.items.length === 0 ? (
          <EmptyRow>Không có PO nào sắp về hoặc quá hạn ETA.</EmptyRow>
        ) : (
          data.incomingPos.items.map((po) => (
            <GroupRow
              key={po.poId}
              icon={po.overdue ? AlertTriangle : Truck}
              tone={po.overdue ? "red" : "blue"}
              title={<code className="font-mono">{po.poNo}</code>}
              subtitle={
                <>
                  {po.supplierName ?? "—"} ·{" "}
                  {po.overdue
                    ? `Quá hạn ${Math.abs(po.daysUntil)} ngày`
                    : `Còn ${po.daysUntil} ngày`}{" "}
                  · ETA {po.expectedEta}
                </>
              }
              action={<PillButton href={`/procurement/purchase-orders/${po.poId}`}>Xem PO</PillButton>}
            />
          ))
        )}
      </GroupCard>

      <GroupCard title="Chờ QC" count={data.qcPending.count}>
        {data.qcPending.count === 0 ? (
          <EmptyRow>Không có hàng nào đang chờ QC.</EmptyRow>
        ) : (
          <GroupRow
            icon={ShieldCheck}
            tone="violet"
            title="Dòng chờ QC kết luận"
            subtitle={`${data.qcPending.count} dòng đang chờ Tổ QC kết luận Đạt/Không đạt.`}
            action={<PillButton href="/warehouse?tab=movement&mode=qc">Xử lý</PillButton>}
          />
        )}
      </GroupCard>

      {putawayTarget && stagingBinNode
        ? (() => {
            const lot = putawayTarget.lot;
            const contentAsBinContent: BinContent = {
              lotSerialId: lot.lotSerialId,
              lotCode: lot.lotCode,
              itemId: lot.itemId,
              itemSku: lot.sku,
              itemName: lot.itemName,
              itemUom: lot.uom,
              qty: lot.qty,
              status: lot.status,
            };
            return (
              <TransferDialog
                bin={stagingBinNode}
                contents={[contentAsBinContent]}
                initialLot={contentAsBinContent}
                allBins={bins}
                initialToBinId={putawayTarget.initialToBinId}
                onClose={() => setPutawayTarget(null)}
                onSuccess={() => {
                  setPutawayTarget(null);
                  void refetch();
                }}
              />
            );
          })()
        : null}
    </div>
  );
}
