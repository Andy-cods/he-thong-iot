"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FinAccountCreate,
  FinAccountUpdate,
  FinCategoryCreate,
  FinCategoryUpdate,
  FinInvoiceCreate,
  FinInvoiceUpdate,
  FinPaymentCreate,
  FinTransactionCreate,
  FinTransactionUpdate,
} from "@iot/shared";
import {
  qk,
  type FinAccountFilter,
  type FinCashflowFilter,
  type FinCategoryFilter,
  type FinInvoiceFilter,
  type FinPaymentFilter,
  type FinTransactionFilter,
} from "@/lib/query-keys";

/**
 * React Query hooks cho phân hệ Tài chính V4 — bám pattern `usePurchaseOrders.ts`.
 * API đã có sẵn từ Phase B (KHÔNG sửa) — file này CHỈ là lớp fetch + cache.
 */

// ── Types (khớp response repo, xem apps/web/src/server/repos/fin*.ts) ──────

export interface FinAccountRow {
  id: string;
  code: string;
  name: string;
  type: "BANK" | "CASH";
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: string;
  openingBalanceDate: string | null;
  currentBalance: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface FinCategoryRow {
  id: string;
  code: string;
  name: string;
  direction: "IN" | "OUT";
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
}

export type FinTransactionStatus = "DRAFT" | "POSTED" | "VOID";

export interface FinTransactionRow {
  id: string;
  code: string;
  direction: "IN" | "OUT";
  accountId: string;
  categoryId: string | null;
  amount: string;
  transactionDate: string;
  description: string | null;
  counterpartyType: "SUPPLIER" | "CUSTOMER" | "EMPLOYEE" | "OTHER" | null;
  supplierId: string | null;
  purchaseOrderId: string | null;
  salesOrderId: string | null;
  invoiceId: string | null;
  paymentId: string | null;
  attachmentUrl: string | null;
  externalRef: string | null;
  status: FinTransactionStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export type FinInvoiceStatus = "DRAFT" | "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE" | "CANCELLED";

export interface FinInvoiceRow {
  id: string;
  invoiceNo: string;
  direction: "IN" | "OUT";
  supplierId: string | null;
  purchaseOrderId: string | null;
  salesOrderId: string | null;
  issueDate: string;
  dueDate: string | null;
  subtotalAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  paidAmount: string;
  status: FinInvoiceStatus;
  notes: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface FinPaymentAllocationRow {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  createdAt: string;
}

export interface FinPaymentRow {
  id: string;
  code: string;
  direction: "IN" | "OUT";
  accountId: string;
  supplierId: string | null;
  paymentDate: string;
  totalAmount: string;
  method: "BANK_TRANSFER" | "CASH" | "CHECK" | "OTHER";
  referenceNo: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
}

interface RequestError extends Error {
  status?: number;
  code?: string;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(body.error?.message ?? `HTTP ${res.status}`) as RequestError;
    err.status = res.status;
    err.code = body.error?.code;
    throw err;
  }
  return (await res.json()) as T;
}

function toParams(obj: object): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) p.append(k, String(item));
    } else {
      p.set(k, String(v));
    }
  }
  return p;
}

/* ══════════════════════════ Accounts ══════════════════════════ */

export function useFinAccountsList(filter: FinAccountFilter = {}) {
  return useQuery({
    queryKey: qk.finance.accounts.list(filter),
    queryFn: () =>
      request<{ data: FinAccountRow[]; meta: ListMeta }>(
        `/api/finance/accounts?${toParams({ ...filter, page: filter.page ?? 1, pageSize: filter.pageSize ?? 200 }).toString()}`,
      ),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreateFinAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinAccountCreate) =>
      request<{ data: FinAccountRow }>("/api/finance/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.accounts.all });
      qc.invalidateQueries({ queryKey: qk.finance.dashboardSummary });
    },
  });
}

export function useUpdateFinAccount(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinAccountUpdate) =>
      request<{ data: FinAccountRow }>(`/api/finance/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.accounts.all });
    },
  });
}

export function useDeactivateFinAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: { id: string; isActive: boolean } }>(`/api/finance/accounts/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.accounts.all });
      qc.invalidateQueries({ queryKey: qk.finance.dashboardSummary });
    },
  });
}

/* ══════════════════════════ Categories ══════════════════════════ */

export function useFinCategoriesList(filter: FinCategoryFilter = {}) {
  return useQuery({
    queryKey: qk.finance.categories.list(filter),
    queryFn: () =>
      request<{ data: FinCategoryRow[] }>(`/api/finance/categories?${toParams(filter).toString()}`),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreateFinCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinCategoryCreate) =>
      request<{ data: FinCategoryRow }>("/api/finance/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.finance.categories.all }),
  });
}

export function useUpdateFinCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinCategoryUpdate) =>
      request<{ data: FinCategoryRow }>(`/api/finance/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.finance.categories.all }),
  });
}

/* ══════════════════════════ Transactions ══════════════════════════ */

export function useFinTransactionsList(filter: FinTransactionFilter) {
  return useQuery({
    queryKey: qk.finance.transactions.list(filter),
    queryFn: () =>
      request<{ data: FinTransactionRow[]; meta: ListMeta }>(
        `/api/finance/transactions?${toParams(filter).toString()}`,
      ),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useCreateFinTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinTransactionCreate) =>
      request<{ data: FinTransactionRow }>("/api/finance/transactions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.transactions.all });
      qc.invalidateQueries({ queryKey: qk.finance.accounts.all });
      qc.invalidateQueries({ queryKey: qk.finance.dashboardSummary });
      qc.invalidateQueries({ queryKey: qk.finance.all });
    },
  });
}

export function useUpdateFinTransaction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinTransactionUpdate) =>
      request<{ data: FinTransactionRow }>(`/api/finance/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.finance.transactions.all }),
  });
}

