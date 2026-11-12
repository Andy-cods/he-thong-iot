import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireCan } from "@/server/session";
import { ensureBomSubscriber } from "@/server/services/bom-events";
import { ensureNotifySubscriber } from "@/server/services/notify-stream";
import {
  registerRoomClient,
  unregisterRoomClient,
  type RoomClient,
} from "@/server/services/bom-room-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bom/templates/[id]/live — BOM V5 / WP9.
 *
 * SSE một chiều theo room templateId: event `bom` (dòng nào đổi — xem
 * bom-events.ts) + `presence` (ai đang xem). Quyền = read bomTemplate (401/403
 * qua requireCan). Cùng cơ chế với /api/notifications/stream: dùng subscriber
 * Redis dùng chung, heartbeat 20s, cleanup idempotent, tối đa 5 stream/người
 * (evict cũ nhất). Caddy: matcher riêng flush_interval -1 (deploy/Caddyfile).
 */
const HEARTBEAT_MS = 20_000;
const encoder = new TextEncoder();
const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;
  if (!UUID_RE.test(params.id)) {
    return new Response(
      JSON.stringify({ error: { code: "NOT_FOUND", message: "Không tìm thấy BOM." } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  ensureBomSubscriber(ensureNotifySubscriber());

  const { userId, fullName } = guard.session;
  const templateId = params.id;
  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // PHẢI idempotent: gọi từ abort, evict (quá 5 stream/người), cancel().
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        req.signal.removeEventListener("abort", cleanup);
        unregisterRoomClient(client);
        try {
          controller.close();
        } catch {
          /* đã đóng */
        }
      };

      const client: RoomClient = {
        id: randomUUID(),
        userId,
        userName: fullName,
        templateId,
        send: (event, data) => safeEnqueue(`event: ${event}\ndata: ${data}\n\n`),
        close: cleanup,
      };

      safeEnqueue("retry: 3000\n\n");
      safeEnqueue(": connected\n\n");
      registerRoomClient(client); // phát presence cho cả room (gồm client này)
      heartbeat = setInterval(() => safeEnqueue(": heartbeat\n\n"), HEARTBEAT_MS);
      req.signal.addEventListener("abort", cleanup, { once: true });
      cleanupFn = cleanup;
    },
    cancel() {
      cleanupFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
