"use client";

import * as React from "react";
import { Banknote, BookOpen, FolderTree } from "lucide-react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceivablesTab } from "@/components/finance/ReceivablesTab";
import { AccountsTab } from "@/components/finance/AccountsTab";
import { CategoriesTab } from "@/components/finance/CategoriesTab";

/**
 * TASK-20260922 — "Công nợ & Thiết lập" gộp 3 tab cũ (Công nợ / Tài khoản /
 * Danh mục) — Tài khoản + Danh mục là cấu hình ít đụng tới (setup 1 lần),
 * gom chung với Công nợ (theo dõi định kỳ, không phải thao tác hằng ngày)
 * để tránh chiếm thêm 1 tab cấp 1. Sub-tab cấp 2 dùng `?sub=` để giữ
 * deep-link (khớp `LEGACY_TAB_REDIRECT` ở `sales/page.tsx`).
 */

const SUB_TABS = [
  { key: "receivables", label: "Công nợ", icon: BookOpen },
  { key: "accounts", label: "Tài khoản", icon: Banknote },
  { key: "categories", label: "Danh mục", icon: FolderTree },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];

export function SettlementsGroupTab({ initialSub }: { initialSub?: string }) {
  const [sub, setSub] = useQueryState(
    "sub",
    parseAsStringEnum<SubTab>(SUB_TABS.map((t) => t.key)).withDefault("receivables"),
  );

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
      <div className="flex-1 overflow-auto">
        {sub === "receivables" && <ReceivablesTab />}
        {sub === "accounts" && <AccountsTab />}
        {sub === "categories" && <CategoriesTab />}
      </div>
    </div>
  );
}
