// TASK-notify V4.4 — Service worker TỐI THIỂU, CHỈ cho Web Push.
//
// KHÔNG có "fetch" listener → KHÔNG cache offline, KHÔNG biến app thành PWA
// đầy đủ (chủ xưởng đã quyết định bỏ PWA trước đây — xem next.config.js).
// Chỉ đăng ký thủ công khi người dùng bấm "Bật thông báo trên thiết bị này"
// (apps/web/src/lib/push.ts) — không auto-register khi vào trang.
//
// File TĨNH, tự viết tay — KHÔNG phải Workbox generate (không có
// self.__WB_MANIFEST), nên an toàn commit vào repo.

self.addEventListener("install", () => {
  // Kích hoạt ngay, không chờ tab cũ đóng — service worker này không cache gì
  // nên không có rủi ro "đổi version giữa chừng" phải lo.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Thông báo", body: "", link: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Payload không phải JSON hợp lệ — giữ mặc định, không throw.
  }

  const title = payload.title || "Thông báo";
  const options = {
    body: payload.body || "",
    tag: payload.tag || undefined,
    // Gộp thông báo cùng tag (cùng chứng từ) thành 1 — không spam nhiều item
    // trùng khi 1 chứng từ được nhắc lại (xem notifications.ts upsertNotification).
    renotify: Boolean(payload.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { link: payload.link || "/" },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // Báo cho tab đang mở (nếu có) biết vừa nhận push — dùng để tự làm mới
      // danh sách thông báo ngay (không cần chờ poll 60s) + để test/Playwright
      // xác nhận push đã tới tận trình duyệt (không chỉ server gửi thành công).
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((list) => list.forEach((c) => c.postMessage({ type: "push-received", payload }))),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // Đã có tab mở đúng origin → focus + điều hướng bằng postMessage
          // (client.navigate không được hỗ trợ mọi trình duyệt cho tab đã mở).
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(link).catch(() => undefined);
            }
            return undefined;
          }
        }
        return self.clients.openWindow(link);
      }),
  );
});
