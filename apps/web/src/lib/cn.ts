import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge className list — dùng clsx để gộp conditional rồi tailwind-merge
 * để khử conflict Tailwind class.
 *
 * Note: `lib/utils.ts` đã export cùng function này trước V1 redesign.
 * Giữ cả 2 file để đồng bộ với import path spec mới (`@/lib/cn`) trong
 * design-spec Direction B mà không phá code cũ.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
