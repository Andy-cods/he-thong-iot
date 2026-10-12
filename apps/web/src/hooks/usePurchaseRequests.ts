"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  PRCancelInput,
  PRCreateInput,
  PRUpdateInput,
  PRRejectInput,
  PRStatus,
} from "@iot/shared";
import { qk, type PRFilter } from "@/lib/query-keys";
import { invalidateStockQueries } from "@/lib/stock-cache";

/**
 * Purchase Requests hooks — V1.2 Phase B4.3.
 * Invalidate: qk.procurement.requests + shortage.all (khi create from-shortage)
 * + orders.all (khi PR gắn linked order). Dashboard cache cũng invalidate khi
 * approve/convert vì readiness % phụ thuộc PR state.
 */

export interface PRRow {
  id: string;
  code: string;
  title: string | null;
  /** V3.16 (mục 1) — nhãn tự sinh từ dòng vật tư đầu tiên, fallback khi title trống. */
  displayLabel?: string;
  status: PRStatus;
  source: string;
  linkedOrderId: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // V3.7.55 MRF
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestReason?: string | null;
  // V3.10 — loại phiếu trình bày (MRF | DNVT).
  formType?: "MRF" | "DNVT";
  // V3.7.69 YCVT
  paperFormNo?: string | null;
  approvalStep?:
    | "DRAFT"
    | "SUBMITTED"
    | "DEPT_APPROVED"
    | "DIRECTOR_APPROVED"
    | "CONVERTED"
    | "DONE"
    | "REJECTED";
  deptApprovedBy?: string | null;
  deptApprovedAt?: string | null;
  deptApprovalNote?: string | null;
  directorApprovedBy?: string | null;
  directorApprovedAt?: string | null;
  directorApprovalNote?: string | null;
  poCreatedAt?: string | null;
  goodsReceivedAt?: string | null;
  goodsIssuedAt?: string | null;
  completedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  totalEstimatedAmount?: string | null;
  // V3.7.73 — Resolved user fullName để hiển thị mục III/IV
  requestedByName?: string | null;
  deptApprovedByName?: string | null;
  directorApprovedByName?: string | null;
  rejectedByName?: string | null;
}

export interface PRLineEnriched {
  id: string;
  lineNo: number;
  /** V3.7.72 — Nullable: dòng nhập tay không có itemId. */
  itemId: string | null;
  sku: string | null;
  name: string | null;
  qty: string;
  preferredSupplierId: string | null;
  snapshotLineId: string | null;
  neededBy: string | null;
  notes: string | null;
  grossRequiredQty: string | null;
  remainingShortQty: string | null;
  // V3.7.55 MRF
  specification?: string | null;
  uom?: string | null;
  priority?: "URGENT" | "NORMAL" | "RESERVE" | null;
  category?: "TOOL" | "CONSUMABLE" | "MATERIAL" | "OTHER" | null;
  estimatedUnitPrice?: string | null;
  referenceCode?: string | null;
  approvedQty?: string | null;
  itemUom?: string | null;
  // V3.7.69 YCVT
  onHandSnapshot?: string | null;
  lineTotal?: string | null;
  // V4.0 Wave 3 Phase B — mã ID hệ thống duy nhất (khác referenceCode free-text).
  lineRefCode?: string | null;
  /** L8 — tổng đã xuất (cộng mọi đợt xuất kho). */
  issuedQty?: number;
  /** T2 — trần xuất kho của dòng (server tính: giai đoạn + hàng PO đã về). */
  issueCap?: number;
  /** Còn xuất được (= phần giữ chỗ) — server tính từ prIssueRight. */
  issueRemaining?: number;
  /** Tồn KHẢ DỤNG hiện tại của vật tư (chỉ trả cho admin/Kho/Mua hàng; null = không có quyền/dòng nhập tay). */
  availableQty?: number | null;
  /** N9 — tồn sau cam kết phiếu khác (chưa trừ dòng trước). */
  freeQty?: number | null;
  /** Sổ dòng do server tính (đề xuất, cần mua, đã về, đang về, chờ QC, đã xuất, trần, còn phải đặt…). */
  ledger?: PRLineLedger | null;
  // V3.10 DNVT — Tham khảo (free-text) + Ngày giao hàng. Server đã trả 2 cột
  // này từ lâu (xem server/repos/purchaseRequests.ts) nhưng interface này
  // thiếu khai báo — TASK-6VIEC Việc 2 cần đọc lại khi "mở phiếu nháp để sửa".
  referenceNote?: string | null;
  deliveryDate?: string | null;
}

