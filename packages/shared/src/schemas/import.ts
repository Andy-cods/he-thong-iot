import { z } from "zod";
import { IMPORT_DUPLICATE_MODES } from "../constants";

export const importDuplicateModeSchema = z.enum(IMPORT_DUPLICATE_MODES);

export const importCheckSchema = z.object({
  fileHash: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i, "fileHash phải là SHA-256 hex 64 ký tự"),
  fileName: z.string().trim().min(1).max(255),
  fileSizeBytes: z.coerce.number().int().nonnegative().max(20 * 1024 * 1024),
});

export const importCommitSchema = z.object({
  duplicateMode: importDuplicateModeSchema.default("skip"),
});

export type ImportCheckInput = z.infer<typeof importCheckSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;
