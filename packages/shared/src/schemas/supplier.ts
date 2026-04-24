import { z } from "zod";

const optionalTrim = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : (v ?? null)));

/** V1.9 P7 — bank_info JSONB schema. */
export const bankInfoSchema = z
  .object({
    name: z.string().trim().max(120).optional().nullable(),
    account: z.string().trim().max(64).optional().nullable(),
    branch: z.string().trim().max(200).optional().nullable(),
  })
  .strict();

export type BankInfo = z.infer<typeof bankInfoSchema>;

/** V1.9 P7 — contact_persons JSONB array item schema. */
export const contactPersonSchema = z
  .object({
    name: z.string().trim().min(1, "Tên bắt buộc").max(120),
    role: z.string().trim().max(120).optional().nullable(),
    phone: z.string().trim().max(32).optional().nullable(),
    email: z
      .string()
      .trim()
      .max(255)
      .email("Email không hợp lệ")
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null)),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export const contactPersonsSchema = z.array(contactPersonSchema).max(20);

export type ContactPerson = z.infer<typeof contactPersonSchema>;

/** Regex SĐT VN loose: 9-11 chữ số, optional '+'/'0' đầu, cho phép dấu cách/- */
const phoneVNLoose = z
  .string()
  .trim()
  .max(32)
  .regex(/^[0-9+\-\s()]{6,20}$/, "Số điện thoại không hợp lệ")
  .optional()
  .nullable()
  .or(z.literal("").transform(() => null));

export const supplierCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Bắt buộc")
    .max(64, "Tối đa 64 ký tự")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Bắt buộc").max(255),
  contactName: optionalTrim(255),
  phone: phoneVNLoose,
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
  // V1.9 P7 — các field mới
  region: optionalTrim(100),
  city: optionalTrim(100),
  ward: optionalTrim(100),
  streetAddress: optionalTrim(2000),
  factoryAddress: optionalTrim(2000),
  latitude: z.coerce
    .number()
    .min(-90)
    .max(90)
    .optional()
    .nullable(),
  longitude: z.coerce
    .number()
    .min(-180)
    .max(180)
    .optional()
    .nullable(),
  website: z
    .string()
    .trim()
    .max(255)
    .url("URL không hợp lệ")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  bankInfo: bankInfoSchema.optional().nullable(),
  paymentTerms: optionalTrim(100),
  contactPersons: contactPersonsSchema.optional().nullable(),
  internalNotes: optionalTrim(4000),
});

export const supplierUpdateSchema = supplierCreateSchema
  .omit({ code: true })
  .partial()
  .extend({
    isActive: z.coerce.boolean().optional(),
  });

export const supplierListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  region: z.string().trim().max(100).optional(),
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
  sort: z.enum(["code", "name", "region", "createdAt"]).default("code"),
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
export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
export type ItemSupplierCreate = z.infer<typeof itemSupplierCreateSchema>;
export type ItemSupplierUpdate = z.infer<typeof itemSupplierUpdateSchema>;
