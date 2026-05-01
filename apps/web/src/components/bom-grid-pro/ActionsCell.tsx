"use client";

import * as React from "react";
import {
  Copy,
  Factory,
  History,
  MoreHorizontal,
  Package,
  Pencil,
  Route,
  Send,
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
  /** V3.7.43 — GTAM: tạo Đơn gia công SX (Work Order simple mode). */
  onCreateWO?: (row: BomFlatRow) => void;
  /** V3.7.43 — Đặt gia công ngoài: tạo PO Subcontract. */
  onCreateSubcontract?: (row: BomFlatRow) => void;
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
 * V3.7.43 — Phân loại Category từ metadata.category. 3 giá trị chuẩn:
 * Thương mại / GTAM / Đặt gia công ngoài. Text khác → fallback "thuong-mai".
 */
type CategoryKind = "thuong-mai" | "gtam" | "gia-cong-ngoai";
function classifyAction(row: BomFlatRow): CategoryKind {
  const meta = (row.node.metadata ?? {}) as { category?: unknown };
  const raw =
    typeof meta.category === "string" ? meta.category.trim().toLowerCase() : "";
  if (raw === "gtam") return "gtam";
  if (
    raw.includes("đặt gia công ngoài") ||
    raw.includes("dat gia cong ngoai") ||
    raw.includes("gia công ngoài") ||
    raw === "out" ||
    raw === "outsource"
  )
    return "gia-cong-ngoai";
  // Default Thương mại + fallback (legacy line không có category)
  return "thuong-mai";
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
  onCreateWO,
  onCreateSubcontract,
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
  // V3.7.43 — Action button theo Category (metadata.category từ Excel).
  const category = classifyAction(row);

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
      {/* V3.7.43 — Category-specific primary action.
          Thương mại → 🛒 PR Quick (existing flow)
          GTAM       → 🏭 Tạo Đơn gia công SX (NEW)
          Đặt gia công ngoài → 📤 Tạo PO Subcontract (NEW) */}
      {category === "thuong-mai" && !isFab && onOrder && (
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
      {category === "gtam" && onCreateWO && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-purple-600 hover:bg-purple-50 hover:text-purple-700"
          title="Tạo Đơn gia công sản xuất (GTAM nội bộ)"
          onClick={(e) => {
            e.stopPropagation();
            onCreateWO(row);
          }}
        >
          <Factory className="h-3 w-3" aria-hidden />
        </Button>
      )}
      {category === "gia-cong-ngoai" && onCreateSubcontract && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
          title="Tạo PO Đặt gia công ngoài (sẽ có DDH PDF)"
          onClick={(e) => {
            e.stopPropagation();
            onCreateSubcontract(row);
          }}
        >
          <Send className="h-3 w-3" aria-hidden />
        </Button>
      )}
      {isFab && onViewRoute && category === "thuong-mai" && (
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
          {category === "thuong-mai" && !isFab && onOrder && (
            <DropdownMenuItem onClick={() => onOrder(row)}>
              <ShoppingCart className="h-3 w-3" aria-hidden />
              Đặt mua nhanh
            </DropdownMenuItem>
          )}
          {category === "gtam" && onCreateWO && (
            <DropdownMenuItem onClick={() => onCreateWO(row)}>
              <Factory className="h-3 w-3" aria-hidden />
              Tạo Đơn gia công SX
            </DropdownMenuItem>
          )}
          {category === "gia-cong-ngoai" && onCreateSubcontract && (
            <DropdownMenuItem onClick={() => onCreateSubcontract(row)}>
              <Send className="h-3 w-3" aria-hidden />
              Tạo PO gia công ngoài
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
