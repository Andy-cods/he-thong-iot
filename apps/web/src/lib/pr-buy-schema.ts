import { z } from "zod";

/**
 * M3 — SL cần mua do Kho chốt: lineId → số. KHÔNG coerce (null / "" / "abc" trước
 * đây bị ép thành 0 = coi như "không cần mua"); Infinity/NaN bị chặn. Thông báo
 * tiếng Việt cụ thể (viết bằng superRefine để không bị errorMap chung ghi đè
 * thành "Bắt buộc nhập").
 */
const buyQty = z
  .unknown()
  .superRefine((v, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (typeof v !== "number") return bad("SL cần mua phải là số (không để trống).");
    if (!Number.isFinite(v)) return bad("SL cần mua phải là số hữu hạn.");
    if (v < 0) return bad("SL cần mua không được âm.");
    // m-a — nhỏ hơn 6 số lẻ (độ chính xác cột) mà > 0: không âm thầm làm tròn về 0 (= "không cần mua").
    if (v > 0 && v < 0.0001) return bad("SL cần mua tối thiểu 0,0001 (hoặc nhập 0 nếu không cần mua).");
    // N4 — tối đa 4 chữ số thập phân (khớp PO / nhận / xuất).
    if (Math.abs(Math.round(v * 1e4) / 1e4 - v) > 1e-9) return bad("SL cần mua tối đa 4 chữ số thập phân.");
    if (v > 10_000_000) return bad("SL cần mua quá lớn.");
  })
  .transform((v) => v as number);

export const buyQtysSchema = z.record(z.string().uuid("Mã dòng không hợp lệ."), buyQty);
