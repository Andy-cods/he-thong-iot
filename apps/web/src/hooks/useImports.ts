"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import type { ImportDuplicateMode, ImportStatus } from "@iot/shared";

export interface ImportBatchStatus {
  id: string;
  kind: "item" | "bom";
  status: ImportStatus;
  duplicateMode: ImportDuplicateMode;
  fileName: string;
  fileSizeBytes: number;
  rowTotal: number;
  rowSuccess: number;
  rowFail: number;
  preview: { rows: unknown[]; validCount: number; errorCount: number } | null;
  errorCount: number;
  errorMessage: string | null;
  errorFileUrl: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface UploadResult {
  batchId: string;
  reused: boolean;
  status: ImportStatus;
  fileHash?: string;
  rowTotal: number;
  rowSuccess: number;
  rowFail: number;
  previewRows?: unknown[];
  errors?: Array<{
    rowNumber: number;
    field: string;
    reason: string;
    rawValue?: unknown;
  }>;
}

async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T }> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as { data: T };
}

export function useUploadItemImport() {
  return useMutation({
    mutationFn: async (input: {
      file: File;
      duplicateMode: ImportDuplicateMode;
    }) => {
      const fd = new FormData();
      fd.append("file", input.file);
      fd.append("duplicateMode", input.duplicateMode);
      const res = await fetch("/api/imports/items", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string; details?: unknown };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: UploadResult };
      return json.data;
    },
  });
}

export function useImportBatch(id: string | null, pollMs: number = 0) {
  return useQuery({
    queryKey: ["import", id],
    queryFn: async () => {
      const res = await apiFetch<ImportBatchStatus>(`/api/imports/${id}`);
      return res.data;
    },
    enabled: !!id,
    refetchInterval: (q) => {
      const data = q.state.data as ImportBatchStatus | undefined;
      if (!data) return pollMs || false;
      if (data.status === "committing" || data.status === "parsing") {
        return 2000;
      }
      return false;
    },
    placeholderData: keepPreviousData,
  });
}

export function useCommitImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      batchId: string;
      duplicateMode: ImportDuplicateMode;
    }) => {
      const res = await apiFetch<{ batchId: string; status: string }>(
        `/api/imports/${input.batchId}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duplicateMode: input.duplicateMode }),
        },
      );
      return res.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["import", vars.batchId] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function downloadTemplateUrl() {
  return "/api/imports/template?kind=item";
}

export function downloadErrorsUrl(batchId: string) {
  return `/api/imports/${batchId}/errors`;
}
