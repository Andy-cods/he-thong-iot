"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";

/**
 * V1.3 Phase B4 — ECO (Engineering Change Order) hooks.
 */

export type EcoStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "APPLIED"
  | "REJECTED";

export type EcoLineAction =
  | "ADD_LINE"
  | "REMOVE_LINE"
  | "UPDATE_QTY"
  | "UPDATE_SCRAP"
  | "REPLACE_COMPONENT";

export interface EcoRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: EcoStatus;
  affectedTemplateId: string;
  oldRevisionId: string | null;
  newRevisionId: string | null;
  templateCode: string | null;
  affectedOrdersCount: number;
  applyProgress: number;
  applyJobId: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  appliedAt: string | null;
  rejectedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EcoLineRow {
  id: string;
  ecoId: string;
  action: EcoLineAction;
  targetLineId: string | null;
  componentItemId: string | null;
  qtyPerParent: string | null;
  scrapPercent: string | null;
  description: string | null;
  position: number;
}

export interface EcoDetail extends EcoRow {
  lines: EcoLineRow[];
}

export interface EcoListFilter {
  q?: string;
  status?: EcoStatus[];
  /** V1.6 — filter theo BOM template (FK direct: eco_change.affected_template_id). */
  bomTemplateId?: string;
  page?: number;
  pageSize?: number;
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
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

const ecoKeys = {
  all: ["eco"] as const,
  list: (f: EcoListFilter) => ["eco", "list", f] as const,
  detail: (code: string) => ["eco", "detail", code] as const,
  affected: (code: string) => ["eco", "affected", code] as const,
};

export function useEcoList(filter: EcoListFilter) {
  const p = new URLSearchParams();
  if (filter.q) p.set("q", filter.q);
  if (filter.bomTemplateId) p.set("bomTemplateId", filter.bomTemplateId);
  if (filter.page) p.set("page", String(filter.page));
  if (filter.pageSize) p.set("pageSize", String(filter.pageSize));
  for (const s of filter.status ?? []) p.append("status", s);
  return useQuery({
    queryKey: ecoKeys.list(filter),
    queryFn: () =>
      request<{
        data: EcoRow[];
        meta: { page: number; pageSize: number; total: number };
      }>(`/api/eco?${p.toString()}`),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useEcoDetail(code: string | null) {
  return useQuery({
    queryKey: code ? ecoKeys.detail(code) : (["eco", "detail", "__none__"] as const),
    queryFn: () => request<{ data: EcoDetail }>(`/api/eco/${code}`),
    enabled: !!code,
    staleTime: 5_000,
  });
}

export function useEcoAffectedOrders(code: string | null) {
  return useQuery({
    queryKey: code ? ecoKeys.affected(code) : (["eco", "affected", "__none__"] as const),
    queryFn: () =>
      request<{
        data: Array<{
          id: string;
          orderNo: string;
          customerName: string | null;
          status: string;
        }>;
        meta: { total: number };
      }>(`/api/eco/${code}/affected-orders`),
    enabled: !!code,
  });
}

export interface CreateEcoInput {
  title: string;
  description?: string | null;
  affectedTemplateId: string;
  oldRevisionId?: string | null;
  lines: Array<{
    action: EcoLineAction;
    targetLineId?: string | null;
    componentItemId?: string | null;
    qtyPerParent?: number | null;
    scrapPercent?: number | null;
    description?: string | null;
  }>;
}

export function useCreateEco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEcoInput) =>
      request<{ data: EcoRow }>(`/api/eco`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ecoKeys.all });
    },
  });
}

export function useUpdateEco(code: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateEcoInput>) =>
      request<{ data: EcoRow }>(`/api/eco/${code}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ecoKeys.all });
    },
  });
}

function makeTransitionHook(endpoint: string) {
  return function useEcoTransition(code: string) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (payload?: Record<string, unknown>) =>
        request<{ data: EcoRow }>(`/api/eco/${code}/${endpoint}`, {
          method: "POST",
          body: JSON.stringify(payload ?? {}),
        }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ecoKeys.all });
        qc.invalidateQueries({ queryKey: qk.snapshots.all });
        qc.invalidateQueries({ queryKey: qk.orders.all });
        qc.invalidateQueries({ queryKey: qk.bom.all });
      },
    });
  };
}

export const useSubmitEco = makeTransitionHook("submit");
export const useApproveEco = makeTransitionHook("approve");
export const useRejectEco = makeTransitionHook("reject");
export const useApplyEco = makeTransitionHook("apply");

export const STATUS_LABEL: Record<EcoStatus, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  APPLIED: "Đã áp dụng",
  REJECTED: "Từ chối",
};

export const STATUS_VARIANTS: Record<
  EcoStatus,
  "default" | "outline" | "neutral" | "info" | "warning" | "success" | "danger"
> = {
  DRAFT: "outline",
  SUBMITTED: "info",
  APPROVED: "warning",
  APPLIED: "success",
  REJECTED: "danger",
};

export const ACTION_LABEL: Record<EcoLineAction, string> = {
  ADD_LINE: "Thêm dòng",
  REMOVE_LINE: "Xoá dòng",
  UPDATE_QTY: "Đổi qty",
  UPDATE_SCRAP: "Đổi scrap %",
  REPLACE_COMPONENT: "Thay component",
};
