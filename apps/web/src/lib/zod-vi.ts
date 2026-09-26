import { z, ZodIssueCode, type ZodErrorMap } from "zod";

/**
 * V4.1 UI-28 (Đợt 6B, X9) — thông báo lỗi zod mặc định bằng tiếng Việt.
 * Trước đây form hiện "String must contain at least 1 character(s)" khi schema
 * không tự ghi message. Chỉ thay thông báo MẶC ĐỊNH — schema nào đã có message
 * riêng (phần lớn schema trong @iot/shared) vẫn giữ nguyên.
 */
export const viErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") {
        return { message: "Bắt buộc nhập." };
      }
      if (issue.expected === "number") return { message: "Phải là số." };
      if (issue.expected === "date") return { message: "Ngày không hợp lệ." };
      return { message: "Giá trị không hợp lệ." };
    case ZodIssueCode.too_small: {
      const n = Number(issue.minimum);
      if (issue.type === "string") {
        return { message: n <= 1 ? "Bắt buộc nhập." : `Tối thiểu ${n} ký tự.` };
      }
      if (issue.type === "number") {
        return { message: issue.inclusive ? `Phải ≥ ${n}.` : `Phải > ${n}.` };
      }
      if (issue.type === "array" || issue.type === "set") {
        return { message: `Chọn ít nhất ${n} mục.` };
      }
      return { message: "Giá trị quá nhỏ." };
    }
    case ZodIssueCode.too_big: {
      const n = Number(issue.maximum);
      if (issue.type === "string") return { message: `Tối đa ${n} ký tự.` };
      if (issue.type === "number") {
        return { message: issue.inclusive ? `Phải ≤ ${n}.` : `Phải < ${n}.` };
      }
      if (issue.type === "array" || issue.type === "set") {
        return { message: `Tối đa ${n} mục.` };
      }
      return { message: "Giá trị quá lớn." };
    }
    case ZodIssueCode.invalid_string:
      if (issue.validation === "email") return { message: "Email không hợp lệ." };
      if (issue.validation === "uuid") return { message: "Mã định danh không hợp lệ." };
      if (issue.validation === "url") return { message: "Đường dẫn không hợp lệ." };
      return { message: "Định dạng không hợp lệ." };
    case ZodIssueCode.invalid_enum_value:
      return { message: "Lựa chọn không hợp lệ." };
    case ZodIssueCode.invalid_date:
      return { message: "Ngày không hợp lệ." };
    case ZodIssueCode.not_multiple_of:
      return { message: `Phải là bội số của ${String(issue.multipleOf)}.` };
    default:
      return { message: ctx.defaultError };
  }
};

let installed = false;

/** Gắn 1 lần (idempotent) — gọi ở providers phía client. */
export function installZodVi(): void {
  if (installed) return;
  z.setErrorMap(viErrorMap);
  installed = true;
}
