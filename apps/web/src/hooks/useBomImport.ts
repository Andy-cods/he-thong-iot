"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { BomImportCommit } from "@iot/shared";
import { qk } from "@/lib/query-keys";

/**
 * BOM Import hooks — theo pattern useImports.ts.
 * Flow: upload → preview_ready → commit → committing → (worker) → done/failed.
 * Status polling 2s khi status = committing | parsing.
 */

export interface BomImportSheet {
  sheetName: string;
  rowCount: number;
  headerRow: number;
  headersDetected: string[];
  topTitle: string | null;
  previewRows: unknown[][];
  headerWarning?: string | null;
  headerScanInfo?: {
    scannedRows: Array<{ rowNumber: number; nonEmpty: number; matches: number }>;
  };
}

export interface BomUploadResult {
  batchId: string;
  reused: boolean;
  status: string;
  fileHash?: string;
  sheets: BomImportSheet[];
  autoMappings: Record<string, Record<string, string | null>>;
  duplicateMode: string;
}

export interface BomImportStatus {
  batchId: string;
  status: string;
  rowTotal: number;
  rowSuccess: number;
  rowFail: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
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

export function useUploadBomImport() {
  return useMutation({
    mutationFn: async (input: {
      file: File;
      duplicateMode: "skip" | "upsert" | "error";
    }): Promise<BomUploadResult> => {
      const fd = new FormData();
      fd.append("file", input.file);
      fd.append("duplicateMode", input.duplicateMode);
      const res = await fetch("/api/bom/imports/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: BomUploadResult };
      return json.data;
    },
  });
}

export function useBomImportStatus(batchId: string | null) {
  return useQuery({
    queryKey: batchId
      ? qk.bom.import.status(batchId)
      : ["bom", "import", "status", "__none__"],
    queryFn: async () => {
      const res = await apiFetch<BomImportStatus>(
        `/api/bom/imports/${batchId}/status`,
      );
      return res.data;
    },
    enabled: !!batchId,
    refetchInterval: (q) => {
      const data = q.state.data as BomImportStatus | undefined;
      if (!data) return false;
      if (data.status === "committing" || data.status === "parsing") {
        return 2000;
      }
      return false;
    },
    placeholderData: keepPreviousData,
  });
}

export function useCommitBomImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      batchId: string;
      body: BomImportCommit;
    }) => {
      const res = await apiFetch<{ batchId: string; status: string }>(
        `/api/bom/imports/${input.batchId}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input.body),
        },
      );
      return res.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.bom.import.status(vars.batchId) });
      qc.invalidateQueries({ queryKey: qk.bom.all });
    },
  });
}

export function downloadBomImportErrorsUrl(batchId: string) {
  return `/api/bom/imports/${batchId}/errors`;
}
