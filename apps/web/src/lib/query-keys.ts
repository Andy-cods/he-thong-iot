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
    derivedStatus: (id: string) => ["bom", "derived-status", id] as const,
    activityLog: (id: string) => ["bom", "activity-log", id] as const,
    codeCheck: (code: string, excludeId?: string) =>
      ["bom", "code-check", code, excludeId ?? null] as const,
    import: {
      all: ["bom", "import"] as const,
      status: (batchId: string) => ["bom", "import", "status", batchId] as const,
    },
    revisions: {
      all: ["bom", "revisions"] as const,
      list: (templateId: string) =>
        ["bom", "revisions", "list", templateId] as const,
      detail: (revisionId: string) =>
        ["bom", "revisions", "detail", revisionId] as const,
    },
  },
  snapshots: {
    all: ["snapshots"] as const,
    lines: (orderCode: string, filter?: SnapshotFilter) =>
      filter === undefined
        ? (["snapshots", "lines", orderCode] as const)
        : (["snapshots", "lines", orderCode, filter] as const),
    line: (id: string) => ["snapshots", "line", id] as const,
    summary: (orderCode: string) =>
      ["snapshots", "summary", orderCode] as const,
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
  orders: {
    all: ["orders"] as const,
    list: (filter: OrderFilter) => ["orders", "list", filter] as const,
    detail: (code: string) => ["orders", "detail", code] as const,
    productionSummary: (code: string) =>
      ["orders", code, "production-summary"] as const,
  },
  procurement: {
    all: ["procurement"] as const,
    requests: {
      all: ["procurement", "requests"] as const,
      list: (filter: PRFilter) =>
        ["procurement", "requests", "list", filter] as const,
      detail: (id: string) =>
        ["procurement", "requests", "detail", id] as const,
      lines: (id: string) =>
        ["procurement", "requests", "lines", id] as const,
    },
    orders: {
      all: ["procurement", "orders"] as const,
      list: (filter: POFilter) =>
        ["procurement", "orders", "list", filter] as const,
      detail: (id: string) =>
        ["procurement", "orders", "detail", id] as const,
      lines: (id: string) =>
        ["procurement", "orders", "lines", id] as const,
    },
  },
  shortage: {
    all: ["shortage"] as const,
    list: (filter: ShortageBoardFilter) =>
      ["shortage", "list", filter] as const,
    byOrder: (orderId: string) => ["shortage", "by-order", orderId] as const,
  },
  receiving: {
    all: ["receiving"] as const,
    history: (poCode: string) => ["receiving", "history", poCode] as const,
    lot: (id: string) => ["receiving", "lot", id] as const,
  },
  workOrders: {
    all: ["workOrders"] as const,
    list: (filter: WorkOrderFilter) =>
      ["workOrders", "list", filter] as const,
    detail: (id: string) => ["workOrders", "detail", id] as const,
    qcChecks: (id: string) => ["workOrders", "qc-checks", id] as const,
  },
  productLines: {
    all: ["productLines"] as const,
    list: (filter: ProductLineFilter) =>
      ["productLines", "list", filter] as const,
    detail: (id: string) => ["productLines", "detail", id] as const,
    members: (id: string) => ["productLines", "members", id] as const,
    orders: (id: string) => ["productLines", "orders", id] as const,
    workOrders: (id: string) => ["productLines", "workOrders", id] as const,
    purchaseOrders: (id: string) =>
      ["productLines", "purchaseOrders", id] as const,
  },
  reservations: {
    all: ["reservations"] as const,
    bySnapshot: (snapshotLineId: string) =>
      ["reservations", "by-snapshot", snapshotLineId] as const,
    byWo: (woId: string) => ["reservations", "by-wo", woId] as const,
  },
} as const;

export interface WorkOrderFilter {
  q?: string;
  status?: (
    | "DRAFT"
    | "QUEUED"
    | "RELEASED"
    | "IN_PROGRESS"
    | "PAUSED"
    | "COMPLETED"
    | "CANCELLED"
  )[];
  orderId?: string;
  /** V1.6 — filter WO theo BOM template (JOIN qua sales_order.bom_template_id). */
  bomTemplateId?: string;
  page?: number;
  pageSize?: number;
}

export interface OrderFilter {
  q?: string;
  status?: (
    | "DRAFT"
    | "CONFIRMED"
    | "SNAPSHOTTED"
    | "IN_PROGRESS"
    | "FULFILLED"
    | "CLOSED"
    | "CANCELLED"
  )[];
  customer?: string;
  dateFrom?: string;
  dateTo?: string;
  /** V1.6 — filter orders theo BOM template. FK direct: sales_order.bom_template_id. */
  bomTemplateId?: string;
  sort?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

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

export interface SnapshotFilter {
  state?: (
    | "PLANNED"
    | "PURCHASING"
    | "IN_PRODUCTION"
    | "INBOUND_QC"
    | "PROD_QC"
    | "AVAILABLE"
    | "RESERVED"
    | "ISSUED"
    | "ASSEMBLED"
    | "CLOSED"
  )[];
  level?: number;
  q?: string;
  shortOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PRFilter {
  q?: string;
  status?: (
    | "DRAFT"
    | "SUBMITTED"
    | "APPROVED"
    | "CONVERTED"
    | "REJECTED"
  )[];
  linkedOrderId?: string;
  requestedBy?: string;
  page?: number;
  pageSize?: number;
}

export interface POFilter {
  q?: string;
  status?: (
    | "DRAFT"
    | "SENT"
    | "PARTIAL"
    | "RECEIVED"
    | "CANCELLED"
    | "CLOSED"
  )[];
  supplierId?: string;
  prId?: string;
  page?: number;
  pageSize?: number;
}

export interface ShortageBoardFilter {
  itemId?: string[];
  supplierId?: string[];
  orderId?: string;
  /** V1.6 — filter shortage theo BOM template (JOIN snapshot_line → sales_order). */
  bomTemplateId?: string;
  minShortQty?: number;
  q?: string;
  limit?: number;
}

export interface ProductLineFilter {
  q?: string;
  status?: ("ACTIVE" | "ARCHIVED")[];
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
