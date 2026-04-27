"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * V3 (TASK-20260427-020) — `<Wizard>` reusable component cho multi-step form.
 *
 * Layout:
 *   - Top: progress indicator (chevron) — 1 → 2 → 3, active indigo, done emerald
 *   - Center: content (children — render step hiện tại bằng prop pattern)
 *   - Bottom sticky: nút "Quay lại" / "Tiếp" / "Hoàn tất"
 *
 * Controlled qua URL search param (?step=key). Caller dùng `useWizardStep()`
 * để wire URL ↔ state. Reload không mất step.
 *
 * Validate strategy:
 *   - Mỗi step có optional `validate(): Promise<{ ok, error? }>`. Trước khi
 *     bấm "Tiếp" wizard sẽ chạy validate; fail → toast error + giữ step.
 *   - Step cuối → bấm "Hoàn tất" sẽ chạy validate (nếu có) rồi gọi `onSubmit`.
 *
 * Style: Industrial Slate × Indigo/Emerald tokens. KHÔNG emoji.
 */

export interface WizardStep {
  key: string;
  title: string;
  description?: string;
  /** Async validate trước khi qua step kế. Trả ok=false để chặn. */
  validate?: () => Promise<{ ok: boolean; error?: string }>;
}

export interface WizardProps {
  steps: WizardStep[];
  /** Step key hiện tại (controlled). */
  current: string;
  /** Callback khi user chuyển step (Next/Back/click chevron). Caller cần đẩy lên URL. */
  onChangeStep: (key: string) => void;
  /** Callback khi user bấm "Hoàn tất" ở step cuối. Wizard set isSubmitting trong khi chạy. */
  onSubmit: () => Promise<void>;
  /** Render content step hiện tại. Caller thường switch theo step key. */
  children: React.ReactNode;
  /** Cho phép tự do click chevron để jump step (default false — phải Next tuần tự). */
  allowJump?: boolean;
  /** Custom label nút submit step cuối (default "Hoàn tất"). */
  submitLabel?: string;
  className?: string;
}

