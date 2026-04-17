import { z } from "zod";

const optionalTrim = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : (v ?? null)));

export const supplierCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Bắt buộc")
    .max(64, "Tối đa 64 ký tự")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Bắt buộc").max(255),
  contactName: optionalTrim(255),
  phone: optionalTrim(32),
  email: z
    .string()
    .trim()
    .max(255)
    .email({ message: "Email không hợp lệ" })
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  address: optionalTrim(2000),
  taxCode: optionalTrim(32),
});

export const supplierUpdateSchema = supplierCreateSchema
  .omit({ code: true })
  .partial()
  .extend({
    isActive: z.coerce.boolean().optional(),
  });

export const supplierListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  isActive: z
    .union([z.enum(["true", "false"]), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return true;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const itemSupplierCreateSchema = z.object({
  supplierId: z.string().uuid("supplierId phải là UUID"),
  supplierSku: optionalTrim(128),
  vendorItemCode: optionalTrim(128),
  priceRef: z.coerce.number().nonnegative().optional().nullable(),
  currency: z
    .string()
    .trim()
    .max(8)
    .default("VND")
    .transform((v) => v.toUpperCase()),
  leadTimeDays: z.coerce.number().int().nonnegative().default(7),
  moq: z.coerce.number().positive().default(1),
  packSize: z.coerce.number().positive().default(1),
  isPreferred: z.coerce.boolean().default(false),
});

export const itemSupplierUpdateSchema = itemSupplierCreateSchema
  .omit({ supplierId: true })
  .partial();

export type SupplierCreate = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdate = z.infer<typeof supplierUpdateSchema>;
export type ItemSupplierCreate = z.infer<typeof itemSupplierCreateSchema>;
export type ItemSupplierUpdate = z.infer<typeof itemSupplierUpdateSchema>;
