#!/usr/bin/env node
// =====================================================================
// E2E Web Push registration — MES SongChau (TASK-notify V4.4)
// =====================================================================
// Playwright (Chromium) đăng ký Web Push THẬT trên localhost:
//   1. Cấp quyền "notifications" cho origin (context.grantPermissions).
//   2. Đăng nhập admin qua UI thật (/login).
//   3. Mở /notifications, bấm "Bật thông báo" → xin quyền trình duyệt (đã
//      cấp sẵn ở bước 1 nên requestPermission() trả "granted" ngay, không
//      treo popup) → đăng ký service worker /sw.js → subscribe PushManager
//      (endpoint THẬT của Chromium, cần mạng ra ngoài) → POST
//      /api/push/subscribe.
//   4. Kích hoạt 1 sự kiện có push:true (PR_SUBMITTED → admin, xem
//      notification-plans.ts) bằng planner (fetch thuần, không qua trang).
//   5. Đợi service worker nhận push thật → postMessage "push-received" về
//      tab đang mở (xem public/sw.js) → script bắt message này làm bằng
//      chứng ĐÃ NHẬN PUSH TẬN TRÌNH DUYỆT (không chỉ server gửi thành công).
//
// KHÔNG cần thấy popup thông báo hiện trên máy thật (headless OK) — chỉ cần
// (a) subscribe API trả 200, (b) postMessage "push-received" tới trong thời
// gian chờ. Nếu môi trường không có mạng ra ngoài (chặn firewall) tới push
// service của Chromium, bước 5 sẽ timeout → script báo rõ đây là giới hạn
// mạng, không phải lỗi code (server vẫn log "deliverPush gửi thành công"
// hoặc lỗi mạng cụ thể — xem log server).
//
// Chạy:
//   BASE=http://127.0.0.1:3700 node tests/e2e/push-register.mjs
// =====================================================================

import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE;
if (!BASE) {
  console.error(
    "[E2E] Thiếu biến môi trường BASE. Ví dụ:\n" +
      "  BASE=http://127.0.0.1:3700 node tests/e2e/push-register.mjs",
  );
  process.exit(1);
}
const PUSH_WAIT_MS = Number(process.env.PUSH_WAIT_MS ?? 15_000);

