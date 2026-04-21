"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Wrench } from "lucide-react";

export function AssemblyPanel({ bomId }: { bomId: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-3 p-6 text-xs text-zinc-500">
      <Wrench className="h-4 w-4 text-zinc-400" aria-hidden />
      <span>
        Assembly progress aggregate defer V1.7 GA (reuse ProductionProgressPanel
        multi-WO).
      </span>
      <Link
        href={`/work-orders?bomTemplateId=${bomId}`}
        className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
      >
        Xem WO toàn cục <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
    </div>
  );
}
