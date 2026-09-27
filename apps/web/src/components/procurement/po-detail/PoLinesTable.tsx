"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Lock, PencilLine, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUpdatePOPrices } from "@/hooks/usePurchaseOrders";
import { formatDate, formatMoney, formatQty, formatUom } from "@/lib/format";
import { parseVnNumber } from "@/lib/po-detail";
import { PO_VAT_RATES, summarizePoLines } from "@/lib/procurement-policy";
import { statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { PoDetail, PoLine } from "./types";

/**
 * V4.1 PO-UI: bảng dòng hàng — nội dung chính, hiện ngay khi mở PO.
 *
 * - Desktop: bảng #, Vật tư, ĐVT, SL đặt, Đã nhận (+thanh tiến độ), Đơn giá,
 *   VAT, Thành tiền (chưa VAT); số canh phải tabular-nums; khối tổng dưới bảng.
 * - Điện thoại (< md): mỗi dòng 1 thẻ, không cuộn ngang trang.
 * - "Điều chỉnh giá": Đơn giá + VAT thành ô nhập (Tab sang ô kế, Enter lưu,
 *   Esc huỷ), tổng tính lại ngay. Gọi PATCH /api/purchase-orders/[id]/prices —
 *   được ở mọi trạng thái trừ Đã huỷ, khoá khi HĐ mua đã ghi công nợ.
 * - Dòng giá 0 tô nhạt + nhãn "Chưa có giá"; băng cảnh báo "PO có N dòng chưa
 *   có giá" kèm nút vào chế độ nhập giá.
 */

interface DraftPrice {
  unitPrice: string;
  taxRate: string;
}

export interface PoLinesTableProps {
  po: PoDetail;
  /** Người dùng có quyền giá + PO chưa huỷ → hiện nút "Điều chỉnh giá". */
  canPriceRole: boolean;
  /** Lý do khoá (null = được sửa giá). */
  priceLockReason: string | null;
  /** Trạng thái HĐ mua hiện có (để báo "HĐ nháp sẽ tự tính lại"). */
  invoiceStatus?: string | null;
}

function priceToInput(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 4 });
}

function taxOf(l: PoLine): number {
  const n = Number(l.taxRate ?? 8);
  return Number.isFinite(n) ? n : 8;
}

