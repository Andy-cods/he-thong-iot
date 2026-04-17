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
} as const;
