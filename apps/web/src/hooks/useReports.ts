"use client";

import { useQuery } from "@tanstack/react-query";

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
  from?: string;
  to?: string;
}

function buildQuery(period: PeriodInput): string {
  const p = new URLSearchParams();
  if (period.year) p.set("year", String(period.year));
  if (period.month) p.set("month", String(period.month));
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
