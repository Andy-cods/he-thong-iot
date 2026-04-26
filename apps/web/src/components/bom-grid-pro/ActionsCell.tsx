"use client";

import * as React from "react";
import {
  Copy,
  History,
  MoreHorizontal,
  Package,
  Pencil,
  Route,
  ShoppingCart,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import { InventoryPopover } from "./InventoryPopover";

export interface ActionsCellProps {
  row: BomFlatRow;
  onEdit?: (row: BomFlatRow) => void;
  /** Thương mại (com): đặt mua nhanh → PRQuickDialog. */
  onOrder?: (row: BomFlatRow) => void;
  /** Gia công (fab) only: mở tab Quy trình của BomLineSheet. */
  onViewRoute?: (row: BomFlatRow) => void;
  /** Nếu truthy → dùng InventoryPopover (V1.7-beta.2 Phase C3). Nếu không,
   *  fallback gọi `onInventory?.(row)` (prop cũ — giữ back-compat placeholder). */
  useInventoryPopover?: boolean;
  onInventory?: (row: BomFlatRow) => void;
  onDuplicate?: (row: BomFlatRow) => void;
  onDelete?: (row: BomFlatRow) => void;
  onHistory?: (row: BomFlatRow) => void;
}

/**
 * V1.7-beta.2.2 — Actions cell phân nhánh theo row.kind.
 *
 * Thương mại (com) hiện:
 *   🛒 Đặt mua (PR nhanh) · 📦 Xem tồn · ✏️ Sửa · ⋯ More (Lịch sử / Nhân bản / Xoá)
 *
 * Gia công (fab) hiện:
 *   📐 Quy trình (mở tab Routing BomLineSheet) · 📦 Xem tồn phôi · ✏️ Sửa ·
 *   ⋯ More (Lịch sử / Nhân bản / Xoá)
 *
 * Group (cụm lắp) → không render action (div rỗng giữ chỗ sticky).
 *
 * User feedback V1.7-beta.2.1: "các thao tác phải tùy chỉnh cho riêng gia công".
 */
export function ActionsCell({
  row,
  onEdit,
  onOrder,
  onViewRoute,
  useInventoryPopover = false,
  onInventory,
  onDuplicate,
  onDelete,
  onHistory,
}: ActionsCellProps) {
  if (row.isGroup) {
    return <div className="h-full w-full" />;
  }

  const showInventoryAction = useInventoryPopover || !!onInventory;
  const isFab = row.kind === "fab";

  const inventoryButton = showInventoryAction ? (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 w-6 p-0"
      title={isFab ? "Xem tồn phôi vật liệu" : "Xem tồn kho"}
      onClick={(e) => {
        e.stopPropagation();
        if (!useInventoryPopover) onInventory?.(row);
      }}
    >
      <Package className="h-3 w-3" aria-hidden />
    </Button>
  ) : null;

  return (
    <div className="flex h-full items-center justify-end gap-0.5 px-1">
      {/* V2.0 Sprint 6 — icons always visible (user feedback). Trước đây
          opacity-0 group-hover:opacity-100 để gọn UI nhưng user muốn rõ ngay. */}
      {/* Kind-specific primary action */}
      {!isFab && onOrder && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          title="Đặt mua nhanh (Thương mại)"
          onClick={(e) => {
            e.stopPropagation();
            onOrder(row);
          }}
        >
          <ShoppingCart className="h-3 w-3" aria-hidden />
        </Button>
      )}
      {isFab && onViewRoute && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
          title="Xem quy trình gia công"
          onClick={(e) => {
            e.stopPropagation();
            onViewRoute(row);
          }}
        >
          <Route className="h-3 w-3" aria-hidden />
        </Button>
      )}

      {/* Inventory — cả 2 kind đều có (thương mại xem tồn mua, gia công xem tồn phôi) */}
      {inventoryButton ? (
        useInventoryPopover ? (
          <InventoryPopover
            componentItemId={row.node.componentItemId}
            componentSku={row.node.componentSku ?? ""}
            componentName={row.node.componentName ?? ""}
          >
            {inventoryButton}
          </InventoryPopover>
        ) : (
          inventoryButton
        )
      ) : null}

      {/* Edit — cả 2 kind */}
      {onEdit && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          title="Chỉnh sửa chi tiết"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(row);
          }}
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </Button>
      )}

      {/* More dropdown */}
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
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>
            {isFab ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Wrench className="h-3 w-3" aria-hidden />
                Gia công
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-blue-700">
                <ShoppingCart className="h-3 w-3" aria-hidden />
                Thương mại
              </span>
            )}
          </DropdownMenuLabel>
          {isFab && onViewRoute && (
            <DropdownMenuItem onClick={() => onViewRoute(row)}>
              <Route className="h-3 w-3" aria-hidden />
              Quy trình gia công
            </DropdownMenuItem>
          )}
          {!isFab && onOrder && (
            <DropdownMenuItem onClick={() => onOrder(row)}>
              <ShoppingCart className="h-3 w-3" aria-hidden />
              Đặt mua nhanh
            </DropdownMenuItem>
          )}
          {onHistory && (
            <DropdownMenuItem onClick={() => onHistory(row)}>
              <History className="h-3 w-3" aria-hidden />
              Lịch sử thay đổi
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
