import * as React from "react";
import { cn } from "@/lib/utils";
import {
  TONE_CLASSES,
  getStatus,
  type StatusDef,
  type StatusDomain,
  type StatusTone,
} from "@/lib/status";

/**
 * V4.1 UI-07/08 (Đợt 6B) — Pill trạng thái dùng chung, lấy nhãn + tông từ
 * `lib/status.ts`. Thay các map `cls/dot` tự khai báo ở từng bảng.
 *
 *   <StatusPill domain="po" code={row.status} />
 *   <StatusPill domain="wo" code={wo.status} short dot />
 *   <StatusPill tone="warning" label="Quá hạn" />   // trạng thái tự tính
 *
 * Luôn `whitespace-nowrap` (UI-10). Trạng thái huỷ/ngừng (`void`) → xám + gạch ngang.
 */
export interface StatusPillProps {
  domain?: StatusDomain;
  code?: string | null;
  /** Ghi đè nhãn (VD kèm số lượng). */
  label?: React.ReactNode;
  /** Ghi đè tông khi không dùng domain. */
  tone?: StatusTone;
  /** Dùng nhãn ngắn (`short`) nếu có. */
  short?: boolean;
  /** Hiện chấm tròn màu trước nhãn. */
  dot?: boolean;
  /** Chấm nhấp nháy (trạng thái đang chạy). */
  pulse?: boolean;
  icon?: React.ElementType;
  size?: "sm" | "md";
  className?: string;
  title?: string;
}

export function resolveStatus(
  domain: StatusDomain | undefined,
  code: string | null | undefined,
  tone: StatusTone | undefined,
): StatusDef {
  if (domain) {
    const def = getStatus(domain, code);
    return tone ? { ...def, tone } : def;
  }
  return { label: code ?? "—", tone: tone ?? "neutral" };
}

export function StatusPill({
  domain,
  code,
  label,
  tone,
  short = false,
  dot = false,
  pulse = false,
  icon: Icon,
  size = "sm",
  className,
  title,
}: StatusPillProps) {
  const def = resolveStatus(domain, code, tone);
  const cls = TONE_CLASSES[def.tone];
  const text = label ?? (short && def.short ? def.short : def.label);
  return (
    <span
      title={title ?? (typeof text === "string" && short ? def.label : undefined)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        cls.pill,
        className,
      )}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cls.dot, pulse && "animate-pulse")}
        />
      ) : null}
      {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
      <span className={cn(def.void && "line-through decoration-zinc-400/70")}>{text}</span>
    </span>
  );
}
