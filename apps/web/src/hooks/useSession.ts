"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuthMeResponse } from "@iot/shared";

/**
 * Direction B — useSession.
 *
 * Lấy thông tin user hiện tại từ `/api/me` (cookie auth).
 * staleTime 5 phút — thông tin profile ít đổi trong session.
 *
 * Trả `null` nếu chưa đăng nhập (401) — không throw, UI tự xử lý.
 */
interface SessionResult {
  data: AuthMeResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useSession(): SessionResult {
  const query = useQuery<AuthMeResponse | null, Error>({
    queryKey: ["session", "me"],
    queryFn: async () => {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (res.status === 401 || res.status === 404) return null;
      if (!res.ok) throw new Error(`/api/me ${res.status}`);
      return (await res.json()) as AuthMeResponse;
    },
    staleTime: 5 * 60_000,
    retry: 0,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
