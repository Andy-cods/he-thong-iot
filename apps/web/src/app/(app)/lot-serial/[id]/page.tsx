import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  Factory,
  Lock,
  Package,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getLotHistory,
  type LotTimelineEvent,
} from "@/server/repos/lotSerialHistory";

export const dynamic = "force-dynamic";

function statusVariant(
  s: string,
):
  | "default"
  | "outline"
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "danger" {
  switch (s) {
    case "AVAILABLE":
      return "success";
    case "RESERVED":
      return "info";
    case "HOLD":
      return "warning";
    case "CONSUMED":
      return "neutral";
    case "EXPIRED":
      return "danger";
    default:
      return "outline";
  }
}

function eventIcon(kind: LotTimelineEvent["kind"], txType: string | null) {
  if (kind === "TXN" && txType === "IN_RECEIPT") return ArrowDownCircle;
  if (kind === "TXN" && txType === "ASSEMBLY_CONSUME") return Factory;
  if (kind === "SCAN") return Factory;
  if (kind === "RESERVE") return Lock;
  if (kind === "RELEASE") return RotateCcw;
  if (kind === "TXN" && (txType === "OUT_ISSUE" || txType === "PROD_OUT"))
    return ArrowUpCircle;
  if (kind === "TXN" && (txType === "IN_RECEIPT" || txType === "PROD_IN"))
    return ArrowDownCircle;
  return Package;
}

function eventLabel(kind: LotTimelineEvent["kind"], txType: string | null) {
  if (kind === "TXN") {
    switch (txType) {
      case "IN_RECEIPT":
        return "Nhận hàng (IN_RECEIPT)";
      case "OUT_ISSUE":
        return "Xuất kho (OUT_ISSUE)";
      case "ASSEMBLY_CONSUME":
        return "Lắp ráp tiêu thụ (ASSEMBLY_CONSUME)";
      case "ADJUST_PLUS":
        return "Điều chỉnh cộng";
      case "ADJUST_MINUS":
        return "Điều chỉnh trừ";
      case "RESERVE":
        return "Reserve";
      case "UNRESERVE":
        return "Unreserve";
      case "PROD_IN":
        return "Nhập sản xuất";
      case "PROD_OUT":
        return "Xuất sản xuất";
      default:
        return txType ?? "Giao dịch";
    }
  }
  if (kind === "RESERVE") return "Reserved cho đơn hàng";
  if (kind === "RELEASE") return "Giải phóng reservation";
  if (kind === "SCAN") return "Assembly scan (CONSUME)";
  return kind;
}

function fmtQty(n: number) {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

export default async function LotSerialDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const detail = await getLotHistory(params.id);
  if (!detail) notFound();

  const { lot, onHandQty, reservedQty, timeline } = detail;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/items">
              <ChevronLeft className="h-3.5 w-3.5" />
              Items
            </Link>
          </Button>
          <div>
            <h1 className="font-mono text-lg font-semibold tracking-tight text-zinc-900">
              <Package className="mr-1 inline-block h-5 w-5 text-zinc-500" />
              {lot.lotCode ?? lot.serialCode ?? lot.id.slice(0, 8)}
            </h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
              <Badge variant={statusVariant(lot.status)}>{lot.status}</Badge>
              <span>·</span>
              <span>SKU: {lot.itemSku ?? "—"}</span>
              <span>·</span>
              <span className="truncate max-w-[320px]">
                {lot.itemName ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <KpiCard label="On-hand" value={fmtQty(onHandQty)} tone="primary" />
            <KpiCard label="Reserved" value={fmtQty(reservedQty)} tone="info" />
            <KpiCard
              label="Khả dụng"
              value={fmtQty(Math.max(0, onHandQty - reservedQty))}
              tone="success"
            />
            <KpiCard
              label="Tạo"
              value={new Date(lot.createdAt).toLocaleDateString("vi-VN")}
              tone="neutral"
            />
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <InfoRow label="Lot code" value={lot.lotCode ?? "—"} />
            <InfoRow label="Serial code" value={lot.serialCode ?? "—"} />
            <InfoRow
              label="NSX / HSD"
              value={`${lot.mfgDate ?? "—"} / ${lot.expDate ?? "—"}`}
            />
            {lot.holdReason ? (
              <div className="md:col-span-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>HOLD reason: </strong>
                {lot.holdReason}
              </div>
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Lifecycle timeline ({timeline.length} event)
            </h2>
            {timeline.length === 0 ? (
              <p className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 py-8 text-center text-sm text-zinc-500">
                Chưa có event nào cho lot này.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
                <ul className="divide-y divide-zinc-100">
                  {timeline.map((ev, i) => {
                    const Icon = eventIcon(ev.kind, ev.txType ?? null);
                    const sign =
                      ev.kind === "TXN" &&
                      (ev.txType === "IN_RECEIPT" ||
                        ev.txType === "ADJUST_PLUS" ||
                        ev.txType === "PROD_IN")
                        ? "+"
                        : ev.kind === "TXN" &&
                            (ev.txType === "OUT_ISSUE" ||
                              ev.txType === "ADJUST_MINUS" ||
                              ev.txType === "PROD_OUT" ||
                              ev.txType === "ASSEMBLY_CONSUME")
                          ? "−"
                          : "";
                    const toneClass =
                      sign === "+"
                        ? "text-emerald-700"
                        : sign === "−"
                          ? "text-red-700"
                          : ev.kind === "RESERVE"
                            ? "text-indigo-700"
                            : ev.kind === "RELEASE"
                              ? "text-amber-700"
                              : "text-zinc-700";
                    return (
                      <li
                        key={`${ev.eventAt}-${i}`}
                        className="grid grid-cols-[auto,1fr,auto] items-start gap-3 px-4 py-3"
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${toneClass}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-900">
                            {eventLabel(ev.kind, ev.txType ?? null)}
                          </div>
                          <div className="mt-0.5 text-xs text-zinc-500">
                            {new Date(ev.eventAt).toLocaleString("vi-VN")}
                            {ev.actorUsername ? ` · ${ev.actorUsername}` : ""}
                            {ev.refTable ? ` · ${ev.refTable}` : ""}
                          </div>
                          {ev.note ? (
                            <div className="mt-1 text-xs text-zinc-600">
                              {ev.note}
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={`text-right text-sm tabular-nums ${toneClass}`}
                        >
                          {sign}
                          {fmtQty(ev.qty)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "info" | "success";
}) {
  const toneClass =
    tone === "primary"
      ? "text-indigo-700"
      : tone === "info"
        ? "text-blue-700"
        : tone === "success"
          ? "text-emerald-700"
          : "text-zinc-800";
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className="mt-1 text-sm text-zinc-900">{value}</div>
    </div>
  );
}