export function useVoidFinTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: FinTransactionRow }>(`/api/finance/transactions/${id}/void`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.transactions.all });
      qc.invalidateQueries({ queryKey: qk.finance.accounts.all });
      qc.invalidateQueries({ queryKey: qk.finance.dashboardSummary });
      qc.invalidateQueries({ queryKey: qk.finance.all });
    },
  });
}

/* ══════════════════════════ Invoices ══════════════════════════ */

export function useFinInvoicesList(filter: FinInvoiceFilter) {
  return useQuery({
    queryKey: qk.finance.invoices.list(filter),
    queryFn: () =>
      request<{ data: FinInvoiceRow[]; meta: ListMeta }>(
        `/api/finance/invoices?${toParams(filter).toString()}`,
      ),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export interface FinInvoiceDetail extends FinInvoiceRow {
  allocations: Array<FinPaymentAllocationRow & { payment: FinPaymentRow | null }>;
}

export function useFinInvoiceDetail(id: string | null) {
  return useQuery({
    queryKey: id ? qk.finance.invoices.detail(id) : ["finance", "invoices", "detail", "__none__"],
    queryFn: () => request<{ data: FinInvoiceDetail }>(`/api/finance/invoices/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useCreateFinInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinInvoiceCreate) =>
      request<{ data: FinInvoiceRow }>("/api/finance/invoices", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.invoices.all });
      qc.invalidateQueries({ queryKey: qk.finance.receivablesAging });
    },
  });
}

export function useUpdateFinInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinInvoiceUpdate) =>
      request<{ data: FinInvoiceRow }>(`/api/finance/invoices/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.invoices.all });
      qc.invalidateQueries({ queryKey: qk.finance.invoices.detail(id) });
    },
  });
}

export function useCancelFinInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: FinInvoiceRow }>(`/api/finance/invoices/${id}/cancel`, {
        method: "POST",
      }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: qk.finance.invoices.all });
      qc.invalidateQueries({ queryKey: qk.finance.invoices.detail(id) });
      qc.invalidateQueries({ queryKey: qk.finance.receivablesAging });
    },
  });
}

/* ══════════════════════════ Payments ══════════════════════════ */

export function useFinPaymentsList(filter: FinPaymentFilter) {
  return useQuery({
    queryKey: qk.finance.payments.list(filter),
    queryFn: () =>
      request<{ data: FinPaymentRow[]; meta: ListMeta }>(
        `/api/finance/payments?${toParams(filter).toString()}`,
      ),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export interface FinPaymentDetail extends FinPaymentRow {
  allocations: FinPaymentAllocationRow[];
}

export function useFinPaymentDetail(id: string | null) {
  return useQuery({
    queryKey: id ? qk.finance.payments.detail(id) : ["finance", "payments", "detail", "__none__"],
    queryFn: () => request<{ data: FinPaymentDetail }>(`/api/finance/payments/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useCreateFinPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FinPaymentCreate) =>
      request<{ data: { payment: FinPaymentRow; allocations: FinPaymentAllocationRow[] } }>(
        "/api/finance/payments",
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.payments.all });
      qc.invalidateQueries({ queryKey: qk.finance.invoices.all });
      qc.invalidateQueries({ queryKey: qk.finance.transactions.all });
      qc.invalidateQueries({ queryKey: qk.finance.accounts.all });
      qc.invalidateQueries({ queryKey: qk.finance.receivablesAging });
      qc.invalidateQueries({ queryKey: qk.finance.dashboardSummary });
      qc.invalidateQueries({ queryKey: qk.finance.all });
    },
  });
}

export function useVoidFinPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: { paymentId: string; voidedInvoiceIds: string[] } }>(
        `/api/finance/payments/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.finance.payments.all });
      qc.invalidateQueries({ queryKey: qk.finance.invoices.all });
      qc.invalidateQueries({ queryKey: qk.finance.transactions.all });
      qc.invalidateQueries({ queryKey: qk.finance.accounts.all });
      qc.invalidateQueries({ queryKey: qk.finance.receivablesAging });
      qc.invalidateQueries({ queryKey: qk.finance.dashboardSummary });
    },
  });
}

/* ══════════════════════════ Reports / Dashboard ══════════════════════════ */

export interface AgingBucket {
  bucket: "CURRENT" | "1-30" | "31-60" | "61-90" | "90+";
  invoiceCount: number;
  outstandingAmount: number;
}

export function useReceivablesAging() {
  return useQuery({
    queryKey: qk.finance.receivablesAging,
    queryFn: () => request<{ data: { buckets: AgingBucket[] } }>("/api/finance/receivables/aging"),
    staleTime: 30_000,
  });
}

export interface CashflowPoint {
  date: string;
  in: number;
  out: number;
  net: number;
}

export interface CashflowResponse {
  series: CashflowPoint[];
  summary: { totalIn: number; totalOut: number; netCashflow: number };
  growth?: { inPct: number; outPct: number; vsLabel: string };
}

export function useFinCashflow(filter: FinCashflowFilter) {
  return useQuery({
    queryKey: qk.finance.dashboardCashflow(filter),
    queryFn: () =>
      request<{ data: CashflowResponse }>(
        `/api/finance/dashboard/cashflow?${toParams(filter).toString()}`,
      ),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export interface FinSummaryResponse {
  totalIn: number;
  totalOut: number;
  netCashflow: number;
  totalBalance: number;
  period: { from: string; to: string };
}

export function useFinSummary() {
  return useQuery({
    queryKey: qk.finance.dashboardSummary,
    queryFn: () => request<{ data: FinSummaryResponse }>("/api/finance/dashboard/summary"),
    staleTime: 30_000,
  });
}
