"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";

/**
 * Direction B — useHealth.
 *
 * Fetch `/api/health` với staleTime 30s + auto-refresh mỗi 30s (không refresh
 * khi tab inactive). Trả thêm `latencyMs` client-side để UI hiển thị tốc độ
 * phản hồi.
 */
export interface HealthPayload {
  ok: boolean;
  app: string;
  ts: string;
}

interface HealthResult {
  data: HealthPayload | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  latencyMs: number | null;
  dataUpdatedAt: number;
  refetch: () => void;
}

export function useHealth(): HealthResult {
  const [latencyMs, setLatencyMs] = React.useState<number | null>(null);

  const query = useQuery<HealthPayload, Error>({
    queryKey: ["health"],
    queryFn: async () => {
      const started = performance.now();
      const res = await fetch("/api/health", { cache: "no-store" });
      const json = (await res.json()) as HealthPayload;
      setLatencyMs(Math.round(performance.now() - started));
      if (!res.ok) throw new Error(`/api/health ${res.status}`);
      return json;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    latencyMs,
    dataUpdatedAt: query.dataUpdatedAt,
    refetch: query.refetch,
  };
}
