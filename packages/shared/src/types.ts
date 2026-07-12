/**
 * Role cứng — khớp Drizzle enum trong packages/db.
 * V3.3: thêm "purchaser" (Bộ phận Thu mua) để tách quyền duyệt PR/PO khỏi planner.
 * V3.8: thêm "qc" (Tổ KCS/QC) — quản lý Bảng điều hành sản xuất (production board).
 * V3.8.2: thêm "display" — tài khoản kiosk TV, CHỈ xem /board (read-only), phiên 24h.
 * V3.9: thêm "accountant" (Bộ phận Kế toán) — nhận phiếu YCVT đã duyệt, tải PDF/Excel.
 * Mapping bộ phận:
 *   - planner    → engineer (Bộ phận Thiết kế)
 *   - purchaser  → Bộ phận Thu mua
 *   - warehouse  → Bộ phận Kho
 *   - operator   → Bộ phận Vận hành
 *   - qc         → Tổ QC/KCS (kiểm tra chất lượng + bảng sản xuất)
 *   - display    → Màn hình TV (chỉ xem bảng sản xuất, không sửa)
 *   - accountant → Bộ phận Kế toán (nhận YCVT đã duyệt, tải PDF/Excel)
 *   - admin      → toàn quyền
 */
export const ROLES = ["admin", "planner", "warehouse", "operator", "purchaser", "qc", "display", "accountant"] as const;
export type Role = (typeof ROLES)[number];

/** JWT access token payload (tối thiểu). */
export interface JwtPayload {
  /** User UUID. */
  sub: string;
  /** Username (human-readable). */
  usr: string;
  /** Roles đã gán. */
  roles: Role[];
  /** Issued at (seconds since epoch). */
  iat: number;
  /** Expires at (seconds since epoch). */
  exp: number;
  /** V1.4: session row id để revoke / list. Optional cho JWT cũ. */
  sid?: string;
}

/** Session context mà mọi handler auth-protected nhận. */
export interface SessionContext {
  userId: string;
  username: string;
  roles: Role[];
  /** Có role nào trong danh sách không. */
  hasRole(...anyOf: Role[]): boolean;
  /** Có phải admin không. */
  isAdmin(): boolean;
}

/** Shape response login + /me. */
export interface AuthMeResponse {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  roles: Role[];
}

/** Shape chung cho API error (tiếng Việt). */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export const isRole = (v: unknown): v is Role =>
  typeof v === "string" && (ROLES as readonly string[]).includes(v);
