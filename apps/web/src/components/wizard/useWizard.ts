"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * V3 (TASK-20260427-020) — Hook helper bind wizard step ↔ URL search param.
 *
 * Usage:
 *   const { step, setStep } = useWizardStep({
 *     stepKeys: ["info", "lines", "review"],
 *     param: "step",
 *     defaultKey: "info",
 *   });
 *
 *   <Wizard current={step} onChangeStep={setStep} ... />
 *
 * Reload không mất step (URL persist). Hỗ trợ replace/push history.
 */

export interface UseWizardStepOptions {
  /** Danh sách step key hợp lệ — dùng để fallback nếu URL có giá trị không hợp lệ. */
  stepKeys: string[];
  /** Tên search param (default "step"). */
  param?: string;
  /** Step mặc định nếu URL không có (default = stepKeys[0]). */
  defaultKey?: string;
  /** Dùng router.replace thay vì push (default true — không pollute history). */
  replace?: boolean;
}

export function useWizardStep({
  stepKeys,
  param = "step",
  defaultKey,
  replace = true,
}: UseWizardStepOptions) {
  const router = useRouter();
  const sp = useSearchParams();

  const fallback = defaultKey ?? stepKeys[0]!;
  const raw = sp.get(param);
  const step = raw && stepKeys.includes(raw) ? raw : fallback;

  const setStep = React.useCallback(
    (next: string) => {
      if (!stepKeys.includes(next)) {
        // eslint-disable-next-line no-console
        console.warn(`[useWizardStep] step "${next}" không hợp lệ.`);
        return;
      }
      const params = new URLSearchParams(sp?.toString() ?? "");
      params.set(param, next);
      const url = `?${params.toString()}`;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [stepKeys, sp, param, replace, router],
  );

  return { step, setStep };
}
