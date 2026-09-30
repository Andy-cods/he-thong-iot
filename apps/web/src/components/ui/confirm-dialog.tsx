"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createConfirmController,
  isTypeToConfirmSatisfied,
  validatePromptValue,
  type ConfirmController,
  type ConfirmOptions,
  type ConfirmTone,
  type DialogRequest,
  type PromptOptions,
} from "@/lib/confirm-controller";

export type { ConfirmOptions, PromptOptions, ConfirmTone } from "@/lib/confirm-controller";

/**
 * V4.1 UX-01 / UI-26 (Đợt 6B, X5) — Hộp xác nhận dùng chung, tổng quát hoá
 * `components/finance/ConfirmActionDialog.tsx` (Đợt 3, nay là wrapper mỏng).
 *
 * 2 cách dùng:
 *  1. Controlled: `<ConfirmDialog open onOpenChange title … onConfirm />` —
 *     khi cần `loading` trong lúc gọi API (tài chính).
 *  2. Promise (thay hộp thoại gốc confirm/prompt của trình duyệt):
 *       const askConfirm = useConfirm();
 *       if (!(await askConfirm({ title: "Xoá barcode?", tone: "danger" }))) return;
 *       const askReason = usePrompt();
 *       const reason = await askReason({ title: "Lý do từ chối", minLength: 5 });
 *       if (reason === null) return; // người dùng bấm Huỷ
 */

