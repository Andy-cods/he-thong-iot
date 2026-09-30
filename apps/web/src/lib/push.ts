"use client";

/**
 * TASK-notify V4.4 — client util cho Web Push (VAPID). Tách khỏi component
 * để test được phần thuần (urlBase64ToUint8Array) và tái dùng ở nhiều nơi
 * (trang /notifications, menu người dùng…).
 *
 * Đăng ký service worker (`/sw.js` — file tĩnh CHỈ xử lý push, xem
 * apps/web/public/sw.js) và xin quyền Notification CHỈ khi gọi enablePush(),
 * KHÔNG tự động lúc import/mount — đúng yêu cầu "xin quyền đúng lúc người
 * dùng bấm, không tự bật popup khi vào trang".
 */

export type PushPermissionState = "unsupported" | "default" | "granted" | "denied";

export function getPushSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

export function getPushPermissionState(): PushPermissionState {
  if (!getPushSupport()) return "unsupported";
  return Notification.permission as PushPermissionState;
}

/** VAPID public key (base64url, chuẩn W3C) → Uint8Array cho applicationServerKey. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = typeof atob !== "undefined" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export interface PushPublicKeyInfo {
  configured: boolean;
  publicKey: string | null;
}

export async function fetchPushPublicKey(): Promise<PushPublicKeyInfo> {
  try {
    const res = await fetch("/api/push/public-key", { credentials: "include" });
    if (!res.ok) return { configured: false, publicKey: null };
    const json = await res.json();
    return json.data as PushPublicKeyInfo;
  } catch {
    return { configured: false, publicKey: null };
  }
}

export type EnablePushResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "not_configured" | "denied" | "default" | "error" };

/** Đã có subscription đang hoạt động trên thiết bị này chưa. */
export async function getActivePushEndpoint(): Promise<string | null> {
  if (!getPushSupport()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

/** Đăng ký service worker + xin quyền + subscribe + báo server. Idempotent. */
export async function enablePush(): Promise<EnablePushResult> {
  if (!getPushSupport()) return { ok: false, reason: "unsupported" };

  const { configured, publicKey } = await fetchPushPublicKey();
  if (!configured || !publicKey) return { ok: false, reason: "not_configured" };

  const permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, reason: "denied" };
  if (permission !== "granted") return { ok: false, reason: "default" };

  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "error" };
    }
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) return { ok: false, reason: "error" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Gỡ subscription trên thiết bị này + báo server xoá. */
export async function disablePush(): Promise<void> {
  if (!getPushSupport()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe();
  } catch {
    // Bỏ qua — nút bấm sẽ đọc lại trạng thái, không chặn UI.
  }
}