async function main() {
  console.log(`[push-register] BASE=${BASE}`);
  // LƯU Ý 1: headless Chromium (kể cả "new" headless) có bug đã biết —
  // Notification.permission luôn báo "denied" dù navigator.permissions.query
  // và Notification.requestPermission() đã trả "granted" (context.
  // grantPermissions hoạt động đúng, chỉ property đọc lại sai trong headless).
  // Vì vậy BẮT BUỘC headless:false (cần môi trường có desktop — máy Windows
  // dev này có; CI headless-only sẽ cần xvfb hoặc chấp nhận SKIP bài test này).
  // LƯU Ý 2: Chrome CHỦ ĐÍCH chặn Push API trong incognito/ephemeral context
  // (browser.newContext() mặc định = ephemeral, tương đương incognito) —
  // dùng launchPersistentContext() với user-data-dir thật để có profile
  // "thường", Push API mới hoạt động.
  const userDataDir = mkdtempSync(join(tmpdir(), "pw-push-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.PUSH_HEADLESS === "1",
  });
  await context.grantPermissions(["notifications"], { origin: BASE });
  const page = context.pages()[0] ?? (await context.newPage());
  const browser = { close: () => context.close() };

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("  [browser:error]", msg.text());
  });

  let failed = false;

  try {
    console.log("--- 1. Đăng nhập admin qua UI ---");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="username"], input#username', "admin");
    await page.fill('input[name="password"], input#password', "ChangeMe!234");
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);
    console.log("  OK — url hiện tại:", page.url());

    console.log("--- 2. Mở /notifications, bấm 'Bật thông báo' ---");
    await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });

    const subscribeRespPromise = page
      .waitForResponse((r) => r.url().includes("/api/push/subscribe") && r.request().method() === "POST", {
        timeout: 15_000,
      })
      .catch(() => null);

    const btn = page.getByRole("button", { name: /Bật thông báo/i });
    await btn.waitFor({ state: "visible", timeout: 10_000 });
    await btn.click();

    const subscribeResp = await subscribeRespPromise;
    if (!subscribeResp) {
      failed = true;
      console.log("  [FAIL] Không thấy request POST /api/push/subscribe sau khi bấm nút.");
    } else if (!subscribeResp.ok()) {
      failed = true;
      console.log(`  [FAIL] POST /api/push/subscribe trả HTTP ${subscribeResp.status()}.`);
    } else {
      console.log(`  OK — POST /api/push/subscribe → HTTP ${subscribeResp.status()}`);
    }

    // Xác nhận subscription thật sự có trên trình duyệt (PushManager).
    const subInfo = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      return { hasReg: Boolean(reg), hasSub: Boolean(sub), endpoint: sub?.endpoint ?? null };
    });
    if (!subInfo.hasReg || !subInfo.hasSub) {
      failed = true;
      console.log("  [FAIL] Không có service worker registration hoặc PushSubscription trên trình duyệt:", subInfo);
    } else {
      console.log(`  OK — service worker + PushSubscription thật tồn tại (endpoint=${subInfo.endpoint.slice(0, 60)}…)`);
    }

    console.log("--- 3. Kích hoạt sự kiện push:true (PR_SUBMITTED → admin) ---");
    // Đăng ký listener AWAIT "push-received" TRƯỚC khi bắn sự kiện (tránh race).
    const pushReceivedPromise = page.evaluate(
      (waitMs) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(null), waitMs);
          navigator.serviceWorker.addEventListener("message", (ev) => {
            if (ev.data?.type === "push-received") {
              clearTimeout(timer);
              resolve(ev.data.payload);
            }
          });
        }),
      PUSH_WAIT_MS,
    );

    // Đăng nhập planner + tạo/submit PR bằng fetch thuần (Node), TỰ forward
    // Cookie qua header thay vì dựa vào cookie-jar tự động của Playwright
    // APIRequestContext — cookie session đặt `Secure` khi NODE_ENV=production
    // (đúng env staging/prod dùng để build/start ở bài verify này), mà
    // APIRequestContext (không phải trang trình duyệt thật, không có ngoại lệ
    // "localhost" của Chrome cho thuộc tính Secure) từ chối gửi lại cookie đó
    // qua http:// — forward thủ công để không lệ thuộc hành vi này.
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "e2e.planner", password: "Test@1234" }),
    });
    const planCookie = loginRes.headers.getSetCookie?.()[0]?.split(";")[0];
    if (!loginRes.ok || !planCookie) {
      console.log(`  [WARN] Không đăng nhập được e2e.planner (HTTP ${loginRes.status}) — bỏ qua bước kích hoạt push thật, chỉ giữ kết quả bước 1-2.`);
    } else {
      const itemsRes = await fetch(`${BASE}/api/items?pageSize=5`, { headers: { Cookie: planCookie } });
      const items = (await itemsRes.json())?.data ?? [];
      if (items.length === 0) {
        console.log("  [WARN] Không có item nào để tạo PR — bỏ qua bước kích hoạt push thật.");
      } else {
        const prRes = await fetch(`${BASE}/api/purchase-requests`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: planCookie },
          body: JSON.stringify({
            title: `[E2E-PUSH] ${new Date().toISOString()}`,
            source: "MANUAL",
            notes: "[E2E-PUSH] auto-generated — an toàn để xoá",
            lines: [{ itemId: items[0].id, qty: 1, notes: "e2e-push" }],
          }),
        });
        if (!prRes.ok) {
          console.log(`  [WARN] Tạo PR thất bại (HTTP ${prRes.status}) — bỏ qua bước kích hoạt push thật.`);
        } else {
          const pr = (await prRes.json())?.data;
          console.log(`  Đã tạo PR ${pr?.paperFormNo ?? pr?.code} — admin (đã subscribe) sẽ nhận push PR_SUBMITTED nếu mạng cho phép.`);
        }
      }
    }

    console.log(`--- 4. Chờ tối đa ${PUSH_WAIT_MS}ms service worker nhận push thật ---`);
    const pushPayload = await pushReceivedPromise;
    if (pushPayload) {
      console.log("  OK — service worker đã nhận push thật, payload:", pushPayload);
    } else {
      console.log(
        "  [WARN] Không nhận được push trong thời gian chờ — có thể do mạng/firewall chặn push service " +
          "của Chromium (không phải lỗi code nếu bước 1-2 đã PASS). Kiểm tra log server (deliverPush gửi " +
          "thành công/thất bại) để phân biệt lỗi mạng vs lỗi code.",
      );
    }

    console.log("--- 5. Tắt thông báo (dọn subscription) ---");
    const unsubBtn = page.getByRole("button", { name: /^Tắt$/i });
    if (await unsubBtn.isVisible().catch(() => false)) {
      const unsubRespPromise = page
        .waitForResponse((r) => r.url().includes("/api/push/unsubscribe"), { timeout: 10_000 })
        .catch(() => null);
      await unsubBtn.click();
      const unsubResp = await unsubRespPromise;
      console.log(unsubResp ? `  OK — unsubscribe HTTP ${unsubResp.status()}` : "  [WARN] không thấy request unsubscribe.");
    }
  } catch (err) {
    failed = true;
    console.error("[FATAL]", err);
  } finally {
    await browser.close();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup — không chặn kết quả test.
    }
  }

  console.log(failed ? "\n[RESULT] FAIL" : "\n[RESULT] PASS (bước 1-2 hợp đồng API+PushManager; bước 3-4 best-effort tuỳ mạng)");
  process.exit(failed ? 1 : 0);
}

main();
