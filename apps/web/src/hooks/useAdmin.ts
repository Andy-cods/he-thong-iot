"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role, UserCreate, UserUpdate } from "@iot/shared";
import { qk, type AuditFilter, type UserFilter } from "@/lib/query-keys";

/**
 * Admin TanStack Query hooks — Phase B2.1.
 * Reuse pattern useBom.ts / useItems.ts.
 */

export interface ListResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface AdminUserListRow {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Role[];
}

export interface AdminUserDetail extends AdminUserListRow {
  updatedAt: string;
}

export interface AuditRow {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  occurredAt: string;
  requestId: string | null;
  ipAddress: string | null;
  notes: string | null;
  beforeJson: unknown;
  afterJson: unknown;
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

function buildUserListUrl(f: UserFilter): string {
  const p = new URLSearchParams();
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  if (f.role) p.set("role", f.role);
  if (f.isActive !== undefined) p.set("isActive", String(f.isActive));
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  return `/api/admin/users?${p.toString()}`;
}

export function useUsersList(filter: UserFilter) {
  return useQuery({
    queryKey: qk.admin.users.list(filter),
    queryFn: () =>
      request<ListResponse<AdminUserListRow>>(buildUserListUrl(filter)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useUserDetail(id: string | null) {
  return useQuery({
    queryKey: id ? qk.admin.users.detail(id) : ["admin", "users", "detail", "__none__"],
    queryFn: () => request<{ data: AdminUserDetail }>(`/api/admin/users/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UserCreate) =>
      request<{ data: { id: string; username: string } }>(
        `/api/admin/users`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin.users.all });
      qc.invalidateQueries({ queryKey: qk.admin.audit.all });
    },
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserUpdate) =>
      request<{ data: AdminUserDetail }>(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.admin.users.detail(id) });
      const prev = qc.getQueryData<{ data: AdminUserDetail }>(
        qk.admin.users.detail(id),
      );
      if (prev?.data) {
        qc.setQueryData<{ data: AdminUserDetail }>(qk.admin.users.detail(id), {
          data: {
            ...prev.data,
            fullName: patch.fullName ?? prev.data.fullName,
            email: patch.email === undefined ? prev.data.email : patch.email,
            isActive:
              typeof patch.isActive === "boolean"
                ? patch.isActive
                : prev.data.isActive,
            roles: patch.roles ?? prev.data.roles,
          },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(qk.admin.users.detail(id), ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.admin.users.all });
      qc.invalidateQueries({ queryKey: qk.admin.audit.all });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: AdminUserDetail }>(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin.users.all });
      qc.invalidateQueries({ queryKey: qk.admin.audit.all });
    },
  });
}

function buildAuditListUrl(f: AuditFilter): string {
  const p = new URLSearchParams();
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  if (f.actorUsername) p.set("actorUsername", f.actorUsername);
  if (f.userId) p.set("userId", f.userId);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  for (const e of f.entity ?? []) p.append("entity", e);
  for (const a of f.action ?? []) p.append("action", a);
  return `/api/admin/audit?${p.toString()}`;
}

export function useAuditList(filter: AuditFilter) {
  return useQuery({
    queryKey: qk.admin.audit.list(filter),
    queryFn: () => request<ListResponse<AuditRow>>(buildAuditListUrl(filter)),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

/**
 * V1.8-batch5 — aggregate stats cho `/admin` landing dashboard.
 */
export interface AdminStatsPayload {
  users: { active: number; total: number };
  sessions: { last24h: number; activeNow: number };
  audit: {
    total24h: number;
    byAction: Array<{ action: string; count: number }>;
  };
  rateLimits: { hits24h: number };
  recentAuditEvents: Array<{
    id: string;
    at: string;
    actorUsername: string | null;
    action: string;
    entity: string;
    objectId: string | null;
  }>;
  recentActiveSessions: Array<{
    id: string;
    userId: string;
    username: string | null;
    fullName: string | null;
    ip: string | null;
    userAgent: string | null;
    issuedAt: string;
    lastSeenAt: string | null;
  }>;
  systemHealth: {
    db: "ok" | "slow" | "down";
    redis: "ok" | "down";
    queueDepth: number;
    lastBackup: string | null;
  };
  cachedAt: string;
}

export function useAdminStats() {
  return useQuery({
    queryKey: qk.admin.stats,
    queryFn: () =>
      request<{ data: AdminStatsPayload; cached: boolean }>(
        `/api/admin/stats`,
      ),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
