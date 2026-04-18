import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";

/** Trích metadata chuẩn (requestId, IP, UA) từ Next request. */
export function extractRequestMeta(req: NextRequest) {
  const headers = req.headers;
  return {
    requestId:
      headers.get("x-request-id") ??
      headers.get("x-correlation-id") ??
      null,
    ipAddress:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headers.get("x-real-ip") ??
      null,
    userAgent: headers.get("user-agent") ?? null,
  };
}

/** Map ZodError → shape API error chuẩn. */
export function zodErrorResponse(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_";
    if (!fields[path]) fields[path] = issue.message;
  }
  return NextResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Dữ liệu không hợp lệ.",
        fields,
      },
    },
    { status: 422 },
  );
}

export async function parseJson<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<{ data: z.output<S> } | { response: NextResponse }> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { response: zodErrorResponse(parsed.error) };
  return { data: parsed.data };
}

export function parseSearchParams<S extends z.ZodTypeAny>(
  req: NextRequest,
  schema: S,
): { data: z.output<S> } | { response: NextResponse } {
  const entries: Record<string, string | string[]> = {};
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    const existing = entries[k];
    if (existing === undefined) {
      entries[k] = v;
    } else if (Array.isArray(existing)) {
      existing.push(v);
    } else {
      entries[k] = [existing, v];
    }
  }
  const parsed = schema.safeParse(entries);
  if (!parsed.success) return { response: zodErrorResponse(parsed.error) };
  return { data: parsed.data };
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}
