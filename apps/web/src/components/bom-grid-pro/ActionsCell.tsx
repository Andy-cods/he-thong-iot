"use client";

import * as React from "react";
import {
  Copy,
  History,
  MoreHorizontal,
  Package,
  Pencil,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";

export interface ActionsCellProps {
  row: BomFlatRow;
  onEdit?: (row: BomFlatRow) => void;
  onOrder?: (row: BomFlatRow) => void;
  onInventory?: (row: BomFlatRow) => void;
  onDuplicate?: (row: BomFlatRow) => void;
  onDelete?: (row: BomFlatRow) => void;
  onHistory?: (row: BomFlatRow) => void;
}

/**
 * V1.7-beta.2 — Actions cell per row.
 *
 * Hiển thị 4 icon action + More dropdown. Row hover trigger các action visible
 * (row-based CSS `group-hover:opacity-100`). Placeholder handlers — Phase C
 * wire thực sự với BomLineSheet / PRQuickDialog / InventoryPopover.
 */
export function ActionsCell({
  row,
  onEdit,
  onOrder,
  onInventory,
  onDuplicate,
  onDelete,
  onHistory,
}: ActionsCellProps) {
  if (row.isGroup) {
    return <div className="h-full w-full" />;
  }

  return (
    <div className="flex h-full items-center justify-end gap-0.5 px-1 opacity-0 transition-opacity group-hover:opacity-100">
      {onOrder && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          title="Đặt mua nhanh"
          onClick={(e) => {
            e.stopPropagation();
            onOrder(row);
          }}
        >
          <ShoppingCart className="h-3 w-3" aria-hidden />
        </Button>
      )}
      {onInventory && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          title="Xem tồn kho"
          onClick={(e) => {
            e.stopPropagation();
            onInventory(row);
          }}
        >
          <Package className="h-3 w-3" aria-hidden />
        </Button>
      )}
      {onEdit && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          title="Chỉnh sửa"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(row);
          }}
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            title="Thao tác khác"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {onHistory && (
            <DropdownMenuItem onClick={() => onHistory(row)}>
              <History className="h-3 w-3" aria-hidden />
              Lịch sử
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={() => onDuplicate(row)}>
              <Copy className="h-3 w-3" aria-hidden />
              Nhân bản dòng
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger" onClick={() => onDelete(row)}>
                <Trash2 className="h-3 w-3" aria-hidden />
                Xoá
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
