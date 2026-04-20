"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { toast } from "sonner";
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

/**
 * Level color mapping — distinct visual per BOM depth.
 * Dùng cho LevelBadge + indent guide.
 * L1 indigo (root), L2 emerald, L3 violet, L4 amber, L5 rose.
 */
const LEVEL_STYLE: Record<
  number,
  { bg: string; ring: string; text: string; guide: string }
> = {
  1: {
    bg: "bg-indigo-100",
    ring: "ring-indigo-500",
    text: "text-indigo-700",
    guide: "bg-indigo-200",
  },
  2: {
    bg: "bg-emerald-100",
    ring: "ring-emerald-500",
    text: "text-emerald-700",
    guide: "bg-emerald-200",
  },
  3: {
    bg: "bg-violet-100",
    ring: "ring-violet-500",
    text: "text-violet-700",
    guide: "bg-violet-200",
  },
  4: {
    bg: "bg-amber-100",
    ring: "ring-amber-500",
    text: "text-amber-700",
    guide: "bg-amber-200",
  },
  5: {
    bg: "bg-rose-100",
    ring: "ring-rose-500",
    text: "text-rose-700",
    guide: "bg-rose-200",
  },
};

function getLevelStyle(level: number) {
  return LEVEL_STYLE[Math.max(1, Math.min(5, level))] ?? LEVEL_STYLE[5]!;
}

