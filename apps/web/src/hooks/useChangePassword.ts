"use client";

import { useMutation } from "@tanstack/react-query";
import type { ChangePassword } from "@iot/shared";

interface RequestError extends Error {
  status?: number;
  code?: string;
}

/**
 * Change password hook — POST /api/auth/change-password.
 * Server trả 401 code CURRENT_PASSWORD_INVALID khi sai pass cũ.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: ChangePassword) => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
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
      return (await res.json()) as { data: { ok: true } };
    },
  });
}
