"use client";

import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEcoAffectedOrders } from "@/hooks/useEco";

export function AffectedOrdersPreview({ code }: { code: string }) {
  const query = useEcoAffectedOrders(code);
  const rows = query.data?.data ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Chưa có đơn hàng active nào dùng BOM template này.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div className="flex h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <ClipboardList className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        {rows.length} đơn hàng bị ảnh hưởng
      </div>
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2 text-left">Mã đơn</th>
            <th className="px-3 py-2 text-left">Khách hàng</th>
            <th className="px-3 py-2 text-left">Trạng thái</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-mono text-xs">{r.orderNo}</td>
              <td className="px-3 py-2 text-zinc-700">
                {r.customerName ?? "—"}
              </td>
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-xs">
                  {r.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
