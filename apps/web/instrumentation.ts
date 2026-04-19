/**
 * Next.js 14 instrumentation hook.
 *
 * File nằm ở root của `apps/web/` — Next.js tự pick up và gọi `register()`
 * một lần lúc process khởi động (cả dev + prod). Khác với middleware
 * `src/middleware.ts`, file này chỉ chạy ở Node.js runtime (không Edge).
 *
 * Ta lazy-import module telemetry để:
 *  1. Không kéo dependency nặng (auto-instrumentations ~40MB) vào Edge
 *     bundle của middleware/Edge routes.
 *  2. Nếu ENV chưa set → module vẫn load nhưng `startTelemetry()` early
 *     return → zero cost.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTelemetry } = await import("./src/lib/telemetry");
    startTelemetry();
  }
}
