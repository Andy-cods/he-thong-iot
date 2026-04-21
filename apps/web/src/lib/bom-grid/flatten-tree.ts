import type { BomTreeNodeRaw } from "@/hooks/useBom";

/**
 * V1.7-beta.2 — Flatten BOM tree thành mảng row cho data grid.
 *
 * Extract từ `build-workbook.ts` V1.5 (Univer) để reuse cho BomGridPro
 * (Tanstack Table). DFS parent → children theo `position`, giữ indent
 * theo depth, đánh dấu `isGroup` cho node có con.
 *
 * KHÔNG phụ thuộc Univer — có thể reuse cả 2 grid trong giai đoạn dual-mode.
 */

export type BomComponentKind = "fab" | "com" | "group";

export interface BomFlatRow {
  /** Line ID (bom_line.id) — key React row. */
  id: string;
  /** Node gốc từ API. */
  node: BomTreeNodeRaw;
  /** 0-based depth (root=0). Group header depth = level-1 của node. */
  depth: number;
  /** Node này có children hay không — render group header nếu true. */
  isGroup: boolean;
  /** Số children trực tiếp (chỉ meaningful khi isGroup). */
  childCount: number;
  /** Loại linh kiện: fab (gia công) / com (thương mại) / group (cụm lắp). */
  kind: BomComponentKind;
  /** Mã SKU đã indent theo depth (hiện thị text). */
  indentedSku: string;
}

/**
 * Suy loại fab/com/group.
 *
 * Thứ tự ưu tiên:
 *   1. Có con → "group" (cụm lắp — luôn override).
 *   2. `metadata.kind = "com" | "fab"` từ BOM line (V1.7-beta.2.1 override).
 *   3. Derive từ `componentItemType`: FABRICATED/SUB_ASSEMBLY → "fab", còn lại → "com".
 */
function deriveKind(node: BomTreeNodeRaw, hasChildren: boolean): BomComponentKind {
  if (hasChildren) return "group";
  const meta = (node.metadata ?? {}) as { kind?: unknown };
  if (meta.kind === "com" || meta.kind === "fab") return meta.kind;
  const t = (node.componentItemType ?? "").toUpperCase();
  if (t === "FABRICATED" || t === "SUB_ASSEMBLY") return "fab";
  return "com";
}

/** Indent SKU bằng 3 space × depth cho visual hierarchy trong grid flat. */
function indent(sku: string | null, depth: number): string {
  const pad = "   ".repeat(Math.max(depth, 0));
  return `${pad}${sku ?? ""}`;
}

/**
 * Flatten DFS: parent → children theo thứ tự `position` từ server.
 * Group header rows xuất hiện TRƯỚC children của nó.
 */
export function flattenBomTree(tree: BomTreeNodeRaw[]): BomFlatRow[] {
  const byParent = new Map<string | null, BomTreeNodeRaw[]>();
  for (const n of tree) {
    const key = n.parentLineId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }
  byParent.forEach((arr) => arr.sort((a, b) => a.position - b.position));

  const rows: BomFlatRow[] = [];
  const dfs = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? [];
    for (const n of children) {
      const subChildren = byParent.get(n.id) ?? [];
      const hasChildren = subChildren.length > 0;
      const isGroup = hasChildren;
      rows.push({
        id: n.id,
        node: n,
        depth,
        isGroup,
        childCount: subChildren.length,
        kind: deriveKind(n, hasChildren),
        indentedSku: indent(n.componentSku, depth),
      });
      if (hasChildren) dfs(n.id, depth + 1);
    }
  };
  dfs(null, 0);
  return rows;
}