/** Sổ dòng (server `LineLedger`). */
export interface PRLineLedger {
  req: number;
  buy: number;
  fromStock: number;
  receivedOk: number;
  pendingQc: number;
  inbound: number;
  orderedEffective: number;
  issued: number;
  cap: number;
  remaining: number;
  toOrder: number;
  waiting: number;
  legacy: boolean;
  hasItem: boolean;
}

export interface PRListResponse {
  data: PRRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    /** L13 — số phiếu theo trạng thái (áp mọi bộ lọc trừ status). */
    counts?: {
      byStatus: Partial<Record<PRStatus, number>>;
      bySubmittedStep: { SUBMITTED: number; DEPT_APPROVED: number };
      /** A14 — phiếu Hoàn tất (tách khỏi Đã duyệt) + số theo status không tính Hoàn tất. */
      completed?: number;
      byStatusActive?: Partial<Record<string, number>>;
      all: number;
    };
  };
}

/** V4.2 (TASK "Trừ tồn luôn") — phiếu xuất kho sinh ra khi PR "Đã xuất kho". */
export interface PRGoodsIssueRow {
  id: string;
  issueNo: string;
  totalQty: string;
  notes: string | null;
  issuedAt: string;
  issuedByName: string | null;
  lines: Array<{
    id: string;
    lineNo: number;
    itemId: string;
    sku: string | null;
    itemName: string | null;
    uom: string | null;
    lotSerialId: string;
    lotCode: string | null;
    binId: string;
    binCode: string | null;
    qty: string;
  }>;
}

export interface PRDetailResponse {
  data: PRRow & {
    lines: PRLineEnriched[];
    goodsIssues?: PRGoodsIssueRow[];
    /** A18 — các PO sinh từ phiếu này (nếu server trả) để mục IV hiện trạng thái PO thật. */
    purchaseOrders?: Array<{
      id?: string;
      poNo?: string | null;
      code?: string | null;
      status: string;
    }>;
    /** L8 — tiến độ xuất kho nhiều đợt. */
    issueProgress?: {
      complete: boolean;
      pendingLines: number;
      outstandingBuy?: boolean;
      lines: { id: string; cap: number; issued: number; remaining: number }[];
    };
    /** WAREHOUSE = đã qua Kho duyệt, chưa duyệt cuối (Kho xuất phần có sẵn); FINAL = sau duyệt cuối. */
    issueStage?: "WAREHOUSE" | "FINAL";
    /** SL còn xuất được từ kho ở giai đoạn hiện tại (0 = ẩn nút "Đã xuất kho" ở giai đoạn Kho). */
    warehouseIssuableRemaining?: number;
    /** Tổng cam kết (phần giữ + của phiếu khác) vượt tồn thực → cảnh báo Kiểm tồn lại. */
    shortOfCommitment?: boolean;
    /** Còn hàng đang về / lô chờ QC (chưa Kiểm tồn lại / Kết thúc được). */
    hasPendingPo?: boolean;
    /** N9 — còn phần xuất được THẬT (phiếu cũ chỉ khi tồn sau cam kết > 0). */
    issuableNow?: boolean;
    /** N9 — phiếu cũ còn phần xuất được nhưng tồn đã bị phiếu mới giữ hết. */
    legacyBlockedByHold?: boolean;
    /** Tổng sổ dòng của phiếu. */
    ledgerSummary?: {
      phase: "NONE" | "WAREHOUSE" | "FINAL";
      toOrder: number;
      waiting: number;
      outstandingBuy: number;
      complete: boolean;
      noWaiting: boolean;
      pendingLines: number;
    };
  };
}

