"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  BomSheetCreate,
  BomSheetKind,
  BomSheetUpdate,
} from "@iot/shared";

/**
 * V2.0 Sprint 6 — hooks bom_sheet CRUD.
 * Mutations tự invalidate sheets list + bom detail.
 */

export interface BomSheetRow {
  id: string;
  templateId: string;
  name: string;
  kind: BomSheetKind;
  position: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
}

const sheetsKey = (templateId: string) =>
  ["bom", "templates", templateId, "sheets"] as const;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
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
    const err = new Error(body.error?.message ?? `HTTP ${res.status}`);
    (err as { code?: string }).code = body.error?.code;
    (err as { details?: unknown }).details = body.error?.details;
    throw err;
  }
  return (await res.json()) as T;
}

export function useBomSheetsList(templateId: string | null) {
  return useQuery({
    queryKey: templateId
      ? sheetsKey(templateId)
      : (["bom", "templates", "__none__", "sheets"] as const),
    queryFn: () =>
      apiFetch<{ data: BomSheetRow[] }>(
        `/api/bom/templates/${templateId}/sheets`,
      ),
    enabled: !!templateId,
    placeholderData: keepPreviousData,
  });
}

export function useCreateBomSheet(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BomSheetCreate) =>
      apiFetch<{ data: BomSheetRow }>(
        `/api/bom/templates/${templateId}/sheets`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sheetsKey(templateId) });
    },
  });
}

export function useUpdateBomSheet(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sheetId: string; patch: BomSheetUpdate }) =>
      apiFetch<{ data: BomSheetRow }>(
        `/api/bom/templates/${templateId}/sheets/${input.sheetId}`,
        {
          method: "PATCH",
          body: JSON.stringify(input.patch),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sheetsKey(templateId) });
    },
  });
}

/**
 * TASK-20260427-021 — Delete BOM sheet với force confirm 2 bước.
 *
 * Lần 1: gọi không kèm `force` → API trả 409 SHEET_HAS_ROWS với count nếu
 * sheet còn data → UI hỏi user confirm.
 * Lần 2: gọi với `force=true` → bỏ qua check, cascade xoá data.
 *
 * Lỗi LAST_SHEET / LAST_PROJECT_SHEET → throw để UI toast.
 */
export function useDeleteBomSheet(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { sheetId: string; force?: boolean }) => {
      const url = `/api/bom/templates/${templateId}/sheets/${input.sheetId}${
        input.force ? "?force=true" : ""
      }`;
      return apiFetch<{
        data: BomSheetRow & {
          deletedRowCounts?: {
            lineCount: number;
            materialCount: number;
            processCount: number;
            total: number;
          };
        };
      }>(url, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sheetsKey(templateId) });
    },
  });
}
