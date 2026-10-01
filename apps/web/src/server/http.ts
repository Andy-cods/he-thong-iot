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

/**
 * V4.5 QA-C P2-6 — RFC 4122 UUID (any version), dùng chung cho mọi route
 * `[id]` trước khi query DB. Trước đây gọi vd `GET /api/work-orders/
 * not-a-uuid/reject` → Postgres ném lỗi cast "invalid input syntax for type
 * uuid", không route nào bắt riêng → lọt xuống 500 thô (body rỗng) thay vì
 * lỗi 400 sạch tiếng Việt.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * Kiểm `id` (param route `[id]`) đúng định dạng UUID TRƯỚC khi query DB.
 * Gọi ngay đầu handler: `const check = validateUuidParam(params.id); if
 * ("response" in check) return check.response;`
 */
export function validateUuidParam(
  id: unknown,
  label = "id",
): { ok: true } | { response: NextResponse } {
  if (isValidUuid(id)) return { ok: true };
  return {
    response: jsonError(
      "INVALID_ID",
      `Tham số "${label}" không đúng định dạng (phải là UUID).`,
      400,
    ),
  };
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

/**
 * Response 429 chuẩn V1.4 — Rate limited.
 * Header Retry-After theo RFC 7231 (giây).
 */
export function tooManyRequests(retryAfter: number, message?: string) {
  return NextResponse.json(
    {
      error: {
        code: "RATE_LIMITED",
        message:
          message ??
          `Quá nhiều yêu cầu. Vui lòng thử lại sau ${retryAfter}s.`,
        details: { retryAfter },
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Retry-After": String(retryAfter),
      },
    },
  );
}
