"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { useBomDetail } from "@/hooks/useBom";
import { cn } from "@/lib/utils";

export interface BomFilterChipProps {
  bomTemplateId: string;
  /** Hàm dismiss — user bấm X để bỏ filter. Thường là updateSearchParams. */
  onDismiss: () => void;
  className?: string;
}

/**
 * Chip filter "BOM: {code}" hiển thị trên global list pages khi URL có
 * query param `bomTemplateId`. Click X → dismiss filter. Link về BOM
 * workspace qua icon ExternalLink.
 */
export function BomFilterChip({
  bomTemplateId,
  onDismiss,
  className,
}: BomFilterChipProps) {
  const query = useBomDetail(bomTemplateId);
  const template = query.data?.data?.template;
  const code = template?.code ?? bomTemplateId.slice(0, 8) + "…";

  return (
    <div
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 text-xs text-indigo-700 shadow-sm",
        className,
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-indigo-500">
        BOM:
      </span>
      <Link
        href={`/bom/${bomTemplateId}`}
        className="flex items-center gap-0.5 font-mono font-semibold hover:underline"
        title={template?.name ?? undefined}
      >
        {code}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded hover:bg-indigo-100 hover:text-indigo-900"
        aria-label="Bỏ filter BOM"
        title="Bỏ filter BOM"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