export function PoLinesTable({ po, canPriceRole, priceLockReason, invoiceStatus }: PoLinesTableProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, DraftPrice>>({});
  const containerRef = React.useRef<HTMLDivElement>(null);
  const savePrices = useUpdatePOPrices(po.id);

  const canEditPrice = canPriceRole && priceLockReason === null;

  const startEdit = React.useCallback(() => {
    const next: Record<string, DraftPrice> = {};
    for (const l of po.lines) {
      next[l.id] = { unitPrice: priceToInput(l.unitPrice), taxRate: String(taxOf(l)) };
    }
    setDraft(next);
    setEditing(true);
  }, [po.lines]);

  const cancelEdit = () => {
    setEditing(false);
    setDraft({});
  };

  // Vào chế độ nhập giá → focus ô giá đầu tiên (ưu tiên dòng chưa có giá).
  React.useEffect(() => {
    if (!editing) return;
    const root = containerRef.current;
    if (!root) return;
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>("input[data-price-input]")).filter(
      (el) => el.offsetParent !== null,
    );
    const target = inputs.find((el) => el.value === "") ?? inputs[0];
    target?.focus();
    target?.select();
  }, [editing]);

  // Giá hiệu lực từng dòng (đang sửa → giá nháp).
  const parsed = React.useMemo(() => {
    const map = new Map<string, { price: number | null; tax: number }>();
    for (const l of po.lines) {
      const d = editing ? draft[l.id] : undefined;
      if (d) {
        const price = d.unitPrice.trim() === "" ? 0 : parseVnNumber(d.unitPrice);
        map.set(l.id, { price: price !== null && price >= 0 ? price : null, tax: Number(d.taxRate) });
      } else {
        map.set(l.id, { price: Number(l.unitPrice) || 0, tax: taxOf(l) });
      }
    }
    return map;
  }, [po.lines, draft, editing]);

  const effective = po.lines.map((l) => {
    const p = parsed.get(l.id);
    return { orderedQty: l.orderedQty, unitPrice: p?.price ?? 0, taxRate: p?.tax ?? 0 };
  });
  const sums = summarizePoLines(effective);
  const invalidCount = editing ? po.lines.filter((l) => parsed.get(l.id)?.price === null).length : 0;

  const changedEdits = () =>
    po.lines.flatMap((l) => {
      const p = parsed.get(l.id);
      if (!p || p.price === null) return [];
      const samePrice = Math.abs(p.price - (Number(l.unitPrice) || 0)) < 1e-9;
      const sameTax = Math.abs(p.tax - taxOf(l)) < 1e-9;
      return samePrice && sameTax ? [] : [{ lineId: l.id, unitPrice: p.price, taxRate: p.tax }];
    });

  const handleSave = async () => {
    if (invalidCount > 0) {
      toast.error(`Có ${invalidCount} ô đơn giá không hợp lệ — nhập số ≥ 0 (VD 1.500.000).`);
      return;
    }
    const edits = changedEdits();
    if (edits.length === 0) {
      toast.info("Không có thay đổi giá.");
      cancelEdit();
      return;
    }
    try {
      const res = await savePrices.mutateAsync({ lines: edits });
      const inv = res.data.invoiceRefreshed;
      toast.success(
        `Đã điều chỉnh giá ${res.data.changedLines} dòng · Tổng PO ${formatMoney(res.data.totalAmount)}` +
          (inv ? ` · HĐ mua nháp ${inv.invoiceNo} đã tính lại ${formatMoney(inv.totalAfter)}` : ""),
      );
      cancelEdit();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  };

  const setLine = (id: string, patch: Partial<DraftPrice>) =>
    setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { unitPrice: "", taxRate: "8" }), ...patch } }));

  const unpricedSaved = po.lines.filter((l) => (Number(l.unitPrice) || 0) <= 0).length;

  const priceInput = (l: PoLine, className?: string) => {
    const d = draft[l.id];
    const invalid = parsed.get(l.id)?.price === null;
    return (
      <input
        data-price-input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={`Đơn giá dòng ${l.lineNo}`}
        aria-invalid={invalid || undefined}
        placeholder="Nhập giá"
        value={d?.unitPrice ?? ""}
        onChange={(e) => setLine(l.id, { unitPrice: e.target.value })}
        onBlur={(e) => {
          const n = parseVnNumber(e.target.value);
          if (n !== null && n >= 0) setLine(l.id, { unitPrice: priceToInput(n) });
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "h-8 w-full rounded-md border bg-white px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 dark:bg-zinc-900 dark:text-zinc-50",
          invalid
            ? "border-red-400 focus:border-red-500 focus:ring-red-500"
            : "border-zinc-300 focus:border-indigo-500 focus:ring-indigo-500 dark:border-zinc-700",
          className,
        )}
      />
    );
  };

  const vatSelect = (l: PoLine, className?: string) => {
    const d = draft[l.id];
    const current = taxOf(l);
    const options: number[] = (PO_VAT_RATES as readonly number[]).includes(current)
      ? [...PO_VAT_RATES]
      : [...PO_VAT_RATES, current].sort((a, b) => a - b);
    return (
      <select
        aria-label={`VAT dòng ${l.lineNo}`}
        value={d?.taxRate ?? String(current)}
        onChange={(e) => setLine(l.id, { taxRate: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") onKeyDown(e);
        }}
        className={cn(
          "h-8 w-full rounded-md border border-zinc-300 bg-white px-1.5 text-right text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
          className,
        )}
      >
        {options.map((r) => (
          <option key={r} value={String(r)}>
            {r}%
          </option>
        ))}
      </select>
    );
  };

  const receivedCell = (l: PoLine) => {
    const qty = Number(l.orderedQty) || 0;
    const recv = Number(l.receivedQty) || 0;
    const pct = qty > 0 ? Math.min(100, Math.round((recv / qty) * 100)) : 0;
    return (
      <div className="flex flex-col items-end gap-1">
        <span
          className={cn(
            "tabular-nums",
            recv >= qty && qty > 0
              ? "text-emerald-700 dark:text-emerald-400"
              : recv > 0
                ? "text-amber-700 dark:text-amber-400"
                : "text-zinc-400 dark:text-zinc-500",
          )}
        >
          {formatQty(recv)}
        </span>
        <span className="h-1 w-14 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
          <span
            className={cn(
              "block h-full rounded-full",
              pct >= 100 ? "bg-emerald-500" : "bg-amber-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </span>
      </div>
    );
  };

  const unpricedBadge = (
    <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800">
      Chưa có giá
    </span>
  );

  return (
    <section
      ref={containerRef}
      aria-label="Dòng hàng"
      className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Thanh tiêu đề bảng */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Dòng hàng <span className="font-normal text-zinc-500 dark:text-zinc-400">({po.lines.length})</span>
        </h2>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <span className="hidden text-xs text-zinc-500 lg:inline dark:text-zinc-400">
              Enter để lưu · Esc để huỷ
            </span>
            <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={savePrices.isPending}>
              Huỷ
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={savePrices.isPending}>
              {savePrices.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Lưu giá
            </Button>
          </div>
        ) : canPriceRole ? (
          <Button
            variant="outline"
            size="sm"
            onClick={startEdit}
            disabled={!canEditPrice || po.lines.length === 0}
            title={priceLockReason ?? "Sửa Đơn giá và VAT các dòng"}
          >
            {canEditPrice ? <PencilLine className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            Điều chỉnh giá
          </Button>
        ) : null}
      </div>

      {/* Băng cảnh báo dòng chưa có giá / ghi chú khi đang sửa */}
      {!editing && unpricedSaved > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            PO có <strong>{unpricedSaved}</strong> dòng chưa có giá — tổng tiền chưa đầy đủ.
          </span>
          {canEditPrice ? (
            <Button size="xs" variant="outline" onClick={startEdit}>
              Nhập giá
            </Button>
          ) : (
            <span className="text-xs">{priceLockReason ?? "Liên hệ Thu mua để nhập giá."}</span>
          )}
        </div>
      )}
      {editing && (
        <p className="border-b border-indigo-100 bg-indigo-50/60 px-4 py-1.5 text-xs text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
          {po.status === "DRAFT"
            ? "Chỉ sửa Đơn giá và VAT. Mỗi lần lưu được ghi vào Nhật ký."
            : `PO đang “${statusLabel("po", po.status)}” — chỉ điều chỉnh Đơn giá và VAT (SL giữ nguyên). Mỗi lần lưu được ghi vào Nhật ký.`}
          {invoiceStatus === "DRAFT" ? " Hoá đơn mua nháp sẽ tự tính lại theo giá mới." : ""}
        </p>
      )}

      {po.lines.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">PO chưa có dòng hàng.</p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
                  <th scope="col" className="w-9 px-3 py-2 text-left font-medium">#</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium">Vật tư</th>
                  <th scope="col" className="w-14 px-2 py-2 text-left font-medium">ĐVT</th>
                  <th scope="col" className="w-20 px-2 py-2 text-right font-medium">SL đặt</th>
                  <th scope="col" className="w-24 px-2 py-2 text-right font-medium">Đã nhận</th>
                  <th scope="col" className={cn("px-2 py-2 text-right font-medium", editing ? "w-36" : "w-32")}>Đơn giá</th>
                  <th scope="col" className="w-[4.5rem] px-2 py-2 text-right font-medium">VAT</th>
                  <th scope="col" className="w-32 px-3 py-2 text-right font-medium">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => {
                  const p = parsed.get(l.id);
                  const price = p?.price ?? 0;
                  const amount = (Number(l.orderedQty) || 0) * price;
                  const noPrice = !editing && (Number(l.unitPrice) || 0) <= 0;
                  return (
                    <tr
                      key={l.id}
                      className={cn(
                        "border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800",
                        noPrice && "bg-amber-50/50 dark:bg-amber-950/10",
                      )}
                    >
                      <td className="px-3 py-2 tabular-nums text-zinc-500 dark:text-zinc-400">{l.lineNo}</td>
                      <td className="px-3 py-2">
                        <div className="min-w-0">
                          <span className="block truncate font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100" title={l.itemSku ?? undefined}>
                            {l.itemSku ?? "—"}
                          </span>
                          <span className="block text-sm leading-snug text-zinc-700 dark:text-zinc-300">
                            {l.itemName ?? "—"}
                          </span>
                          {(l.spec || l.expectedEta || l.notes) && (
                            <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                              {[
                                l.spec ? `Quy cách: ${l.spec}` : null,
                                l.expectedEta ? `Dự kiến ${formatDate(l.expectedEta, "dd/MM/yyyy")}` : null,
                                l.notes,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-xs text-zinc-600 dark:text-zinc-400">{formatUom(l.itemUom) || "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{formatQty(l.orderedQty)}</td>
                      <td className="px-2 py-2 text-right">{receivedCell(l)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                        {editing ? priceInput(l) : noPrice ? unpricedBadge : formatMoney(l.unitPrice, { unit: "none" })}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                        {editing ? vatSelect(l) : `${taxOf(l)}%`}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                        {formatMoney(amount, { unit: "none" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Điện thoại: thẻ */}
          <ul className="divide-y divide-zinc-100 md:hidden dark:divide-zinc-800">
            {po.lines.map((l) => {
              const p = parsed.get(l.id);
              const price = p?.price ?? 0;
              const amount = (Number(l.orderedQty) || 0) * price;
              const noPrice = !editing && (Number(l.unitPrice) || 0) <= 0;
              return (
                <li key={l.id} className={cn("px-4 py-3", noPrice && "bg-amber-50/50 dark:bg-amber-950/10")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        {l.lineNo}. {l.itemSku ?? "—"}
                      </p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">{l.itemName ?? "—"}</p>
                      {l.spec ? <p className="text-xs text-zinc-500 dark:text-zinc-400">Quy cách: {l.spec}</p> : null}
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {formatMoney(amount)}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400">SL đặt</dt>
                      <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">{formatQty(l.orderedQty, l.itemUom)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400">Đã nhận</dt>
                      <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">{formatQty(l.receivedQty)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500 dark:text-zinc-400">VAT</dt>
                      <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">{editing ? null : `${taxOf(l)}%`}</dd>
                    </div>
                  </dl>
                  {editing ? (
                    <div className="mt-2 grid grid-cols-[1fr_5.5rem] gap-2">
                      <label className="text-xs text-zinc-500 dark:text-zinc-400">
                        Đơn giá
                        {priceInput(l, "mt-0.5 h-10 text-base")}
                      </label>
                      <label className="text-xs text-zinc-500 dark:text-zinc-400">
                        VAT
                        {vatSelect(l, "mt-0.5 h-10 text-base")}
                      </label>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Đơn giá:{" "}
                      {noPrice ? unpricedBadge : (
                        <span className="tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoney(l.unitPrice)}</span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* Tổng tiền */}
      <div className="border-t border-zinc-200 bg-zinc-50/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/30">
        <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 text-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">Tạm tính</dt>
          <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoney(sums.subtotal)}</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Thuế VAT</dt>
          <dd className="text-right tabular-nums text-zinc-900 dark:text-zinc-100">{formatMoney(sums.vat)}</dd>
          <dt className="mt-1 border-t border-zinc-200 pt-1 font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
            Tổng cộng
          </dt>
          <dd className="mt-1 border-t border-zinc-200 pt-1 text-right text-base font-semibold tabular-nums text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
            {formatMoney(sums.total)}
          </dd>
        </dl>
        {editing && Math.abs(sums.total - (Number(po.totalAmount) || 0)) >= 1 && (
          <p className="mt-1 text-right text-xs text-zinc-500 dark:text-zinc-400">
            Trước điều chỉnh: <span className="tabular-nums">{formatMoney(po.totalAmount)}</span>
          </p>
        )}
      </div>
    </section>
  );
}
