"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BomCategory } from "@iot/shared";
import type { StageBuckets } from "@/lib/bom-stage-ledger";
import { bomPollMs } from "@/lib/bom-live";

/** BOM V5 WP6 — sổ bước: bucket theo dòng, lịch sử, chuyển/đảo. */

export interface LineStagesDto {
  category: BomCategory;
  required: number;
  buckets: StageBuckets;
}

export interface BomStagesData {
  lines: Record<string, LineStagesDto>;
  categories: Record<string, Array<{ code: string; label: string }>>;
}

export interface StageMoveRow {
  id: number;
  fromStage: string | null;
  toStage: string;
  qty: string;
  docType: string;
  docId: string | null;
  note: string | null;
  actorName: string | null;
  at: string;
  reversesId: number | null;
  reversedById: number | null;
}

export interface StageMoveItem {
  lineId: string;
  from: string;
  to: string;
  qty: number;
  note?: string | null;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as {
      message?: string;
      code?: string;
      error?: { message?: string };
    };
    const err = new Error(b.message ?? b.error?.message ?? `HTTP ${res.status}`) as Error & {
      code?: string;
      status?: number;
    };
    err.code = b.code;
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

const stagesKey = (templateId: string) => ["bom", "stages", templateId] as const;
const movesKey = (templateId: string, lineId: string | null) =>
  ["bom", "stage-moves", templateId, lineId] as const;

export function useBomStages(templateId: string) {
  return useQuery<{ data: BomStagesData }>({
    queryKey: stagesKey(templateId),
    staleTime: 30_000,
    refetchInterval: bomPollMs,
    queryFn: () => req(`/api/bom/templates/${templateId}/stages`),
  });
}

export function useLineStageMoves(templateId: string, lineId: string | null, enabled = true) {
  return useQuery<{ data: StageMoveRow[] }>({
    queryKey: movesKey(templateId, lineId),
    enabled: enabled && !!lineId,
    queryFn: () => req(`/api/bom/templates/${templateId}/lines/${lineId}/stage-moves`),
  });
}

function useInvalidateStages(templateId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: stagesKey(templateId) });
    void qc.invalidateQueries({ queryKey: ["bom", "stage-moves", templateId] });
  };
}

export function useMoveStages(templateId: string) {
  const invalidate = useInvalidateStages(templateId);
  return useMutation({
    mutationFn: (items: StageMoveItem[]) =>
      req<{ data: unknown }>(`/api/bom/templates/${templateId}/stage-moves`, {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
    onSuccess: invalidate,
  });
}

export function useReverseStageMove(templateId: string) {
  const invalidate = useInvalidateStages(templateId);
  return useMutation({
    mutationFn: (moveId: number) =>
      req<{ data: unknown }>(`/api/bom/templates/${templateId}/stage-moves/${moveId}/reverse`, {
        method: "POST",
      }),
    onSuccess: invalidate,
  });
}