export function Wizard({
  steps,
  current,
  onChangeStep,
  onSubmit,
  children,
  allowJump = false,
  submitLabel = "Hoàn tất",
  className,
}: WizardProps) {
  const idx = Math.max(
    0,
    steps.findIndex((s) => s.key === current),
  );
  const safeIdx = idx === -1 ? 0 : idx;
  const step = steps[safeIdx];
  const isFirst = safeIdx === 0;
  const isLast = safeIdx === steps.length - 1;

  const [isValidating, setIsValidating] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [doneKeys, setDoneKeys] = React.useState<Set<string>>(new Set());

  const runValidate = async (): Promise<boolean> => {
    if (!step?.validate) return true;
    setIsValidating(true);
    try {
      const res = await step.validate();
      if (!res.ok) {
        toast.error(res.error ?? "Vui lòng kiểm tra lại các trường bắt buộc.");
        return false;
      }
      return true;
    } catch (err) {
      toast.error(`Lỗi kiểm tra: ${(err as Error).message}`);
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleNext = async () => {
    const ok = await runValidate();
    if (!ok) return;
    setDoneKeys((prev) => {
      const next = new Set(prev);
      next.add(step!.key);
      return next;
    });
    const nextStep = steps[safeIdx + 1];
    if (nextStep) onChangeStep(nextStep.key);
  };

  const handleBack = () => {
    if (isFirst) return;
    const prevStep = steps[safeIdx - 1];
    if (prevStep) onChangeStep(prevStep.key);
  };

  const handleSubmit = async () => {
    const ok = await runValidate();
    if (!ok) return;
    setIsSubmitting(true);
    try {
      await onSubmit();
      setDoneKeys((prev) => {
        const next = new Set(prev);
        next.add(step!.key);
        return next;
      });
    } catch (err) {
      toast.error(`Gửi thất bại: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStepClick = (targetIdx: number) => {
    if (!allowJump) return;
    if (targetIdx === safeIdx) return;
    // Backward jump luôn cho phép, forward chỉ cho phép tới step đã done.
    if (targetIdx < safeIdx) {
      onChangeStep(steps[targetIdx]!.key);
      return;
    }
    const targetKey = steps[targetIdx]!.key;
    const allPrevDone = steps
      .slice(0, targetIdx)
      .every((s) => doneKeys.has(s.key));
    if (allPrevDone) onChangeStep(targetKey);
  };

  const busy = isValidating || isSubmitting;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Progress indicator */}
      <WizardProgress
        steps={steps}
        currentIdx={safeIdx}
        doneKeys={doneKeys}
        onStepClick={allowJump ? handleStepClick : undefined}
      />

      {/* Step header */}
      {step ? (
        <div className="border-b border-zinc-200 bg-white px-6 py-3">
          <h2 className="text-base font-semibold text-zinc-900">
            {step.title}
          </h2>
          {step.description ? (
            <p className="mt-0.5 text-xs text-zinc-500">{step.description}</p>
          ) : null}
        </div>
      ) : null}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto bg-zinc-50 p-6">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </div>

      {/* Sticky footer */}
      <div className="border-t border-zinc-200 bg-white px-6 py-3">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={isFirst || busy}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Quay lại
          </Button>
          <p className="text-xs text-zinc-500">
            Bước {safeIdx + 1} / {steps.length}
          </p>
          {isLast ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSubmit()}
              disabled={busy}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              {isSubmitting ? "Đang gửi…" : submitLabel}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleNext()}
              disabled={busy}
            >
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Tiếp
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentIdx: number;
  doneKeys: Set<string>;
  onStepClick?: (idx: number) => void;
}

function WizardProgress({
  steps,
  currentIdx,
  doneKeys,
  onStepClick,
}: WizardProgressProps) {
  return (
    <ol
      aria-label="Tiến độ wizard"
      className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-white px-6 py-3"
    >
      {steps.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = doneKeys.has(s.key) && !isActive;
        const isPast = i < currentIdx;
        const Tag = onStepClick ? "button" : "div";
        return (
          <React.Fragment key={s.key}>
            <li className="flex-shrink-0">
              <Tag
                type={onStepClick ? "button" : undefined}
                onClick={onStepClick ? () => onStepClick(i) : undefined}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive &&
                    "border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm",
                  !isActive && (isDone || isPast) &&
                    "border-emerald-300 bg-emerald-50 text-emerald-800",
                  !isActive && !(isDone || isPast) &&
                    "border-zinc-200 bg-white text-zinc-500",
                  onStepClick && "cursor-pointer hover:border-zinc-400",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                    isActive && "bg-indigo-600 text-white",
                    !isActive && (isDone || isPast) &&
                      "bg-emerald-600 text-white",
                    !isActive && !(isDone || isPast) &&
                      "bg-zinc-100 text-zinc-600",
                  )}
                >
                  {(isDone || isPast) && !isActive ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="whitespace-nowrap">{s.title}</span>
              </Tag>
            </li>
            {i < steps.length - 1 ? (
              <li
                aria-hidden="true"
                className={cn(
                  "flex-shrink-0 text-zinc-300",
                  i < currentIdx && "text-emerald-400",
                )}
              >
                <ChevronRightIcon />
              </li>
            ) : null}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * `<WizardSummary>` — render review step dạng key/value list.
 * Dùng cho step cuối "Review & gửi".
 */
export interface WizardSummaryItem {
  label: string;
  value: React.ReactNode;
  /** True nếu giá trị nhấn mạnh (vd tổng tiền). */
  emphasize?: boolean;
}

export interface WizardSummaryProps {
  title?: string;
  items: WizardSummaryItem[];
  className?: string;
}

export function WizardSummary({
  title,
  items,
  className,
}: WizardSummaryProps) {
  return (
    <section
      className={cn(
        "rounded-md border border-zinc-200 bg-white p-4",
        className,
      )}
    >
      {title ? (
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h3>
      ) : null}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-baseline justify-between gap-3 border-b border-zinc-100 py-1.5 last:border-b-0"
          >
            <dt className="text-xs uppercase tracking-wide text-zinc-500">
              {it.label}
            </dt>
            <dd
              className={cn(
                "text-right text-sm",
                it.emphasize
                  ? "font-semibold text-indigo-700"
                  : "text-zinc-900",
              )}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
