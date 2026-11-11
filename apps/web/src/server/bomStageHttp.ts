import { NextResponse } from "next/server";
import { stageErrorMessage } from "@/lib/bom-stage-journey";
import type { StageErrorCode } from "@/server/repos/bomStageMoves";

/** Lỗi sổ bước → HTTP: NOT_FOUND 404, ALREADY_REVERSED 409, còn lại 422 {code, message}. */
export function stageErrorResponse(
  code: StageErrorCode,
  extra?: Record<string, unknown>,
) {
  const status = code === "NOT_FOUND" ? 404 : code === "ALREADY_REVERSED" ? 409 : 422;
  const message = stageErrorMessage(code);
  return NextResponse.json(
    { code, message, ...(extra ?? {}), error: { code, message } },
    { status },
  );
}
