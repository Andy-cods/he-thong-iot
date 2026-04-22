"use client";

import * as React from "react";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUpdateBomLine } from "@/hooks/useBom";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import { cn } from "@/lib/utils";

/**
 * V1.7-beta.2.1 — Dropdown "Loại" cho BomGridPro.
 *
 * Click trigger (badge Thương mại / Gia công) → menu 3 option:
 *   - 🛒 Thương mại  → set `metadata.kind = "com"`
 *   - 🔧 Gia công    → set `metadata.kind = "fab"`
 *   - ↺ Mặc định     → clear override (set `metadata.kind = null`) → revert
 *     về derive từ `item.itemType`.
 *
 * Khi metadata.kind tồn tại và khác giá trị derive (`row.kind` sau override),
 * badge phụ "⚠ override" xuất hiện báo user biết.
 *
 * Read-only mode (OBSOLETE BOM) → trigger thành span, không tương tác.
 */

export interface KindDropdownProps {
  templateId: string;
  row: BomFlatRow;
  readOnly?: boolean;
}

type KindValue = "com" | "fab" | null;

function BadgeInner({ kind }: { kind: "com" | "fab" }) {
  // whitespace-nowrap + shrink-0 tránh wrap "Gia" / "công" khi cột hẹp.
  // V1.7-beta.2.3: bỏ emoji icon trước label (user yêu cầu professional).
  if (kind === "fab") {
    return (
      <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
        Gia công
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded bg-blue-50 px-1.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
      Thương mại
    </span>
  );
}

export function KindDropdown({
  templateId,
  row,
  readOnly,
}: KindDropdownProps) {
  const mutation = useUpdateBomLine(templateId);

  // row.kind đã suy ra (group/fab/com) từ item type + metadata.kind override
  // trong flatten-tree. Nhưng tree hiện chưa merge metadata.kind — nên lấy
  // trực tiếp từ metadata.kind nếu có, fallback row.kind.
  const meta = (row.node.metadata ?? {}) as { kind?: unknown };
  const overrideKind: KindValue =
    meta.kind === "com" || meta.kind === "fab" ? meta.kind : null;

  // Effective kind để render badge: override > row.kind derive.
  const effectiveKind: "com" | "fab" =
    overrideKind ?? (row.kind === "fab" ? "fab" : "com");

  // Nếu row là group (cụm lắp có con) → không render dropdown.
  if (row.kind === "group") return null;

  const handleSelect = (next: KindValue) => {
    const existingMeta = (row.node.metadata ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = { ...existingMeta };
    if (next === null) {
      delete nextMeta.kind;
    } else {
      nextMeta.kind = next;
    }

    const label =
      next === null ? "mặc định" : next === "fab" ? "Gia công" : "Thương mại";

    mutation.mutate(
      {
        lineId: row.id,
        data: { metadata: nextMeta },
      },
      {
        onSuccess: () => {
          toast.success(`Đã đổi loại → ${label}`);
        },
        onError: (err) => {
          toast.error((err as Error).message ?? "Không đổi được loại");
        },
      },
    );
  };

  // Check overrideKind có khác item derive không để show warning badge.
  const itemType = (row.node.componentItemType ?? "").toUpperCase();
  const derivedFromItem: "com" | "fab" =
    itemType === "FABRICATED" || itemType === "SUB_ASSEMBLY" ? "fab" : "com";
  const hasOverride = overrideKind !== null && overrideKind !== derivedFromItem;

  if (readOnly) {
    return (
      <div className="flex items-center gap-1">
        <BadgeInner kind={effectiveKind} />
        {hasOverride ? <OverrideMark /> : null}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={mutation.isPending}
          className={cn(
            "inline-flex items-center gap-0.5 rounded transition-opacity hover:opacity-80",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
            mutation.isPending && "opacity-60",
          )}
          aria-label="Đổi loại linh kiện"
        >
          <BadgeInner kind={effectiveKind} />
          <ChevronDown className="h-3 w-3 text-zinc-400" aria-hidden />
          {hasOverride ? <OverrideMark /> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuLabel>Loại linh kiện</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => handleSelect("com")}>
          Thương mại
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleSelect("fab")}>
          Gia công
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => handleSelect(null)}
          disabled={overrideKind === null}
        >
          Mặc định (theo Item)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OverrideMark() {
  // Icon-only để không đẩy badge kind vỡ layout trong cột Loại w-150.
  // Tooltip hover cung cấp context đầy đủ cho user.
  return (
    <span
      title="Loại đã override khác với Item master"
      aria-label="Override khác Item master"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden />
    </span>
  );
}
