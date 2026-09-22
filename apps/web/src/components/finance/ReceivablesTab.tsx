"use client";

import * as React from "react";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DebtAgingPanel } from "@/components/finance/DebtAgingPanel";
import { PartnerInvoicesDialog } from "@/components/finance/PartnerInvoicesDialog";
import {
  usePayablesAging,
  usePayablesBySupplier,
  useReceivablesAging,
  useReceivablesByCustomer,
  type PartnerAging,
} from "@/hooks/useFinance";
import { cn } from "@/lib/utils";

/**
 * Sub-tab "Công nợ" — TASK-20260922: bổ sung CÔNG NỢ PHẢI TRẢ (nợ nhà cung
 * cấp, direction=IN) bên cạnh công nợ PHẢI THU (khách nợ mình, direction=OUT)
 * đã có. Quyết định UI: dùng 1 SUB-TAB duy nhất (không tách 2 sub-tab cấp 2
 * riêng) + segmented control "Phải thu / Phải trả" bên trong — vì:
 *   1) Cả 2 đều thuộc cùng 1 khái niệm nghiệp vụ "công nợ", tách 2 sub-tab
 *      sẽ làm nav cấp 2 phình to trong khi `SettlementsGroupTab` vừa mới
 *      gộp 3 tab cũ lại để BỚT rối (xem comment ở đó).
 *   2) User thường xem 1 chiều tại 1 thời điểm (kế toán trả nợ NCC khác lúc
 *      với kế toán đòi nợ khách) — segmented control giữ context "đang ở
 *      Công nợ" rõ ràng hơn là chuyển hẳn sang 1 tab khác.
 *   3) Dùng `Button` pill-toggle (bám pattern date-range preset ở
 *      `OverviewTab.tsx`) thay vì `Tabs` underline (đã dùng cho nav cấp 2
 *      của `SettlementsGroupTab`) — tránh 2 thanh tab underline chồng nhau
 *      gây rối mắt.
 */

type Direction = "payable" | "receivable";

export function ReceivablesTab() {
  const [direction, setDirection] = React.useState<Direction>("payable");
  const [selectedSupplier, setSelectedSupplier] = React.useState<{ id: string; name: string } | null>(null);

  const receivablesQuery = useReceivablesAging();
  const receivablePartnersQuery = useReceivablesByCustomer();
  const payablesQuery = usePayablesAging();
  const payablePartnersQuery = usePayablesBySupplier();

  const isPayable = direction === "payable";

  const handlePartnerClick = (p: PartnerAging) => {
    if (!isPayable || !p.partnerId) return; // Phải thu (OUT) không có FK — không mở được gì chính xác.
    setSelectedSupplier({ id: p.partnerId, name: p.partnerName });
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <Breadcrumb
          items={[
            { label: "Trang chủ", href: "/" },
            { label: "Bộ phận Thu mua", href: "/sales" },
            { label: "Tài chính: Công nợ" },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Công nợ</h1>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {isPayable
                ? "Hoá đơn đầu vào (mua từ NCC) chưa trả hết tiền — mình đang nợ ai"
                : "Hoá đơn đầu ra (bán hàng) chưa thu hết tiền — ai đang nợ mình"}
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
            <Button
              type="button"
              size="sm"
              variant={isPayable ? "default" : "ghost"}
              className={cn("gap-1.5 rounded-full", !isPayable && "text-zinc-500 dark:text-zinc-400")}
              onClick={() => setDirection("payable")}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Phải trả
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!isPayable ? "default" : "ghost"}
              className={cn("gap-1.5 rounded-full", isPayable && "text-zinc-500 dark:text-zinc-400")}
              onClick={() => setDirection("receivable")}
            >
              <ArrowDownCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Phải thu
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6">
        {isPayable ? (
          <DebtAgingPanel
            buckets={payablesQuery.data?.data.buckets ?? []}
            partners={payablePartnersQuery.data?.data.partners ?? []}
            isLoading={payablesQuery.isLoading}
            emptyTitle="Không có công nợ phải trả"
            emptyDescription="Tất cả hoá đơn đầu vào đã được thanh toán đầy đủ."
            kpiLabel="Tổng phải trả"
            partnerColumnLabel="Nhà cung cấp"
            onPartnerClick={handlePartnerClick}
          />
        ) : (
          <DebtAgingPanel
            buckets={receivablesQuery.data?.data.buckets ?? []}
            partners={receivablePartnersQuery.data?.data.partners ?? []}
            isLoading={receivablesQuery.isLoading}
            emptyTitle="Không có công nợ phải thu"
            emptyDescription="Tất cả hoá đơn đầu ra đã được thanh toán đầy đủ."
            kpiLabel="Tổng phải thu"
            partnerColumnLabel="Khách hàng (theo ghi chú hoá đơn)"
          />
        )}
      </div>

      {selectedSupplier && (
        <PartnerInvoicesDialog
          supplierId={selectedSupplier.id}
          supplierName={selectedSupplier.name}
          onOpenChange={(open) => { if (!open) setSelectedSupplier(null); }}
        />
      )}
    </div>
  );
}
