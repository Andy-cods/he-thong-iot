"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * V4.1 Đợt 1a — hooks màn "Chờ QC nhập kho".
 *   - useQcPendingCount: badge (poll 60s).
 *   - useQcPendingList: danh sách dòng phiếu nhập Chờ kiểm / Không đạt.
 *   - useDecideQc: kết luận Đạt / Không đạt 1 dòng.
 */

export type QcFilter = "PENDING" | "FAIL" | "ALL";

export interface QcPendingRow {
  lineId: string;
  receiptId: string;
  receiptNo: string;
  receivedAt: string;
  receivedByUsername: string | null;
  poId: string | null;
  poNo: string | null;
  supplierName: string | null;
  itemId: string;
  sku: string;
  itemName: string;
  uom: string;
  receivedQty: number;
  lotSerialId: string | null;
  lotCode: string | null;
  lotStatus: string | null;
  holdCode: string | null;
  binCode: string | null;
  qcStatus: "PENDING" | "PASS" | "FAIL";
  qcNotes: string | null;
  qcCheckedAt: string | null;
  qcCheckedByUsername: string | null;
}

export interface QcCounts {
  pending: number;
  failed: number;
}

const QK = {
  all: ["qc-inbound"] as const,
  count: ["qc-inbound", "count"] as const,
  list: (filter: QcFilter, q: string) => ["qc-inbound", "list", filter, q] as const,
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return body;
}

export function useQcPendingCount(enabled = true) {
  return useQuery({
    queryKey: QK.count,
    queryFn: async () =>
      (await getJson<{ data: QcCounts }>("/api/receiving/qc-pending?countOnly=1"))
        .data,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useQcPendingList(filter: QcFilter, q: string) {
  return useQuery({
    queryKey: QK.list(filter, q),
    queryFn: async () => {
      const params = new URLSearchParams({ status: filter });
      if (q.trim()) params.set("q", q.trim());
      return getJson<{ data: QcPendingRow[]; meta: QcCounts }>(
        `/api/receiving/qc-pending?${params.toString()}`,
      );
    },
    staleTime: 10_000,
  });
}

export function useDecideQc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lineId: string;
      result: "PASS" | "FAIL";
      notes?: string | null;
    }) => {
      const res = await fetch(`/api/receiving/receipt-lines/${input.lineId}/qc`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: input.result, notes: input.notes ?? null }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { sku: string; lotCode: string | null; result: "PASS" | "FAIL" };
        error?: { message?: string };
      };
      if (!res.ok || !body.data) {
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return body.data;
    },
    onSuccess: (d) => {
      toast.success(
        d.result === "PASS"
          ? `QC Đạt ${d.sku}${d.lotCode ? ` · lô ${d.lotCode}` : ""} — hàng đã sẵn sàng xuất.`
          : `Đã ghi QC Không đạt ${d.sku} — lô bị giữ, đã báo Kho + Thu mua.`,
      );
      void qc.invalidateQueries({ queryKey: QK.all });
      // Tồn khả dụng đổi → làm mới các màn kho / vật tư.
      void qc.invalidateQueries({ queryKey: ["warehouse"] });
      void qc.invalidateQueries({ queryKey: ["inventory-summary"] });
      void qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err) => {
      toast.error((err as Error).message || "Không ghi được kết luận QC.");
    },
  });
}
