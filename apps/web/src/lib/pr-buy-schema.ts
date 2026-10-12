import { z } from "zod";

/**
 * M3 — SL cần mua do Kho chốt: lineId → số. KHÔNG coerce (null / "" / "abc" trước
 * đây bị ép thành 0 = coi như "không cần mua"); Infinity/NaN bị chặn. Thông báo tiếng Việt.
 */
export const buyQtysSchema = z.record(
  z.string().uuid("Mã dòng không hợp lệ."),
  z
    .number({
      invalid_type_error: "SL cần mua phải là số (không để trống).",
      required_error: "SL cần mua phải là số (không để trống).",
    })
    .finite("SL cần mua phải là số hữu hạn.")
    .min(0, "SL cần mua không được âm.")
    .max(10_000_000, "SL cần mua quá lớn."),
);
