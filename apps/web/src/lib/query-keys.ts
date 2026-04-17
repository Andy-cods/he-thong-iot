/**
 * React Query key factory — brainstorm-deep §1.2.
 *
 * Dùng 1 factory duy nhất cho toàn bộ app. Không tự viết key raw trong component.
 * Prefix invalidate: `queryClient.invalidateQueries({ queryKey: qk.items.all })`
 * sẽ match cả list + detail + sku-check vì đều chia sẻ prefix `["items"]`.
 */

export interface ItemFilter {
  q?: string;
  type?: string[];
  uom?: string[];
  status?: string[];
  category?: string;
  supplierId?: string;
  lotTracked?: boolean;
  active?: boolean;
  minStockViolation?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export const qk = {
  items: {
    all: ["items"] as const,
    list: (filter: ItemFilter) => ["items", "list", filter] as const,
    detail: (id: string) => ["items", "detail", id] as const,
    skuCheck: (sku: string) => ["items", "sku-check", sku] as const,
    barcodes: (id: string) => ["items", id, "barcodes"] as const,
    suppliers: (id: string) => ["items", id, "suppliers"] as const,
    bulkExport: (ids: string[]) =>
      ["items", "bulk-export", ids.slice().sort().join(",")] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    list: ["suppliers", "list"] as const,
    detail: (id: string) => ["suppliers", "detail", id] as const,
  },
  dashboard: {
    overview: ["dashboard", "overview"] as const,
    alerts: ["dashboard", "alerts"] as const,
    systemHealth: ["dashboard", "system-health"] as const,
  },
  import: {
    preview: (fileHash: string) => ["import", "preview", fileHash] as const,
    job: (jobId: string) => ["import", "job", jobId] as const,
  },
  auth: {
    me: ["auth", "me"] as const,
  },
  bom: {
    all: ["bom"] as const,
    list: (filter: BomFilter) => ["bom", "list", filter] as const,
    detail: (id: string) => ["bom", "detail", id] as const,
    tree: (id: string) => ["bom", "tree", id] as const,
    codeCheck: (code: string, excludeId?: string) =>
      ["bom", "code-check", code, excludeId ?? null] as const,
    import: {
      all: ["bom", "import"] as const,
      status: (batchId: string) => ["bom", "import", "status", batchId] as const,
    },
  },
  admin: {
    all: ["admin"] as const,
    users: {
      all: ["admin", "users"] as const,
      list: (filter: UserFilter) => ["admin", "users", "list", filter] as const,
      detail: (id: string) => ["admin", "users", "detail", id] as const,
    },
    audit: {
      all: ["admin", "audit"] as const,
      list: (filter: AuditFilter) => ["admin", "audit", "list", filter] as const,
    },
  },
  po: {
    detail: (id: string) => ["po", "detail", id] as const,
  },
} as const;

export interface UserFilter {
  q?: string;
  role?: "admin" | "planner" | "warehouse" | "operator";
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AuditFilter {
  q?: string;
  entity?: string[];
  action?: string[];
  actorUsername?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface BomFilter {
  q?: string;
  status?: ("DRAFT" | "ACTIVE" | "OBSOLETE")[];
  hasComponents?: boolean;
  sort?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
