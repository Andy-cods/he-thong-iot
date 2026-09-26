/**
 * Kiểu + helper thuần cho chế độ Nhập/Xuất của tab `movement` (Quản lí kho).
 *
 * ⚠ VÌ SAO TÁCH RA FILE RIÊNG (không để trong `MovementTab.tsx`):
 * `MovementTab.tsx` có directive `"use client"`. Khi Server Component
 * (`app/(app)/warehouse/page.tsx`) import một hàm từ file client, Next.js
 * KHÔNG đưa code thật sang server mà thay bằng client-reference stub → gọi
 * hàm đó trên server ném `TypeError: T is not a function` và TOÀN BỘ trang
 * /warehouse trả 500 (mọi tab, không riêng tab nào).
 *
 * Lỗi thật đã gặp trên prod 2026-09-22: typecheck + 70 vitest + build đều
 * PASS vì đây là lỗi RUNTIME của ranh giới server/client, không phải lỗi kiểu.
 * Chỉ lộ ra khi mở trang thật.
 *
 * Quy tắc rút ra: helper thuần (không hook, không state) mà CẢ server lẫn
 * client cùng dùng thì phải nằm ở file KHÔNG có `"use client"`.
 */

// V4.1 Đợt 1a — thêm "qc": màn Chờ QC nhập kho (hàng nhận đang HOLD chờ QC).
export type MovementMode = "in" | "out" | "qc";

/** Chuẩn hoá query param `?mode=` → "in" (mặc định) | "out" | "qc". */
export function resolveMovementMode(
  raw: string | string[] | undefined,
): MovementMode {
  if (raw === "out") return "out";
  if (raw === "qc") return "qc";
  return "in";
}
