"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";

/**
 * TASK-notify-realtime — hook SSE dùng CHUNG 1 kết nối cho mọi component
 * trong tab (singleton module-scope + ref-count, không phải Context — tránh
 * phải bọc Provider ở layout). Mỗi component gọi `useNotificationStream()`
 * chỉ "đăng ký quan tâm", không tự mở EventSource riêng.
 *
 * - Tự nối lại: dựa vào cơ chế reconnect gốc của EventSource (theo `retry:`
 *   server gửi) + backoff thủ công khi lỗi liên tục (tránh dí Redis lúc mất
 *   mạng dài) — tăng dần 1s → 2s → 4s… tối đa 30s, reset về 1s khi nối lại ok.
 * - Tắt hẳn trên trang đăng nhập (chưa có session) và tài khoản kiosk
 *   `display` thuần — khớp đúng guard phía server (`isDisplayKiosk`).
 * - Không gửi dữ liệu nhạy cảm qua đây — chỉ nhận tín hiệu rồi invalidate
 *   React Query (chuông) + phát window event cho các nơi KHÔNG dùng React
 *   Query (VD ActionItemsCard dùng fetch tay) tự refetch.
 */

export interface NotifyStreamPayload {
  kind: "new" | "read" | "read-all";
  notificationId?: string | null;
  category?: "action" | "update" | "reminder";
  title?: string;
}

export const NOTIFY_STREAM_WINDOW_EVENT = "iot:notify-stream-event";

type Listener = (connected: boolean) => void;

let es: EventSource | null = null;
let refCount = 0;
let connected = false;
let backoffMs = 1000;
const BACKOFF_MAX_MS = 30_000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const statusListeners = new Set<Listener>();

function setConnected(v: boolean) {
  if (connected === v) return;
  connected = v;
  statusListeners.forEach((l) => l(connected));
}

function dispatchEvent(payload: NotifyStreamPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotifyStreamPayload>(NOTIFY_STREAM_WINDOW_EVENT, { detail: payload }));
}

function teardown() {
  if (es) {
    es.close();
    es = null;
  }
  setConnected(false);
}

function connect() {
  if (es || typeof window === "undefined" || typeof EventSource === "undefined") return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const source = new EventSource("/api/notifications/stream", { withCredentials: true });
  es = source;

  source.onopen = () => {
    backoffMs = 1000; // nối được → reset backoff
    setConnected(true);
  };

  source.addEventListener("notify", (ev) => {
    const msgEvent = ev as MessageEvent<string>;
    try {
      const payload = JSON.parse(msgEvent.data) as NotifyStreamPayload;
      dispatchEvent(payload);
    } catch {
      /* ignore — payload hỏng, badge vẫn đồng bộ lại ở vòng poll an toàn */
    }
  });

  source.onerror = () => {
    setConnected(false);
    source.close();
    if (es === source) es = null;
    // SSE hỏng liên tục → tự backoff tăng dần thay vì để trình duyệt retry
    // dồn dập theo `retry:` cố định khi mạng/](server) đang có sự cố kéo dài.
    if (refCount > 0) {
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (refCount > 0) connect();
      }, delay);
    }
  };
}

/**
 * @param enabled false → hook không mở kết nối dù có session hợp lệ (dùng
 *   cho các trang không cần realtime, hoặc để component tự quyết định thêm
 *   điều kiện ngoài kiosk/login).
 */
export function useNotificationStream(enabled = true): boolean {
  const { data: session } = useSession();
  const [isConnected, setIsConnected] = React.useState(connected);

  // Khớp đúng guard server-side isDisplayKiosk(): role display thuần (không
  // kèm admin) → không mở SSE. Chưa có session (trang login, …) → cũng không mở.
  const roles = session?.roles ?? [];
  const isKiosk = roles.includes("display") && !roles.includes("admin");
  const shouldConnect = enabled && !!session && !isKiosk;

  React.useEffect(() => {
    if (!shouldConnect) return;
    refCount++;
    const listener: Listener = (v) => setIsConnected(v);
    statusListeners.add(listener);
    setIsConnected(connected);
    connect();
    return () => {
      refCount = Math.max(0, refCount - 1);
      statusListeners.delete(listener);
      if (refCount === 0) {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        teardown();
      }
    };
  }, [shouldConnect]);

  return shouldConnect && isConnected;
}

/**
 * Hook tiện ích: tự invalidate React Query ["notifications", ...] khi có
 * event mới — dùng ở NotificationBell. Component không dùng React Query
 * (ActionItemsCard) nên lắng nghe `NOTIFY_STREAM_WINDOW_EVENT` trực tiếp.
 */
export function useNotificationStreamInvalidate(enabled = true): boolean {
  const qc = useQueryClient();
  const connectedNow = useNotificationStream(enabled);

  React.useEffect(() => {
    if (!enabled) return;
    const handler = (ev: Event) => {
      const payload = (ev as CustomEvent<NotifyStreamPayload>).detail;
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      if (payload?.category === "action") {
        void qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
    };
    window.addEventListener(NOTIFY_STREAM_WINDOW_EVENT, handler);
    return () => window.removeEventListener(NOTIFY_STREAM_WINDOW_EVENT, handler);
  }, [enabled, qc]);

  return connectedNow;
}
