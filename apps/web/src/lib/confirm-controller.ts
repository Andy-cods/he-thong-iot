/**
 * V4.1 UX-01 / UI-26 (Đợt 6B, X5) — lõi THUẦN (không React) cho hộp xác nhận
 * dạng Promise thay hộp thoại gốc của trình duyệt (confirm/prompt của window).
 *
 * `ConfirmProvider` (components/ui/confirm-dialog.tsx) giữ 1 controller; hook
 * `useConfirm()` / `usePrompt()` gọi `requestConfirm/requestPrompt` → nhận Promise, người dùng
 * bấm nút → `settle()` resolve Promise. Tách riêng để test được bằng vitest.
 */

export type ConfirmTone = "danger" | "primary";

export interface ConfirmOptions {
  title: string;
  description?: unknown;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" = nút đỏ + icon cảnh báo (xoá / huỷ / từ chối). Mặc định "primary". */
  tone?: ConfirmTone;
  /** Bắt gõ đúng chuỗi này mới cho bấm (gộp `DialogConfirm` cũ). */
  typeToConfirm?: string;
}

export interface PromptOptions extends ConfirmOptions {
  /** Nhãn ô nhập. */
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  /** Bắt buộc nhập (sau trim). */
  required?: boolean;
  /** Số ký tự tối thiểu (sau trim) — ngầm hiểu `required`. */
  minLength?: number;
  maxLength?: number;
  /** Ô nhiều dòng (lý do dài). Mặc định true. */
  multiline?: boolean;
}

export type DialogRequest =
  | { kind: "confirm"; id: number; options: ConfirmOptions }
  | { kind: "prompt"; id: number; options: PromptOptions };

/** Kiểm giá trị ô nhập; trả thông báo lỗi tiếng Việt hoặc null nếu hợp lệ. */
export function validatePromptValue(
  value: string,
  opts: Pick<PromptOptions, "required" | "minLength" | "maxLength">,
): string | null {
  const v = value.trim();
  const min = opts.minLength ?? 0;
  if ((opts.required || min > 0) && v.length === 0) return "Vui lòng nhập nội dung.";
  if (min > 0 && v.length < min) return `Tối thiểu ${min} ký tự (hiện ${v.length}).`;
  if (opts.maxLength !== undefined && v.length > opts.maxLength) {
    return `Tối đa ${opts.maxLength} ký tự.`;
  }
  return null;
}

/** Nút xác nhận chỉ bật khi gõ đúng chuỗi yêu cầu (nếu có). */
export function isTypeToConfirmSatisfied(typed: string, required?: string): boolean {
  return !required || typed.trim() === required;
}

type Listener = (current: DialogRequest | null) => void;

/**
 * Hàng đợi hộp thoại: mỗi lúc chỉ hiện 1; yêu cầu sau chờ yêu cầu trước đóng.
 * `settle(value)`: confirm → boolean, prompt → string (đã trim) | null (huỷ).
 */
export function createConfirmController() {
  let seq = 0;
  const queue: Array<{ req: DialogRequest; resolve: (v: unknown) => void }> = [];
  const listeners = new Set<Listener>();

  const current = () => queue[0]?.req ?? null;
  const emit = () => {
    const c = current();
    listeners.forEach((l) => l(c));
  };

  function push<T>(req: DialogRequest): Promise<T> {
    return new Promise<T>((resolve) => {
      queue.push({ req, resolve: resolve as (v: unknown) => void });
      if (queue.length === 1) emit();
    });
  }

  return {
    requestConfirm(options: ConfirmOptions): Promise<boolean> {
      return push<boolean>({ kind: "confirm", id: ++seq, options });
    },
    requestPrompt(options: PromptOptions): Promise<string | null> {
      return push<string | null>({ kind: "prompt", id: ++seq, options });
    },
    /** Kết thúc hộp đang hiện. confirm: true/false; prompt: chuỗi hoặc null. */
    settle(value: boolean | string | null): void {
      const head = queue.shift();
      if (!head) return;
      if (head.req.kind === "confirm") {
        head.resolve(value === true);
      } else {
        head.resolve(typeof value === "string" ? value.trim() : null);
      }
      emit();
    },
    current,
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type ConfirmController = ReturnType<typeof createConfirmController>;
