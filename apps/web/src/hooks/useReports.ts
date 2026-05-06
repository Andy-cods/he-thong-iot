"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * V3.7.61 — Hooks cho Employee Productivity Report.
 * Spec: docs/employee-productivity-spec.md
 */

export interface ProductivityMetric {
  id: string;
  label: string;
  count: number;
  value: number | null;
  unit: string | null;
  /** V3.7.62 — KPI target nếu admin có set. */
  target?: {
    value: number;
    comparison: "gte" | "lte";
    achieved: boolean;
    achievementPct: number;
  } | null;
}

export interface EmployeeReport {
  user: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    isActive: boolean;
    roles: string[];
  };
  period: {
    from: string;
    to: string;
    label: string;
    activeDays: number;
  };
  summary: {
    totalActions: number;
    lastSeen: string | null;
    productionQty: number | null;
    poValue: number | null;
  };
  metrics: ProductivityMetric[];
  chartDaily: Array<{ date: string; actions: number }>;
  /** V3.7.62 — 6 tháng gần nhất trước period.to */
  trend6m: Array<{ month: string; label: string; actions: number }>;
  recentActions: Array<{
    timestamp: string;
    action: string;
    objectType: string | null;
    objectId: string | null;
    objectCode: string | null;
    notes: string | null;
  }>;
}

export interface DepartmentLeaderboard {
  department: { role: string; label: string; memberCount: number };
  period: { from: string; to: string; label: string };
  leaderboard: Array<{
    user: { id: string; username: string; fullName: string };
    rank: number;
    keyMetrics: Record<string, number>;
  }>;
}

interface PeriodInput {
  year?: number;
  month?: number;
  /** V3.7.62 — Quarter mode (1-4). Bỏ month nếu dùng quarter. */
  quarter?: number;
  from?: string;
  to?: string;
}

function buildQuery(period: PeriodInput): string {
  const p = new URLSearchParams();
  if (period.year) p.set("year", String(period.year));
  if (period.quarter) p.set("quarter", String(period.quarter));
  else if (period.month) p.set("month", String(period.month));
  if (period.from) p.set("from", period.from);
  if (period.to) p.set("to", period.to);
  return p.toString();
}

export function useEmployeeReport(
  userId: string | null,
  period: PeriodInput,
) {
  return useQuery<{ data: EmployeeReport }>({
    queryKey: ["reports", "employee", userId, period],
    queryFn: async () => {
      const url = `/api/reports/employee/${userId}?${buildQuery(period)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { data: EmployeeReport };
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

/** V3.7.62 — Self-view: nhân viên xem báo cáo của chính họ. */
export function useMyProductivityReport(period: PeriodInput) {
  return useQuery<{ data: EmployeeReport }>({
    queryKey: ["reports", "me", period],
    queryFn: async () => {
      const url = `/api/me/productivity?${buildQuery(period)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { data: EmployeeReport };
    },
    staleTime: 60_000,
  });
}

/* ─────────────────────────────────────────────────────────── */
/* V3.7.62 — KPI Targets CRUD (admin only)                     */
/* ─────────────────────────────────────────────────────────── */

export interface ReportTargetRow {
  id: string;
  roleCode: string | null;
  metricId: string;
  periodType: "monthly" | "quarterly" | "yearly";
  targetValue: string;
  comparison: "gte" | "lte";
  notes: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

export function useReportTargets(filter: { roleCode?: string; isActive?: boolean }) {
  const p = new URLSearchParams();
  if (filter.roleCode) p.set("roleCode", filter.roleCode);
  if (filter.isActive !== undefined) p.set("isActive", String(filter.isActive));
  return useQuery<{ data: ReportTargetRow[] }>({
    queryKey: ["reports", "targets", filter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/report-targets?${p.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { data: ReportTargetRow[] };
    },
    staleTime: 30_000,
  });
}

export function useCreateReportTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      roleCode?: string | null;
      metricId: string;
      periodType: "monthly" | "quarterly" | "yearly";
      targetValue: number;
      comparison: "gte" | "lte";
      notes?: string | null;
    }) => {
      const res = await fetch("/api/admin/report-targets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { data: ReportTargetRow };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports", "targets"] });
      qc.invalidateQueries({ queryKey: ["reports", "employee"] });
      qc.invalidateQueries({ queryKey: ["reports", "me"] });
    },
  });
}

export function useUpdateReportTarget(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      targetValue?: number;
      comparison?: "gte" | "lte";
      notes?: string | null;
      isActive?: boolean;
    }) => {
      const res = await fetch(`/api/admin/report-targets/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { data: ReportTargetRow };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports", "targets"] });
      qc.invalidateQueries({ queryKey: ["reports", "employee"] });
      qc.invalidateQueries({ queryKey: ["reports", "me"] });
    },
  });
}

export function useDeleteReportTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/report-targets/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { data: { id: string; deleted: true } };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports", "targets"] });
      qc.invalidateQueries({ queryKey: ["reports", "employee"] });
      qc.invalidateQueries({ queryKey: ["reports", "me"] });
    },
  });
}

export function useDepartmentReport(
  role: string | null,
  period: PeriodInput,
  options: { sortBy?: string } = {},
) {
  return useQuery<{ data: DepartmentLeaderboard }>({
    queryKey: ["reports", "department", role, period, options.sortBy],
    queryFn: async () => {
      const p = new URLSearchParams(buildQuery(period));
      if (role) p.set("role", role);
      if (options.sortBy) p.set("sortBy", options.sortBy);
      const res = await fetch(`/api/reports/department?${p.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { data: DepartmentLeaderboard };
    },
    enabled: !!role,
    staleTime: 60_000,
  });
}
