/**
 * V4.1 Đợt 3 — Hàm THUẦN phân hệ Tài chính dùng chung client + server (không
 * import db/next). Có test ở `lib/finance.test.ts`.
 *
 * - Nguồn thu / nguồn chi (Q7): số dư sau phiếu, chặn chi vượt số dư.
 * - Chuyển quỹ nội bộ: dựng cặp chân OUT/IN.
 * - Ngày theo giờ Việt Nam (TC-13) + định dạng tiền đủ số.
 */

export type FinDir = "IN" | "OUT";

/** Tiền đủ số, không rút gọn: 12.500.000 ₫ (âm giữ dấu −). */
export function formatVndFull(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return "0 ₫";
  const rounded = Math.round(v);
  const abs = Math.abs(rounded).toLocaleString("vi-VN");
  return `${rounded < 0 ? "−" : ""}${abs} ₫`;
}

/** Số dư nguồn sau khi ghi 1 phiếu: thu cộng, chi trừ. */
export function balanceAfter(balance: number | string, direction: FinDir, amount: number): number {
  const b = Number(balance) || 0;
  const a = Number(amount) || 0;
  return direction === "IN" ? b + a : b - a;
}

export interface SpendCheckInput {
  accountName: string;
  balance: number | string;
  amount: number;
  isActive?: boolean;
  /** true = admin chủ động cho phép vượt số dư. */
  allowOverdraft?: boolean;
}

export type SpendCheckResult =
  | { ok: true; balanceAfter: number }
  | {
      ok: false;
      code: "FIN_ACCOUNT_INACTIVE" | "FIN_INSUFFICIENT_BALANCE";
      message: string;
      balance: number;
      balanceAfter: number;
    };

/**
 * Q7 — Kiểm 1 khoản CHI từ nguồn `accountName`. Sai số làm tròn ≤ 0,5 ₫ bỏ qua
 * (numeric(18,2)). Nguồn đã ngưng dùng luôn bị chặn (kể cả admin).
 */
export function evaluateSpend(input: SpendCheckInput): SpendCheckResult {
  const balance = Number(input.balance) || 0;
  const after = balanceAfter(balance, "OUT", input.amount);
  if (input.isActive === false) {
    return {
      ok: false,
      code: "FIN_ACCOUNT_INACTIVE",
      message: `Nguồn "${input.accountName}" đã ngưng sử dụng.`,
      balance,
      balanceAfter: after,
    };
  }
  if (after < -0.5 && !input.allowOverdraft) {
    return {
      ok: false,
      code: "FIN_INSUFFICIENT_BALANCE",
      message: `Nguồn chi "${input.accountName}" chỉ còn ${formatVndFull(balance)}.`,
      balance,
      balanceAfter: after,
    };
  }
  return { ok: true, balanceAfter: after };
}

/** Lỗi nghiệp vụ nguồn tiền — route map sang 409 với `message` tiếng Việt. */
export class FinSourceError extends Error {
  constructor(
    public code: "FIN_ACCOUNT_NOT_FOUND" | "FIN_ACCOUNT_INACTIVE" | "FIN_INSUFFICIENT_BALANCE",
    message: string,
    public status = 409,
  ) {
    super(message);
    this.name = "FinSourceError";
  }
}

export interface TransferLegInput {
  fromAccountId: string;
  toAccountId: string;
  fromAccountName: string;
  toAccountName: string;
  amount: number;
  transactionDate: string;
  description?: string | null;
}

export interface TransferLeg {
  code: string;
  direction: FinDir;
  accountId: string;
  amount: string;
  transactionDate: string;
  description: string;
  transferGroupId: string;
}

/**
 * Q7 — Dựng đúng 2 chân của 1 lần chuyển quỹ: OUT ở nguồn đi (mã `code`),
 * IN ở nguồn nhận (mã `code-N`), cùng `transferGroupId`, cùng số tiền.
 */
export function buildTransferLegs(
  input: TransferLegInput,
  code: string,
  transferGroupId: string,
): [TransferLeg, TransferLeg] {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error("FIN_TRANSFER_SAME_ACCOUNT");
  }
  if (!(input.amount > 0)) throw new Error("FIN_TRANSFER_AMOUNT_INVALID");
  const label = `Chuyển quỹ: ${input.fromAccountName} → ${input.toAccountName}`;
  const note = input.description?.trim();
  const description = note ? `${label} — ${note}` : label;
  const amount = String(input.amount);
  return [
    {
      code,
      direction: "OUT",
      accountId: input.fromAccountId,
      amount,
      transactionDate: input.transactionDate,
      description,
      transferGroupId,
    },
    {
      code: `${code}-N`,
      direction: "IN",
      accountId: input.toAccountId,
      amount,
      transactionDate: input.transactionDate,
      description,
      transferGroupId,
    },
  ];
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * TC-13 — Ngày 'YYYY-MM-DD' theo giờ Việt Nam (+07, không DST) của 1 Date.
 * Date tạo từ chuỗi 'YYYY-MM-DD' (nửa đêm UTC) vẫn giữ đúng ngày đó; Date là
 * thời điểm thật (form gửi `new Date()`) được quy về ngày VN — hết lùi 1 ngày
 * trước 7h sáng.
 */
export function isoDateVN(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Hôm nay theo giờ Việt Nam. */
export function vnToday(now: Date = new Date()): string {
  return isoDateVN(now);
}

/** Cộng/trừ ngày trên chuỗi 'YYYY-MM-DD' (tính theo UTC thuần, không lệch múi giờ). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** TC-26 — header Content-Disposition an toàn cho tên file tiếng Việt. */
export function contentDispositionAttachment(fileName: string): string {
  const ascii =
    fileName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || "file";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
