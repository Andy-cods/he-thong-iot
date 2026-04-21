"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, ShoppingCart } from "lucide-react";

export function ProcurementPanel({ bomId }: { bomId: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 p-6 text-xs text-zinc-500">
      <ShoppingCart className="h-4 w-4 text-zinc-400" aria-hidden />
      <span>
        Purchase Request + Purchase Order filter theo BOM defer V1.7 GA
        (cần JOIN chain snapshot_line).
      </span>
      <Link
        href={`/procurement/purchase-requests?bomTemplateId=${bomId}`}
        className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
      >
        PR toàn cục <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
      <Link
        href={`/procurement/purchase-orders?bomTemplateId=${bomId}`}
        className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
      >
        PO toàn cục <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}