export interface PRStockCheckLine {
  id: string;
  lineNo: number;
  itemId: string | null;
  sku: string | null;
  name: string | null;
  uom: string | null;
  qty: number;
  /** Tồn khả dụng HIỆN TẠI (AVAILABLE trừ giữ chỗ, không tính HOLD). */
  available: number;
  /** C4/L1 — tồn khả dụng của vật tư SAU khi trừ phần giữ chỗ cho phiếu khác (chưa trừ các dòng cùng vật tư phía trên). */
  stockTotal?: number;
  /** L1 — phần tồn đang giữ chỗ cho phiếu KHÁC đã qua Kho duyệt. */
  reservedByOthers?: number;
  /** Duyệt Kho: SL cần mua mặc định. */
  defaultBuyQty?: number;
  /** Kiểm tồn lại (sổ dòng). */
  issuedQty?: number;
  receivedOk?: number;
  orderedEffective?: number;
  stillNeeded?: number;
  defaultAddQty?: number;
  buyBefore?: number;
}

/** Kho kiểm tồn khi duyệt: dòng + tồn khả dụng + SL cần mua mặc định. */
export function usePrStockCheck(id: string | null, enabled: boolean, recheck = false) {
  return useQuery({
    queryKey: ["procurement", "requests", "stock-check", id ?? "__none__", recheck],
    queryFn: () =>
      request<{ data: { approvalStep: string | null; lines: PRStockCheckLine[] } }>(
        `/api/purchase-requests/${id}/stock-check${recheck ? "?recheck=1" : ""}`,
      ),
    enabled: !!id && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

interface RequestError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string; details?: unknown };
    };
    const err = new Error(
      body.error?.message ?? `HTTP ${res.status}`,
    ) as RequestError;
    err.status = res.status;
    err.code = body.error?.code;
    err.details = body.error?.details;
    throw err;
  }
  return (await res.json()) as T;
}

function buildListUrl(f: PRFilter): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.linkedOrderId) p.set("linkedOrderId", f.linkedOrderId);
  if (f.bomTemplateId) p.set("bomTemplateId", f.bomTemplateId);
  if (f.requestedBy) p.set("requestedBy", f.requestedBy);
  if (f.date) p.set("date", f.date);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.sortDir) p.set("sortDir", f.sortDir);
  if (f.completed) p.set("completed", "1");
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  for (const s of f.status ?? []) p.append("status", s);
  return `/api/purchase-requests?${p.toString()}`;
}

