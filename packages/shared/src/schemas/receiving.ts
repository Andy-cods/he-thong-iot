import { z } from "zod";

export const RECEIVING_QC_STATUSES = ["OK", "NG", "PENDING"] as const;
export type ReceivingQcStatus = (typeof RECEIVING_QC_STATUSES)[number];

export const RECEIVING_QC_LABELS: Record<ReceivingQcStatus, string> = {
  OK: "Đạt",
  NG: "Không đạt",
  PENDING: "Chờ kiểm",
};

export const receivingEventSchema = z.object({
  id: z.string().uuid("ID sự kiện phải là UUID"),
  scanId: z.string().uuid("scanId phải là UUIDv7"),
  poCode: z.string().trim().min(1).max(64),
  sku: z.string().trim().min(1).max(128),
  qty: z.coerce.number().positive("Số lượng phải > 0"),
  lotNo: z.string().trim().max(128).optional().nullable(),
  qcStatus: z.enum(RECEIVING_QC_STATUSES).default("PENDING"),
  scannedAt: z.string().datetime({ message: "scannedAt phải ISO8601" }),
  rawCode: z.string().max(256).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Batch upload: FE gửi chunk 50. */
export const receivingEventsBatchSchema = z.object({
  events: z.array(receivingEventSchema).min(1).max(50),
});

export type ReceivingEvent = z.infer<typeof receivingEventSchema>;
export type ReceivingEventsBatch = z.infer<typeof receivingEventsBatchSchema>;
