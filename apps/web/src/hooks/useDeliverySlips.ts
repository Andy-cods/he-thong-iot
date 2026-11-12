"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** BOM V5 WP8 — phiếu giao nội bộ/NTP (API /api/bom/templates/[id]/delivery-slips, /api/delivery-slips/[id]). */

export type SlipKind = "SURFACE" | "ASSEMBLY";
export type SlipStatus = "SENT" | "PARTIAL_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface SlipLineSnapDto {
  name: string;
  dims: { l: number; w: number; h: number } | null;
  dimsText: string | null;
  surfaceTreatment: string | null;
  positionCode: string | null;
  projectCode: string | null;
  uom: string;
  recipient: { name: string; address: string | null };
}

export interface SlipLineDto {
  id: string;
  slipId: string;
  lineId: string;
  stt: number;
  fromStage: string;
  toStage: string;
  qtyDoc: string;
  qtyReceived: string;
  unitPrice: string | null;
  note: string | null;
  snap: SlipLineSnapDto;
}

export interface SlipDto {
  id: string;
  slipNo: string;
  kind: SlipKind;
  templateId: string;
  projectCode: string | null;
  supplierId: string | null;
  recipientText: string | null;
  status: SlipStatus;
  batchNo: number;
  notes: string | null;
  createdAt: string;
}

export interface SlipSummaryDto extends SlipDto {
  lineCount: number;
  totalQtyDoc: number;
  totalQtyReceived: number;
}

export interface SlipCreateInput {
  kind: SlipKind;
  supplierId?: string | null;
  notes?: string | null;
  lines: Array<{ lineId: string; qty?: number | null; unitPrice?: number | null; note?: string | null }>;
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
    };
    err.code = b.code;
    throw err;
  }
  return (await res.json()) as T;
}

export const slipExportUrl = (slipId: string) => `/api/delivery-slips/${slipId}/export`;

const listKey = (templateId: string) => ["bom", "delivery-slips", templateId] as const;

export function useDeliverySlips(templateId: string) {
  return useQuery<{ data: SlipSummaryDto[] }>({
    queryKey: listKey(templateId),
    queryFn: () => req(`/api/bom/templates/${templateId}/delivery-slips`),
  });
}

export function useDeliverySlip(slipId: string | null) {
  return useQuery<{ data: { slip: SlipDto; lines: SlipLineDto[] } }>({
    queryKey: ["bom", "delivery-slip", slipId],
    enabled: !!slipId,
    queryFn: () => req(`/api/delivery-slips/${slipId}`),
  });
}

/** Sổ bước đổi theo phiếu → làm mới bucket (key của useBomStages) + danh sách phiếu. */
function useRefresh(templateId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["bom", "stages", templateId] });
    void qc.invalidateQueries({ queryKey: ["bom", "stage-moves", templateId] });
    void qc.invalidateQueries({ queryKey: listKey(templateId) });
    void qc.invalidateQueries({ queryKey: ["bom", "delivery-slip"] });
  };
}

export function useCreateDeliverySlip(templateId: string) {
  const refresh = useRefresh(templateId);
  return useMutation({
    mutationFn: (input: SlipCreateInput) =>
      req<{ data: { slip: SlipDto; lines: SlipLineDto[] } }>(
        `/api/bom/templates/${templateId}/delivery-slips`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: refresh,
  });
}

export function useReceiveDeliverySlip(templateId: string) {
  const refresh = useRefresh(templateId);
  return useMutation({
    mutationFn: (v: { slipId: string; lines: Array<{ slipLineId: string; qty: number }> }) =>
      req<{ data: { slip: SlipDto; lines: SlipLineDto[] } }>(
        `/api/delivery-slips/${v.slipId}/receive`,
        { method: "POST", body: JSON.stringify({ lines: v.lines }) },
      ),
    onSuccess: refresh,
  });
}