export function usePurchaseRequestsList(filter: PRFilter) {
  return useQuery({
    queryKey: qk.procurement.requests.list(filter),
    queryFn: () => request<PRListResponse>(buildListUrl(filter)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/**
 * V3.13 — Các "bucket" theo ngày cho kho lưu trữ thư mục ngày.
 * `scope`: "mine" | "all" (all = phụ thuộc RBAC canViewAllPRs ở server).
 */
export interface PRDayBucketResponse {
  days: {
    day: string;
    count: number;
    statuses: Record<string, number>;
  }[];
}

export function usePurchaseRequestsCalendar() {
  return useQuery({
    queryKey: ["procurement", "requests", "calendar"],
    queryFn: () =>
      request<PRDayBucketResponse>("/api/purchase-requests?view=calendar"),
    staleTime: 30_000,
  });
}

export function usePurchaseRequestDetail(id: string | null) {
  return useQuery({
    queryKey: id
      ? qk.procurement.requests.detail(id)
      : ["procurement", "requests", "detail", "__none__"],
    queryFn: () => request<PRDetailResponse>(`/api/purchase-requests/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

/**
 * V4.5 QA-E P2 — `idempotencyKey` tuỳ chọn: sinh 1 lần/phiên form (vd
 * `crypto.randomUUID()` qua `useRef`), gửi kèm MỌI lần submit (kể cả
 * double-click/retry) của phiên đó. Server (POST /api/purchase-requests)
 * dùng khoá này chặn tạo 2 phiếu trùng — không gửi thì giữ nguyên hành vi
 * cũ (không có idempotency, chỉ còn `disabled={isPending}` phía UI).
 */
export function useCreatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      ...data
    }: PRCreateInput & { idempotencyKey?: string }) =>
      request<{ data: PRRow }>("/api/purchase-requests", {
        method: "POST",
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
    },
  });
}

export function useUpdatePurchaseRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PRUpdateInput) =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/**
 * V3.9 — Admin duyệt nhanh 2 cấp trong 1 request (SUBMITTED → APPROVED).
 * Thay cho hook approve legacy (route /approve nay trả 410).
 */
export function useQuickApprovePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { note?: string | null; buyQtys?: Record<string, number> }) =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}/quick-approve`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

export function useRejectPurchaseRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PRRejectInput) =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}/reject`, {
        method: "POST",
        // M1 — gửi kèm bước đang thấy trên màn hình (data.expectedStep).
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/** V4.4 (Việc 4) — Huỷ phiếu (khác reject: người tạo/admin tự huỷ). */
export function useCancelPurchaseRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PRCancelInput) =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/**
 * V3.7.69 YCVT — preview số phiếu kế tiếp (`{seq}/PRD-MRF/{MMYY}`).
 * Re-fetch mỗi phút để khi qua tháng tự update MMYY.
 */
export function usePreviewPaperFormNo() {
  return useQuery({
    queryKey: ["procurement", "requests", "paper-form-no-preview"],
    queryFn: () =>
      request<{ data: { paperFormNo: string } }>(
        "/api/purchase-requests/preview-form-no",
      ),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/**
 * V3.7.69 YCVT — bulk inventory balance lookup theo nhiều itemIds.
 * Dùng cho form MRF: auto-fill cột "Tồn kho" khi user pick item.
 */
export interface InventoryBalanceRow {
  itemId: string;
  sku: string;
  name: string;
  uom: string;
  onHand: number;
  reserved: number;
  available: number;
  holdQty: number;
  minStockQty: number;
}

export function useBulkInventoryBalance(itemIds: string[]) {
  const key = itemIds.length > 0 ? itemIds.slice().sort().join(",") : "";
  return useQuery({
    queryKey: ["inventory", "balance-bulk", key],
    queryFn: async () => {
      if (itemIds.length === 0) return { data: [] };
      const url = `/api/inventory/balance?itemIds=${encodeURIComponent(key)}&hasLotOnly=false&pageSize=500`;
      return request<{ data: InventoryBalanceRow[] }>(url);
    },
    enabled: itemIds.length > 0,
    staleTime: 30_000,
  });
}

/**
 * V4.1 TM-06 — Gửi phiếu DRAFT (VD phiếu tạo từ thiếu hụt) → SUBMITTED, sinh
 * số phiếu giấy + báo Kho duyệt bước 2.
 */
export function useSubmitPR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}/submit`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/** V3.7.69 YCVT — Step 2: Trưởng bộ phận duyệt. */
export function useDeptApprovePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { note?: string | null; buyQtys?: Record<string, number> }) =>
      request<{ data: PRRow }>(
        `/api/purchase-requests/${id}/dept-approve`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/** L1 — Kho "Kiểm tồn lại" phiếu đã duyệt chưa hoàn tất / chưa có PO. */
export function useRecheckPrStock(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { addQtys?: Record<string, number> }) =>
      request<{
        data: {
          increased: boolean;
          autoFinal?: boolean;
          finalized?: boolean;
          coveredAfterFinal?: boolean;
          approvalStep: string | null;
          status: string;
        };
      }>(
        `/api/purchase-requests/${id}/recheck-stock`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/** V3.7.69 YCVT — Step 3: Giám đốc / Mua hàng duyệt. */
export function useDirectorApprovePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { note?: string | null }) =>
      request<{ data: PRRow }>(
        `/api/purchase-requests/${id}/director-approve`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/** V4.2 (TASK "Trừ tồn luôn") — pick 1 dòng PR để xuất kho + trừ tồn thật. */
export interface MarkPRIssuedPick {
  prLineId: string;
  lotSerialId: string;
  binId: string;
  qty: number;
}

export interface MarkPRIssuedInput {
  picks?: MarkPRIssuedPick[];
  /** Ghi nhận đã xuất KHÔNG trừ tồn (vật tư mua ngoài giao thẳng). */
  noStockConfirm?: boolean;
  noStockReason?: string | null;
  notes?: string | null;
  /** L8 — "Kết thúc, không xuất thêm" (đóng quy trình xuất dù còn dòng chưa đủ). */
  finish?: boolean;
  /** N2 — lý do khi kết thúc mà còn phần chưa đặt mua. */
  finishReason?: string | null;
}

export interface MarkPRIssuedResponse {
  data: PRRow;
  meta?: {
    goodsIssue?: { id: string; issueNo: string; totalQty: number } | null;
    /** true = đã xuất đủ/kết thúc; false = còn đợt sau. */
    complete?: boolean;
  };
}

/** L6 — "Tạo lại từ phiếu này" (REJECTED/CANCELLED → PR DRAFT mới). */
export interface RecreatePRResponse {
  data: PRRow;
  meta: {
    copiedLines: number;
    skippedLines: { lineNo: number; label: string }[];
    /** C2 — dòng bị bỏ vì Kho đã xuất đủ. */
    issuedFullLines?: { lineNo: number; label: string }[];
    /** C2 — dòng giảm SL vì đã xuất một phần. */
    reducedLines?: { lineNo: number; label: string; from: number; to: number }[];
    sourceCode: string;
    formType?: "MRF" | "DNVT";
  };
}

export function useRecreatePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<RecreatePRResponse>(`/api/purchase-requests/${id}/recreate`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
    },
  });
}

/**
 * V3.7.70 YCVT — Timeline IV.4: Đánh dấu "Đã xuất kho".
 * V4.2 — nay nhận `picks` (dòng PR + lô/bin) để trừ tồn thật cùng lúc, sinh
 * phiếu xuất PX. Invalidate thêm tồn kho (item/lot/warehouse) vì thao tác này
 * làm đổi tồn thật, không chỉ đổi mốc thời gian trên PR.
 */
export function useMarkPRIssued(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: MarkPRIssuedInput = {}) =>
      request<MarkPRIssuedResponse>(
        `/api/purchase-requests/${id}/mark-issued`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
      invalidateStockQueries(qc);
    },
  });
}

/** V3.7.70 YCVT — Timeline IV.5: Đánh dấu "Hoàn tất". */
export function useMarkPRCompleted(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: PRRow }>(
        `/api/purchase-requests/${id}/mark-completed`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/** N6 — Kho/admin chốt "Hoàn tất" khi sổ dòng đã đủ điều kiện mà phiếu chưa tự chốt (dữ liệu cũ). */
export function useFinalizePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}/finalize`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/**
 * V3.7.71 YCVT — Hard-delete phiếu YCVT. Admin only.
 * Option `force=true` để override khi có PO link.
 */
export function useDeletePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { force?: boolean } = {}) => {
      const qs = opts.force ? "?force=1" : "";
      return request<{ ok: true }>(`/api/purchase-requests/${id}${qs}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}