// ---------------------------------------------------------------------------
// Controlled dialog
// ---------------------------------------------------------------------------

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  loading?: boolean;
  /**
   * Bắt gõ đúng chuỗi mới bật nút xác nhận.
   *
   * V4.4 A13 — chỉ dùng cho hành động XOÁ VĨNH VIỄN/không thể hồi phục (VD
   * gõ "XOA"). Hành động có thể hồi phục (vô hiệu hoá, khoá tạm…) không nên
   * bắt gõ "XOA" — gây hiểu nhầm mức độ nghiêm trọng; bỏ prop này và dùng
   * `tone="danger"` với nút xác nhận thường là đủ.
   */
  typeToConfirm?: string;
  /** Tắt nút xác nhận (VD ô lý do chưa hợp lệ). */
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  tone = "primary",
  loading = false,
  typeToConfirm,
  confirmDisabled = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [typed, setTyped] = React.useState("");
  const inputId = React.useId();
  React.useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const danger = tone === "danger";
  const disabled =
    loading || confirmDisabled || !isTypeToConfirmSatisfied(typed, typeToConfirm);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!loading) onOpenChange(v);
      }}
    >
      <DialogContent size="sm" role="alertdialog">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled) void onConfirm();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {danger ? (
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                  aria-hidden="true"
                />
              ) : null}
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription asChild>
                <div className="text-sm text-zinc-600 dark:text-zinc-300">{description}</div>
              </DialogDescription>
            ) : (
              // Radix cần Description để đọc màn hình không cảnh báo — ẩn khi trống.
              <DialogDescription className="sr-only">{title}</DialogDescription>
            )}
          </DialogHeader>
          {children}
          {typeToConfirm ? (
            <div className="space-y-2">
              <label
                htmlFor={inputId}
                className="text-sm font-medium text-zinc-900 dark:text-zinc-50"
              >
                Gõ{" "}
                <span className="font-mono font-semibold text-red-700 dark:text-red-400">
                  {typeToConfirm}
                </span>{" "}
                để xác nhận:
              </label>
              <Input
                id={inputId}
                autoComplete="off"
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={danger ? "danger" : "primary"}
              disabled={disabled}
              autoFocus={!typeToConfirm && !children}
            >
              {loading ? "Đang xử lý…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Promise API — Provider + hooks
// ---------------------------------------------------------------------------

const ConfirmContext = React.createContext<ConfirmController | null>(null);

function useController(): ConfirmController {
  const ctl = React.useContext(ConfirmContext);
  if (!ctl) throw new Error("useConfirm/usePrompt cần <ConfirmProvider> (components/providers.tsx).");
  return ctl;
}

/** `await askConfirm({...})` → true khi người dùng bấm xác nhận. */
export function useConfirm(): (options: ConfirmOptions & { description?: React.ReactNode }) => Promise<boolean> {
  const ctl = useController();
  return React.useCallback((options) => ctl.requestConfirm(options), [ctl]);
}

/** `await askReason({...})` → chuỗi đã trim, hoặc null khi huỷ. */
export function usePrompt(): (options: PromptOptions & { description?: React.ReactNode }) => Promise<string | null> {
  const ctl = useController();
  return React.useCallback((options) => ctl.requestPrompt(options), [ctl]);
}

function PromptBody({
  options,
  value,
  onChange,
  error,
}: {
  options: PromptOptions;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  const id = React.useId();
  const multiline = options.multiline ?? true;
  const hint =
    options.minLength && options.minLength > 0
      ? `Bắt buộc, tối thiểu ${options.minLength} ký tự.`
      : options.required
        ? "Bắt buộc."
        : "Không bắt buộc.";
  return (
    <div className="space-y-1.5">
      {options.label ? (
        <label htmlFor={id} className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {options.label}
        </label>
      ) : null}
      {multiline ? (
        <Textarea
          id={id}
          autoFocus
          rows={3}
          value={value}
          placeholder={options.placeholder}
          maxLength={options.maxLength}
          onChange={(e) => onChange(e.target.value)}
          error={Boolean(error)}
          aria-label={options.label ?? options.title}
        />
      ) : (
        <Input
          id={id}
          autoFocus
          value={value}
          placeholder={options.placeholder}
          maxLength={options.maxLength}
          onChange={(e) => onChange(e.target.value)}
          aria-label={options.label ?? options.title}
        />
      )}
      <p
        className={
          error
            ? "text-xs text-red-600 dark:text-red-400"
            : "text-xs text-zinc-500 dark:text-zinc-400"
        }
      >
        {error ?? hint}
      </p>
    </div>
  );
}

function ActiveDialog({
  request,
  onSettle,
}: {
  request: DialogRequest;
  onSettle: (value: boolean | string | null) => void;
}) {
  const opts = request.options;
  const isPrompt = request.kind === "prompt";
  const promptOpts = isPrompt ? (opts as PromptOptions) : null;
  const [value, setValue] = React.useState(promptOpts?.defaultValue ?? "");
  const [touched, setTouched] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const result = React.useRef<boolean | string | null>(isPrompt ? null : false);

  const error = promptOpts ? validatePromptValue(value, promptOpts) : null;

  // Đóng có hiệu ứng rồi mới resolve (tránh hộp sau chồng lên hộp trước).
  const close = (v: boolean | string | null) => {
    result.current = v;
    setOpen(false);
  };
  React.useEffect(() => {
    if (open) return;
    const t = setTimeout(() => onSettle(result.current), 120);
    return () => clearTimeout(t);
  }, [open, onSettle]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close(isPrompt ? null : false);
      }}
      title={opts.title}
      description={opts.description as React.ReactNode}
      confirmLabel={opts.confirmLabel}
      cancelLabel={opts.cancelLabel}
      tone={opts.tone}
      typeToConfirm={opts.typeToConfirm}
      confirmDisabled={Boolean(promptOpts && touched && error)}
      onConfirm={() => {
        if (promptOpts) {
          setTouched(true);
          if (error) return;
          close(value);
        } else {
          close(true);
        }
      }}
    >
      {promptOpts ? (
        <PromptBody
          options={promptOpts}
          value={value}
          onChange={(v) => {
            setValue(v);
            setTouched(true);
          }}
          error={touched ? error : null}
        />
      ) : null}
    </ConfirmDialog>
  );
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [ctl] = React.useState(createConfirmController);
  const [current, setCurrent] = React.useState<DialogRequest | null>(null);
  React.useEffect(() => ctl.subscribe(setCurrent), [ctl]);
  const settle = React.useCallback((v: boolean | string | null) => ctl.settle(v), [ctl]);

  return (
    <ConfirmContext.Provider value={ctl}>
      {children}
      {current ? <ActiveDialog key={current.id} request={current} onSettle={settle} /> : null}
    </ConfirmContext.Provider>
  );
}
