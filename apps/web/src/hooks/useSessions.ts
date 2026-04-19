"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ActiveSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  isCurrent: boolean;
}

interface RequestError extends Error {
  status?: number;
  code?: string;
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
      error?: { message?: string; code?: string };
    };
    const err = new Error(
      body.error?.message ?? `HTTP ${res.status}`,
    ) as RequestError;
    err.status = res.status;
    err.code = body.error?.code;
    throw err;
  }
  return (await res.json()) as T;
}

const KEY_MY_SESSIONS = ["admin", "sessions", "me"] as const;

export function useMySessions() {
  return useQuery({
    queryKey: KEY_MY_SESSIONS,
    queryFn: () =>
      request<{ data: ActiveSession[]; meta: { total: number } }>(
        "/api/admin/sessions/me",
      ),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: boolean }>(`/api/admin/sessions/${id}/revoke`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_MY_SESSIONS });
    },
  });
}

export function useRevokeAllOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ ok: boolean; revoked: number }>(
        "/api/admin/sessions/revoke-all-others",
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_MY_SESSIONS });
    },
  });
}
