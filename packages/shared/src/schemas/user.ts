import { z } from "zod";
import { ROLES } from "../types";

export const USERNAME_REGEX = /^[a-z0-9][a-z0-9_.\-]{2,63}$/;
export const PASSWORD_MIN_LENGTH = 8;

export const roleSchema = z.enum(ROLES);

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username tối thiểu 3 ký tự")
    .max(64)
    .refine((v) => USERNAME_REGEX.test(v), {
      message: "Username chỉ chứa a-z, 0-9, _.- (bắt đầu bằng chữ/số)",
    }),
  fullName: z.string().trim().min(1, "Họ tên bắt buộc").max(255),
  email: z.string().trim().email("Email không hợp lệ").optional().or(z.literal("")),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`)
    .max(128),
  roles: z.array(roleSchema).min(1, "Phải chọn ít nhất 1 vai trò"),
});

export const userUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  isActive: z.coerce.boolean().optional(),
  roles: z.array(roleSchema).optional(),
});

export const userListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  isActive: z
    .union([z.enum(["true", "false"]), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const strongPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`)
  .max(128)
  .refine(
    (v) => /[a-z]/.test(v) && /[A-Z0-9]/.test(v),
    "Mật khẩu cần ít nhất 1 chữ thường và 1 chữ hoa hoặc chữ số",
  );

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Thiếu mật khẩu hiện tại"),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().optional(),
  })
  .refine(
    (v) => v.confirmPassword === undefined || v.confirmPassword === v.newPassword,
    {
      path: ["confirmPassword"],
      message: "Mật khẩu xác nhận không khớp",
    },
  )
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ["newPassword"],
    message: "Mật khẩu mới phải khác mật khẩu cũ",
  });

export const resetPasswordSchema = z.object({
  newPassword: strongPasswordSchema,
});

export const auditListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  entity: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  action: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  actorUsername: z.string().trim().max(64).optional(),
  userId: z.string().uuid().optional(),
  /** V1.7-beta.2.6 — filter theo objectId (UUID) để load audit trail của 1 entity. */
  objectId: z.string().uuid().optional(),
  from: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  to: z
    .string()
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type ResetPassword = z.infer<typeof resetPasswordSchema>;
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
