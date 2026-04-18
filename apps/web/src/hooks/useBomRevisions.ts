"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  BomRevisionStatus,
  ReleaseRevisionInput,
  SupersedeRevisionInput,
} from "@iot/shared";
import { qk } from "@/lib/query-keys";

/**
 * BOM Revision hooks — V1.2 Phase B2.
 *
 * - useBomRevisions(templateId): list revisions.
 * - useReleaseRevision(templateId): mutation → invalidate list + detail +
 *   auto-promote template (server đã set ACTIVE, client chỉ refetch).
 * - useSupersedeRevision(revisionId): mutation admin only.
 */

export interface BomRevisionRow {
  id: string;
  templateId: string;
  revisionNo: string;
  status: BomRevisionStatus;
  frozenSnapshot: unknown;
  releasedAt: string | null;
  releasedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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

export function useBomRevisions(templateId: string | null) {
  return useQuery({
    queryKey: templateId
      ? qk.bom.revisions.list(templateId)
      : ["bom", "revisions", "list", "__none__"],
    queryFn: () =>
      request<{ data: BomRevisionRow[] }>(
        `/api/bom/templates/${templateId}/revisions`,
      ),
    enabled: !!templateId,
    staleTime: 30_000,
  });
}

export function useBomRevision(id: string | null) {
  return useQuery({
    queryKey: id
      ? qk.bom.revisions.detail(id)
      : ["bom", "revisions", "detail", "__none__"],
    queryFn: () =>
      request<{ data: BomRevisionRow }>(`/api/bom/revisions/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useReleaseRevision(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReleaseRevisionInput) =>
      request<{ data: BomRevisionRow }>(
        `/api/bom/templates/${templateId}/revisions`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      // Refetch revisions list + template detail (status có thể → ACTIVE)
      qc.invalidateQueries({ queryKey: qk.bom.revisions.list(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.detail(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.tree(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.all });
    },
  });
}

export function useSupersedeRevision(revisionId: string, templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SupersedeRevisionInput) =>
      request<{ data: BomRevisionRow }>(
        `/api/bom/revisions/${revisionId}/supersede`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bom.revisions.detail(revisionId) });
      qc.invalidateQueries({ queryKey: qk.bom.revisions.list(templateId) });
    },
  });
}
