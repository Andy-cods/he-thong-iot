"use client";

import * as React from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
  Pencil,
  Package,
  Layers,
  Cog,
} from "lucide-react";
import { BOM_MAX_LEVEL } from "@iot/shared";
import type { BomTreeNodeRaw } from "@/hooks/useBom";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

export interface BomFlatNode extends BomTreeNodeRaw {
  /** Toàn bộ ancestor ids (để disable drop vào descendant). */
  ancestorIds: string[];
}

export interface BomTreeViewProps {
  tree: BomTreeNodeRaw[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (
    lineId: string,
    newParentLineId: string | null,
    newPosition: number,
  ) => void;
  onEdit: (id: string) => void;
  onAdd: (parentLineId: string | null) => void;
  onDelete: (id: string) => void;
  /** Khi > 50 flat visible nodes, enable virtualize (Q1=b). */
  virtualizeThreshold?: number;
}

function flatten(tree: BomTreeNodeRaw[]): BomFlatNode[] {
  // Build parent → ancestors map để tính ancestorIds O(n).
  const byId = new Map<string, BomTreeNodeRaw>();
  tree.forEach((n) => byId.set(n.id, n));
  const getAncestors = (n: BomTreeNodeRaw): string[] => {
    const acc: string[] = [];
    let cur = n.parentLineId;
    let guard = 0;
    while (cur && guard < 10) {
      acc.push(cur);
      const p = byId.get(cur);
      cur = p?.parentLineId ?? null;
      guard++;
    }
    return acc;
  };
  return tree.map((n) => ({ ...n, ancestorIds: getAncestors(n) }));
}

function computeVisible(
  nodes: BomFlatNode[],
  expanded: Set<string>,
): BomFlatNode[] {
  // Tree đã ORDER BY level, position từ server.
  // Ẩn node nếu có ancestor nào KHÔNG trong expanded.
  // Root always visible. Expanded mặc định bao gồm tất cả cha (implicit nếu
  // không có trong collapsed → expanded).
  const collapsedHidden = new Set<string>();
  // Duyệt theo thứ tự (cha trước con nhờ level ordering).
  for (const n of nodes) {
    if (n.parentLineId && collapsedHidden.has(n.parentLineId)) {
      collapsedHidden.add(n.id);
      continue;
    }
    // Nếu node này KHÔNG expanded → children bị ẩn (tức là child.parentLineId === n.id).
    if (!expanded.has(n.id)) {
      collapsedHidden.add(n.id); // đánh dấu "descendants của node này sẽ hidden"
      // chú ý: bản thân node vẫn visible — ta chỉ dùng marker cho children.
    }
  }
  // Recompute: 1 node visible nếu parent KHÔNG bị marker "descendants hidden",
  // hoặc nó là root.
  const visible: BomFlatNode[] = [];
  const hiddenDescOf = new Set<string>();
  for (const n of nodes) {
    if (n.parentLineId && hiddenDescOf.has(n.parentLineId)) {
      hiddenDescOf.add(n.id);
      continue;
    }
    visible.push(n);
    if (!expanded.has(n.id)) {
      hiddenDescOf.add(n.id);
    }
  }
  return visible;
}

const TYPE_ICON = (level: number) => {
  if (level === 1) return Package;
  if (level === 2) return Layers;
  return Cog;
};

export function BomTreeView({
  tree,
  selectedId,
  onSelect,
  onMove,
  onEdit,
  onAdd,
  onDelete,
  virtualizeThreshold = 50,
}: BomTreeViewProps) {
  const flat = React.useMemo(() => flatten(tree), [tree]);

  // Default expanded: tất cả root + cha-của-con đã load.
  const defaultExpanded = React.useMemo(() => {
    const s = new Set<string>();
    flat.forEach((n) => s.add(n.id));
    return s;
  }, [flat]);

  const [expanded, setExpanded] = React.useState<Set<string>>(defaultExpanded);

  // Sync khi tree reload — preserve user collapse nhưng add nodes mới.
  React.useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      flat.forEach((n) => {
        if (!prev.has(n.id)) next.add(n.id);
      });
      return next;
    });
  }, [flat]);

  const visible = React.useMemo(
    () => computeVisible(flat, expanded),
    [flat, expanded],
  );

  const toggleExpand = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const focusedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    focusedRef.current = selectedId;
  }, [selectedId]);

  // Keyboard nav within tree
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (visible.length === 0) return;
    const idx = visible.findIndex((n) => n.id === selectedId);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = visible[Math.min(visible.length - 1, Math.max(0, idx) + 1)];
      if (n) onSelect(n.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const n = visible[Math.max(0, (idx < 0 ? 0 : idx) - 1)];
      if (n) onSelect(n.id);
    } else if (e.key === "Enter" && selectedId) {
      e.preventDefault();
      toggleExpand(selectedId);
    } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
      e.preventDefault();
      onDelete(selectedId);
    } else if (e.key.toLowerCase() === "e" && selectedId) {
      e.preventDefault();
      onEdit(selectedId);
    }
  };

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeNode = flat.find((n) => n.id === active.id);
    const overNode = flat.find((n) => n.id === over.id);
    if (!activeNode || !overNode) return;

    // Disallow drop vào descendant của chính mình.
    if (overNode.ancestorIds.includes(activeNode.id)) {
      return;
    }

    // Simple strategy (V1.1-alpha): reorder within same parent.
    // Khi drop lên over node khác parent → đặt cùng parent với over, position
    // của over + 1 (swap-style). Level check = over.level.
    const targetLevel = overNode.level;
    if (targetLevel > BOM_MAX_LEVEL) return;

    const newParent = overNode.parentLineId;
    const newPosition = overNode.position;

    onMove(String(active.id), newParent, newPosition);
  };

  const parentRef = React.useRef<HTMLDivElement>(null);
  const useVirtualize = visible.length > virtualizeThreshold;

  const virt = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 12,
    enabled: useVirtualize,
  });

  const visibleIds = visible.map((n) => n.id);

  return (
    <div
      ref={parentRef}
      onKeyDown={handleKey}
      tabIndex={0}
      className="relative h-full min-h-[400px] w-full overflow-auto rounded-md border border-zinc-200 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      role="tree"
      aria-label="Cây linh kiện BOM"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={visibleIds}
          strategy={verticalListSortingStrategy}
        >
          {!useVirtualize &&
            visible.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                isSelected={selectedId === node.id}
                isExpanded={expanded.has(node.id)}
                canExpand={node.childCount > 0}
                onToggleExpand={() => toggleExpand(node.id)}
                onSelect={() => onSelect(node.id)}
                onEdit={() => onEdit(node.id)}
                onAdd={() => onAdd(node.id)}
                onDelete={() => onDelete(node.id)}
              />
            ))}

          {useVirtualize && (
            <div
              style={{ height: `${virt.getTotalSize()}px` }}
              className="relative w-full"
            >
              {virt.getVirtualItems().map((v) => {
                const node = visible[v.index];
                if (!node) return null;
                return (
                  <div
                    key={node.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${v.start}px)`,
                      height: `${v.size}px`,
                    }}
                  >
                    <TreeRow
                      node={node}
                      isSelected={selectedId === node.id}
                      isExpanded={expanded.has(node.id)}
                      canExpand={node.childCount > 0}
                      onToggleExpand={() => toggleExpand(node.id)}
                      onSelect={() => onSelect(node.id)}
                      onEdit={() => onEdit(node.id)}
                      onAdd={() => onAdd(node.id)}
                      onDelete={() => onDelete(node.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </SortableContext>
      </DndContext>

      {visible.length === 0 && (
        <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
          Chưa có linh kiện nào.
        </div>
      )}
    </div>
  );
}

interface TreeRowProps {
  node: BomFlatNode;
  isSelected: boolean;
  isExpanded: boolean;
  canExpand: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onAdd: () => void;
  onDelete: () => void;
}

function TreeRow({
  node,
  isSelected,
  isExpanded,
  canExpand,
  onToggleExpand,
  onSelect,
  onEdit,
  onAdd,
  onDelete,
}: TreeRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = TYPE_ICON(node.level);
  const indentPx = (node.level - 1) * 16;
  const scrap = Number(node.scrapPercent);

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="treeitem"
      aria-level={node.level}
      aria-selected={isSelected}
      aria-expanded={canExpand ? isExpanded : undefined}
      onClick={onSelect}
      className={cn(
        "group relative flex h-8 items-center gap-1 border-b border-zinc-100 pl-1 pr-2 text-base transition-colors duration-100",
        "hover:bg-zinc-50",
        isSelected && "border-l-2 border-l-blue-500 bg-blue-50",
        isDragging && "z-10 bg-white shadow-md",
      )}
    >
      {/* drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="inline-flex h-6 w-4 cursor-grab items-center justify-center text-zinc-300 hover:text-zinc-600 active:cursor-grabbing"
        aria-label={`Kéo để sắp xếp ${node.componentSku ?? node.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3" aria-hidden="true" />
      </button>

      {/* indent + chevron */}
      <div style={{ width: indentPx }} aria-hidden="true" />
      {canExpand ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          aria-label={isExpanded ? "Thu gọn" : "Mở rộng"}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          )}
        </button>
      ) : (
        <div className="h-5 w-5" aria-hidden="true" />
      )}

      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          node.level === 1
            ? "text-blue-500"
            : node.level === 2
              ? "text-emerald-500"
              : "text-zinc-400",
        )}
        aria-hidden="true"
      />

      {/* SKU mono */}
      <span className="w-24 shrink-0 truncate font-mono text-sm text-zinc-700">
        {node.componentSku ?? "—"}
      </span>

      {/* Name */}
      <span className="min-w-0 flex-1 truncate text-zinc-900">
        {node.componentName ?? "Chưa có"}
      </span>

      {/* qty */}
      <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-700">
        {formatNumber(Number(node.qtyPerParent))}{" "}
        {node.uom ?? node.componentUom ?? ""}
      </span>

      {/* scrap */}
      {scrap > 0 && (
        <span className="shrink-0 text-xs text-zinc-500">
          scrap {scrap.toFixed(1)}%
        </span>
      )}

      {/* level badge */}
      <span className="shrink-0 rounded-sm bg-zinc-100 px-1 text-xs text-zinc-500">
        L{node.level}
      </span>

      {/* hover actions */}
      <div
        className={cn(
          "ml-1 hidden items-center gap-0.5",
          "group-hover:flex",
          isSelected && "flex",
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          disabled={node.level >= BOM_MAX_LEVEL}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"
          aria-label="Thêm linh kiện con"
          title={
            node.level >= BOM_MAX_LEVEL
              ? "Đã đạt độ sâu tối đa 5 cấp"
              : "Thêm con"
          }
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="Sửa"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-red-500 hover:bg-red-50"
          aria-label="Xoá"
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="Menu"
        >
          <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
