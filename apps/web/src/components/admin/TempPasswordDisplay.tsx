"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Temp password display — mono text 14px + copy button.
 * Dùng trong /admin/users/new sau khi generate random 12-char.
 */
export interface TempPasswordDisplayProps {
  value: string;
  className?: string;
  label?: string;
}

export function TempPasswordDisplay({
  value,
  className,
  label = "Mật khẩu tạm",
}: TempPasswordDisplayProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Đã copy mật khẩu.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy thất bại — hãy copy thủ công.");
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <code className="truncate font-mono text-sm font-semibold text-zinc-900">
          {value}
        </code>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={handleCopy}
              aria-label="Copy mật khẩu"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy mật khẩu tạm</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

/**
 * Generate random 12-char password: lowercase+uppercase+digit+1 special.
 * Crypto-safe bằng crypto.getRandomValues.
 */
export function generateTempPassword(length = 12): string {
  const lowers = "abcdefghijkmnpqrstuvwxyz"; // skip l,o ambiguous
  const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // skip I,O ambiguous
  const digits = "23456789"; // skip 0,1 ambiguous
  const specials = "!@#$%&*";
  const all = lowers + uppers + digits + specials;

  const pick = (pool: string): string => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return pool[buf[0]! % pool.length]!;
  };

  // Guarantee coverage rồi shuffle
  const guaranteed = [
    pick(lowers),
    pick(uppers),
    pick(digits),
    pick(specials),
  ];
  const rest = Array.from({ length: length - guaranteed.length }, () =>
    pick(all),
  );
  const arr = [...guaranteed, ...rest];
  // Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0]! % (i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.join("");
}
