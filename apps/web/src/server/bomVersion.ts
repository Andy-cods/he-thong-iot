import { NextResponse } from "next/server";

/**
 * BOM V5 / WP2 — body 409 chuẩn khi `expectedVersion` lệch `row_version`.
 * Giữ cả dạng lỗi chung `{error:{code,message,details}}` (client `request()`
 * đọc được) lẫn `{code:'VERSION_CONFLICT', current}` theo hợp đồng WP2.
 */
export function versionConflictResponse(current: Record<string, unknown>) {
  return NextResponse.json(
    {
      error: {
        code: "VERSION_CONFLICT",
        message: "Dòng này vừa được người khác sửa.",
        details: current,
      },
      code: "VERSION_CONFLICT",
      current,
    },
    { status: 409 },
  );
}
