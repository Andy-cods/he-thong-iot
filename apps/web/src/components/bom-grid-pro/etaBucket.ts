import { differenceInCalendarDays, parseISO, isValid } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  type LucideIcon,
} from "lucide-react";

/**
 * V3.8.3 — Phân loại độ khẩn "Ngày dự kiến nhận hàng" cho BOM grid.
 *
 * Mục tiêu: Bộ phận Thu mua nhìn lướt biết dòng nào quá hạn / sắp tới hạn để
 * chủ động giục NCC. 3 kênh thông tin (a11y mù màu): MÀU nền + ICON + CHỮ
 * ("quá N ngày" / "còn N ngày"). Ngưỡng mặc định 0-3 / 3-7 / 7-14 ngày
 * (lead-time vật tư cơ khí mua trong nước — chỉnh ở THRESHOLDS nếu cần).
 *
 * Dùng `differenceInCalendarDays` (so theo ngày-lịch) thay vì trừ mili-giây để
 * tránh lệch do timezone Asia/Ho_Chi_Minh (+07). `expected_eta` là kiểu `date`
 * thuần "YYYY-MM-DD".
 */

export const ETA_THRESHOLDS = {
  /** ≤ urgent ngày → cận kề (cam đậm). */
  urgent: 3,
  /** ≤ near ngày → gần (amber). */
  near: 7,
  /** ≤ soon ngày → sắp tới (vàng nhạt). */
  soon: 14,
} as const;

export type EtaTone =
  | "overdue"
  | "urgent"
  | "near"
  | "soon"
  | "later"
  | "none"
  | "done";

export interface EtaBucket {
  tone: EtaTone;
  /** Class Tailwind cho container badge trong cell (light only — grid chưa dùng dark:). */
  cellClass: string;
  Icon: LucideIcon | null;
  /** Ngày rút gọn "dd/MM" hiển thị trong cell (rỗng nếu chưa đặt). */
  dateLabel: string;
  /** Nhãn độ khẩn: "quá 3 ngày" / "còn 5 ngày" / "hôm nay" / "Đã về" / "Chưa đặt". */
  dayLabel: string;
  /** Tooltip đầy đủ. */
  title: string;
  /** Số ngày còn lại (âm = quá hạn). null nếu chưa đặt ETA. */
  daysLeft: number | null;
  /** Tiện cho badge/filter: dòng cần chú ý (quá hạn hoặc ≤ near ngày). */
  needsAttention: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * @param eta ISO date "YYYY-MM-DD" hoặc null
 * @param receivedQty SL đã nhận (manual PIC) — để nhận biết "Đã về"
 * @param totalQty SL tổng cần — nếu received ≥ total → tone "done"
 * @param today inject để test (mặc định now)
 */
export function getEtaBucket(
  eta: string | null | undefined,
  receivedQty?: number,
  totalQty?: number,
  today: Date = new Date(),
): EtaBucket {
  const isDone =
    typeof receivedQty === "number" &&
    typeof totalQty === "number" &&
    totalQty > 0 &&
    receivedQty >= totalQty;

  // Chưa đặt ngày.
  if (!eta) {
    return {
      tone: isDone ? "done" : "none",
      cellClass: isDone
        ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
        : "text-zinc-400",
      Icon: isDone ? CheckCircle2 : null,
      dateLabel: "",
      dayLabel: isDone ? "Đã về" : "Chưa đặt",
      title: isDone ? "Đã nhận đủ" : "Chưa có ngày dự kiến nhận",
      daysLeft: null,
      needsAttention: false,
    };
  }

  const parsed = parseISO(eta);
  if (!isValid(parsed)) {
    return {
      tone: "none",
      cellClass: "text-zinc-400",
      Icon: null,
      dateLabel: "",
      dayLabel: "—",
      title: "Ngày không hợp lệ",
      daysLeft: null,
      needsAttention: false,
    };
  }

  const dateLabel = `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}`;
  const fullDate = `${dateLabel}/${parsed.getFullYear()}`;
  const daysLeft = differenceInCalendarDays(parsed, today);

  // Đã nhận đủ → tắt màu khẩn, hiện "Đã về".
  if (isDone) {
    return {
      tone: "done",
      cellClass: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
      Icon: CheckCircle2,
      dateLabel,
      dayLabel: "Đã về",
      title: `Đã nhận đủ · dự kiến ${fullDate}`,
      daysLeft,
      needsAttention: false,
    };
  }

  let tone: EtaTone;
  let cellClass: string;
  let Icon: LucideIcon | null;
  let dayLabel: string;

  if (daysLeft < 0) {
    tone = "overdue";
    cellClass = "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-300 font-semibold";
    Icon = AlertTriangle;
    dayLabel = `quá ${Math.abs(daysLeft)} ngày`;
  } else if (daysLeft <= ETA_THRESHOLDS.urgent) {
    tone = "urgent";
    cellClass = "bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-200 font-medium";
    Icon = Clock;
    dayLabel = daysLeft === 0 ? "hôm nay" : `còn ${daysLeft} ngày`;
  } else if (daysLeft <= ETA_THRESHOLDS.near) {
    tone = "near";
    cellClass = "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200";
    Icon = Clock;
    dayLabel = `còn ${daysLeft} ngày`;
  } else if (daysLeft <= ETA_THRESHOLDS.soon) {
    tone = "soon";
    cellClass = "bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-200";
    Icon = null;
    dayLabel = `còn ${daysLeft} ngày`;
  } else {
    tone = "later";
    cellClass = "text-zinc-600";
    Icon = null;
    dayLabel = `còn ${daysLeft} ngày`;
  }

  return {
    tone,
    cellClass,
    Icon,
    dateLabel,
    dayLabel,
    title: `Dự kiến nhận: ${fullDate} · ${dayLabel}`,
    daysLeft,
    needsAttention: daysLeft <= ETA_THRESHOLDS.near,
  };
}
