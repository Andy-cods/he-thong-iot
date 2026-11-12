import { NextResponse } from "next/server";
import { stageErrorMessage } from "@/lib/bom-stage-journey";
import { SLIP_ERROR_MESSAGES, type SlipErrorCode } from "@/server/repos/deliverySlips";

/** Lỗi phiếu giao → HTTP: NOT_FOUND 404, ALREADY_REVERSED 409, còn lại 422 {code, message, error}. */
export function slipErrorResponse(code: SlipErrorCode, extra?: Record<string, unknown>) {
  const status = code === "NOT_FOUND" ? 404 : code === "ALREADY_REVERSED" ? 409 : 422;
  const message = SLIP_ERROR_MESSAGES[code] ?? stageErrorMessage(code);
  return NextResponse.json(
    { code, message, ...(extra ?? {}), error: { code, message } },
    { status },
  );
}
