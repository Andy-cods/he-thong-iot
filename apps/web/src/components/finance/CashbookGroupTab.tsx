"use client";

import * as React from "react";
import { CreditCard, Receipt, Wallet } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashbookTab } from "@/components/finance/CashbookTab";
import { InvoicesTab } from "@/components/finance/InvoicesTab";
import { PaymentsTab } from "@/components/finance/PaymentsTab";

/**
 * TASK-20260922 — "Sổ quỹ" gộp 3 tab cũ (Thu chi / Hoá đơn / Thanh toán) —
 * cùng nghiệp vụ dòng tiền hằng ngày kế toán dùng liên tục. Sub-tab cấp 2
 * dùng `?sub=` để giữ deep-link (khớp `LEGACY_TAB_REDIRECT` ở `sales/page.tsx`).
 */

const SUB_TABS = [
  { key: "transactions", label: "Thu chi", icon: Wallet },
  { key: "invoices", label: "Hoá đơn", icon: Receipt },
  { key: "payments", label: "Thanh toán", icon: CreditCard },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];

export function CashbookGroupTab({ initialSub }: { initialSub?: string }) {
  const [sub, setSub] = useQueryState(
    "sub",
    parseAsStringEnum<SubTab>(SUB_TABS.map((t) => t.key)).withDefault("transactions"),
  );

  // `initialSub` đến từ legacy redirect (?tab=fin-invoices cũ) — chỉ áp dụng
  // 1 lần lúc mount nếu URL chưa có `sub` hợp lệ, để không đè giá trị user
  // vừa bấm chuyển sub-tab.
  React.useEffect(() => {
    if (initialSub && SUB_TABS.some((t) => t.key === initialSub)) {
      void setSub(initialSub as SubTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <Tabs value={sub} onValueChange={(v) => void setSub(v as SubTab)}>
          <TabsList className="border-b-0">
            {SUB_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-hidden">
        {sub === "transactions" && <CashbookTab />}
        {sub === "invoices" && <InvoicesTab />}
        {sub === "payments" && <PaymentsTab />}
      </div>
    </div>
  );
}