function BomTreeHeader() {
  return (
    <div
      className="sticky top-0 z-10 flex h-8 items-center gap-1 border-b border-zinc-200 bg-zinc-50 pl-1 pr-2 text-xs font-medium uppercase tracking-wide text-zinc-500 min-w-[720px]"
      aria-hidden="true"
    >
      {/* grip placeholder */}
      <div className="w-4 shrink-0" />
      {/* chevron placeholder */}
      <div className="w-5 shrink-0" />
      {/* icon placeholder */}
      <div className="w-4 shrink-0" />
      {/* SKU */}
      <span className="w-28 shrink-0">SKU</span>
      {/* Tên */}
      <span className="flex-1 min-w-0">Tên linh kiện</span>
      {/* Danh mục */}
      <span className="w-24 shrink-0">Danh mục</span>
      {/* ĐVT */}
      <span className="w-16 shrink-0 text-center">ĐVT</span>
      {/* Số lượng */}
      <span className="w-20 shrink-0 text-right">Số lượng</span>
      {/* Hao hụt */}
      <span className="w-16 shrink-0 text-right">Hao hụt</span>
      {/* Actions placeholder */}
      <div className="w-24 shrink-0" />
    </div>
  );
}

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

  // Default expanded: KHÔNG có node nào expand sẵn — user phải click chevron
  // để xổ children. Giống Windows Explorer / Finder. Chỉ L1 root lúc nào cũng
  // visible (không bị parent ẩn vì không có parent).
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  // Giữ nguyên user expansion khi tree reload. KHÔNG auto-expand node mới —
  // tôn trọng trạng thái user đã chọn. Chỉ cleanup id đã xoá khỏi tree.
  React.useEffect(() => {
    setExpanded((prev) => {
      const ids = new Set(flat.map((n) => n.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
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
  // ArrowUp/Down: điều hướng; ArrowRight: expand; ArrowLeft: collapse (về parent nếu đã collapse)
  // Enter: toggle expand (backward compat); e: edit; Delete/Backspace: xoá.
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (visible.length === 0) return;
    const idx = visible.findIndex((n) => n.id === selectedId);
    const selectedNode = idx >= 0 ? visible[idx] : null;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = visible[Math.min(visible.length - 1, Math.max(0, idx) + 1)];
      if (n) onSelect(n.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const n = visible[Math.max(0, (idx < 0 ? 0 : idx) - 1)];
      if (n) onSelect(n.id);
    } else if (e.key === "ArrowRight" && selectedNode) {
      e.preventDefault();
      if (selectedNode.childCount > 0 && !expanded.has(selectedNode.id)) {
        toggleExpand(selectedNode.id);
      } else if (selectedNode.childCount > 0 && expanded.has(selectedNode.id)) {
        // đã expand → nhảy xuống con đầu tiên
        const firstChild = visible[idx + 1];
        if (firstChild?.parentLineId === selectedNode.id) onSelect(firstChild.id);
      }
    } else if (e.key === "ArrowLeft" && selectedNode) {
      e.preventDefault();
      if (selectedNode.childCount > 0 && expanded.has(selectedNode.id)) {
        toggleExpand(selectedNode.id);
      } else if (selectedNode.parentLineId) {
        // collapse rồi thì nhảy về parent
        onSelect(selectedNode.parentLineId);
      }
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

  // Drag state: 3-zone detection (top 30% / middle 40% / bottom 30%).
  type DropZone = "before" | "into" | "after";
  const [activeNode, setActiveNode] = React.useState<BomFlatNode | null>(null);
  const [dropZone, setDropZone] = React.useState<DropZone | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const node = flat.find((n) => n.id === event.active.id);
    if (node) setActiveNode(node);
  };

  // Khi drag hover trên parent collapsed → auto expand sau 600ms để user có thể
  // drop vào children (spring-loaded folders pattern).
  const expandTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!overId || !activeNode) {
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
      }
      return;
    }
    const overNode = flat.find((n) => n.id === overId);
    if (!overNode || overNode.childCount === 0 || expanded.has(overNode.id)) {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
      return;
    }
    if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    expandTimerRef.current = setTimeout(() => {
      setExpanded((prev) => new Set(prev).add(overNode.id));
    }, 600);
    return () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    };
  }, [overId, activeNode, flat, expanded]);

  // onDragOver: compute zone dựa vào vị trí con trỏ trong rect của over.
  // Throttle 16ms (60fps) bằng setState — React batch update đã đủ smooth,
  // không cần raf manual vì dnd-kit tự throttle pointer events.
  const handleDragOver = React.useCallback((event: DragOverEvent) => {
    const { over, active, activatorEvent, delta } = event;
    if (!over || over.id === active.id) {
      setDropZone(null);
      setOverId(null);
      return;
    }
    const rect = over.rect;
    // activatorEvent là event gốc khi bắt đầu drag (pointerDown).
    // pointerY hiện tại = activator.clientY + delta.y.
    const activator = activatorEvent as PointerEvent | MouseEvent | undefined;
    const startY =
      activator && "clientY" in activator ? activator.clientY : rect.top;
    const pointerY = startY + (delta?.y ?? 0);
    const relative = pointerY - rect.top;
    const ratio = Math.max(0, Math.min(1, relative / rect.height));
    const zone: DropZone =
      ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "into";
    setDropZone((prev) => (prev === zone ? prev : zone));
    setOverId((prev) => (prev === String(over.id) ? prev : String(over.id)));
  }, []);

  // Compute subtree depth của active node: số level sâu nhất dưới nó + 1 (bao gồm chính nó).
  const getSubtreeDepth = React.useCallback(
    (rootId: string): number => {
      const rootLevel = flat.find((n) => n.id === rootId)?.level ?? 1;
      let maxLevel = rootLevel;
      for (const n of flat) {
        if (n.id === rootId || n.ancestorIds.includes(rootId)) {
          if (n.level > maxLevel) maxLevel = n.level;
        }
      }
      return maxLevel - rootLevel + 1;
    },
    [flat],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    // Reset visual state bất kể drop thành công hay không.
    const zone = dropZone;
    setActiveNode(null);
    setDropZone(null);
    setOverId(null);

    if (!over || active.id === over.id || !zone) return;
    const activeNodeRef = flat.find((n) => n.id === active.id);
    const overNode = flat.find((n) => n.id === over.id);
    if (!activeNodeRef || !overNode) return;

    // Guard 1: cấm drop vào descendant của chính nó (cyclic).
    if (
      overNode.id === activeNodeRef.id ||
      overNode.ancestorIds.includes(activeNodeRef.id)
    ) {
      toast.error("Không thể di chuyển vào con cháu của chính nó");
      return;
    }

    // Compute newParent + newPosition + projectedLevel theo zone.
    let newParent: string | null;
    let newPosition: number;
    let projectedLevel: number;
    if (zone === "into") {
      newParent = overNode.id;
      // position = max current children + 1
      const children = flat.filter((n) => n.parentLineId === overNode.id);
      newPosition = children.length + 1;
      projectedLevel = overNode.level + 1;
    } else if (zone === "before") {
      newParent = overNode.parentLineId;
      newPosition = overNode.position;
      projectedLevel = overNode.level;
    } else {
      // after
      newParent = overNode.parentLineId;
      newPosition = overNode.position + 1;
      projectedLevel = overNode.level;
    }

    // Guard 2: depth check — projectedLevel + subtree depth active - 1 ≤ BOM_MAX_LEVEL.
    const activeSubtreeDepth = getSubtreeDepth(activeNodeRef.id);
    const finalMaxLevel = projectedLevel + activeSubtreeDepth - 1;
    if (finalMaxLevel > BOM_MAX_LEVEL) {
      toast.error(
        `Vượt quá ${BOM_MAX_LEVEL} cấp BOM — thử drop ở vị trí nông hơn.`,
      );
      return;
    }

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
      className="relative h-full min-h-[400px] w-full overflow-auto rounded-md border border-zinc-200 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
      role="tree"
      aria-label="Cây linh kiện BOM"
    >
      <BomTreeHeader />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveNode(null);
          setDropZone(null);
          setOverId(null);
        }}
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
                isOver={overId === node.id}
                dropZone={overId === node.id ? dropZone : null}
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
                      isOver={overId === node.id}
                      dropZone={overId === node.id ? dropZone : null}
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

        <DragOverlay dropAnimation={null}>
          {activeNode && (
            <div className="flex h-8 items-center gap-2 rounded-md border border-indigo-300 bg-white px-3 shadow-lg ring-1 ring-indigo-400">
              <GripVertical
                className="h-3 w-3 text-zinc-400"
                aria-hidden="true"
              />
              <span className="font-mono text-sm text-zinc-700">
                {activeNode.componentSku ?? "—"}
              </span>
              <span className="max-w-[200px] truncate text-sm text-zinc-600">
                {activeNode.componentName ?? ""}
              </span>
              <span className="ml-1 rounded-sm bg-zinc-100 px-1 text-xs text-zinc-500">
                L{activeNode.level}
              </span>
            </div>
          )}
        </DragOverlay>
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
  isOver: boolean;
  dropZone: "before" | "into" | "after" | null;
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
  isOver,
  dropZone,
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

  const levelStyle = getLevelStyle(node.level);
  const indentPx = (node.level - 1) * 16;
  const scrap = Number(node.scrapPercent);

  // Drop zone visual:
  // - before: border-top indigo
  // - into: bg-indigo-50 + border-left indigo
  // - after: border-bottom indigo
  const zoneClass =
    isOver && dropZone === "into"
      ? "bg-indigo-50 border-l-2 border-l-indigo-500"
      : "";
  const beforeBar =
    isOver && dropZone === "before" ? (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 top-0 h-0.5 bg-indigo-500"
      />
    ) : null;
  const afterBar =
    isOver && dropZone === "after" ? (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
      />
    ) : null;

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
        "group relative flex h-8 items-center gap-1 border-b border-zinc-100 pl-1 pr-2 text-base transition-colors duration-100 min-w-[720px]",
        "hover:bg-zinc-50",
        isSelected && "border-l-2 border-l-indigo-500 bg-indigo-50",
        isDragging && "z-10 bg-white opacity-50 shadow-md",
        zoneClass,
      )}
    >
      {beforeBar}
      {afterBar}
      {/* Connector guide lines — render 1 vertical line per ancestor level
           (level 2..n) để tạo tree-view cổ điển như Finder/Explorer. */}
      {node.level > 1 &&
        Array.from({ length: node.level - 1 }).map((_, i) => {
          const left = 20 + i * 16; // 20 = grip(16) + gap(4), 16 = indent step
          return (
            <span
              key={`guide-${i}`}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-zinc-200"
              style={{ left: `${left}px` }}
            />
          );
        })}

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
          title={isExpanded ? "Thu gọn (←)" : "Mở rộng (→)"}
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

      {/* Level badge — circle chứa L{n} với color riêng biệt theo độ sâu */}
      <span
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 text-[10px] font-semibold tabular-nums",
          levelStyle.bg,
          levelStyle.ring,
          levelStyle.text,
        )}
        aria-label={`Level ${node.level}`}
        title={`Cấp ${node.level}`}
      >
        {node.level}
      </span>

      {/* SKU mono — w-28 */}
      <span className="w-28 shrink-0 truncate font-mono text-sm text-zinc-700">
        {node.componentSku ?? "—"}
      </span>

      {/* Name — flex-1 */}
      <span className="min-w-0 flex-1 truncate text-zinc-900">
        {node.componentName ?? "Chưa có"}
      </span>

      {/* Danh mục — w-24 */}
      <span className="w-24 shrink-0 truncate text-xs text-zinc-400">
        {node.componentCategory ?? "—"}
      </span>

      {/* ĐVT — w-16 */}
      <span className="w-16 shrink-0 text-center text-xs text-zinc-500">
        {node.uom ?? node.componentUom ?? "—"}
      </span>

      {/* Số lượng — w-20 */}
      <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-700">
        {formatNumber(Number(node.qtyPerParent))}
      </span>

      {/* Hao hụt — w-16 */}
      <span className="w-16 shrink-0 text-right text-xs text-zinc-500">
        {scrap > 0 ? `${scrap.toFixed(1)}%` : "—"}
      </span>

      {/* hover actions — w-24 */}
      <div
        className={cn(
          "w-24 shrink-0 hidden items-center justify-end gap-0.5",
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
