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
import { parseBomCategory } from "@iot/shared";
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
  // BOM V5: cột category (GTAM/OUTSOURCED/COMMERCIAL) ưu tiên, rồi metadata cũ.
  const meta = (row.node.metadata ?? {}) as { category?: unknown };
  const raw =
    row.node.category ??
    (typeof meta.category === "string" ? meta.category : "");
  const cat = parseBomCategory(raw);
  if (cat === "GTAM") return "gtam";
  if (cat === "OUTSOURCED") return "gia-cong-ngoai";
  // Default Thương mại + fallback (legacy line không có category)
  return "thuong-mai";
}

/**
 * V1.7-beta.2.2 — Actions cell phân nhánh theo row.kind.
 *
 * BOM V5 WP5: mỗi dòng chỉ 1 nút "…" — menu gom Sửa / Xem tồn / hành động
 * theo category (Đặt mua · Yêu cầu SX · PO gia công ngoài · Quy trình) /
 * Lịch sử / Nhân bản / Xoá. WP10 sẽ dọn tiếp.
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
  const [invOpen, setInvOpen] = React.useState(false);
  if (row.isGroup) {
    return <div className="h-full w-full" />;
  }

  const showInventoryAction = useInventoryPopover || !!onInventory;
  const isFab = row.kind === "fab";
  const category = classifyAction(row);

  return (
    <div className="relative flex h-full items-center justify-end px-1">
      {/* Popover tồn kho neo vào ô, mở từ mục menu bên dưới. */}
      {useInventoryPopover && (
        <InventoryPopover
          componentItemId={row.node.componentItemId}
          componentSku={row.node.componentSku ?? ""}
          componentName={row.node.componentName ?? ""}
          open={invOpen}
          onOpenChange={setInvOpen}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6"
          />
        </InventoryPopover>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Thao tác"
            aria-label="Thao tác"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => {
            if (invOpen) e.preventDefault();
          }}
        >
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
          {onEdit && (
            <DropdownMenuItem onClick={() => onEdit(row)}>
              <Pencil className="h-3 w-3" aria-hidden />
              Chỉnh sửa chi tiết
            </DropdownMenuItem>
          )}
          {showInventoryAction && (
            <DropdownMenuItem
              onSelect={() => {
                if (useInventoryPopover) setTimeout(() => setInvOpen(true), 0);
                else onInventory?.(row);
              }}
            >
              <Package className="h-3 w-3" aria-hidden />
              {isFab ? "Xem tồn phôi vật liệu" : "Xem tồn kho"}
            </DropdownMenuItem>
          )}
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
              Gửi yêu cầu sản xuất
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
