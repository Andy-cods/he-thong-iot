"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * V3.7.66 — Hook self-update profile (PATCH /api/me).
 * Mọi user đã login đều update được fullName + email của chính họ.
 */

export interface ProfileUpdateInput {
  fullName?: string;
  email?: string | null;
}

export interface ProfileResponse {
  data: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
  };
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) => {
      const res = await fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as ProfileResponse;
    },
    onSuccess: () => {
      // Invalidate session để TopBar/UserMenu refresh fullName
      qc.invalidateQueries({ queryKey: ["session", "me"] });
    },
  });
}
