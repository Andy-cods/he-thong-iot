#!/usr/bin/env node
// =====================================================================
// TASK-notify-realtime — Thử tải SSE /api/notifications/stream
// =====================================================================
// Mở N kết nối SSE đồng thời (tài khoản loadtest-*, tối đa 5 stream/người —
// đúng giới hạn server), phát M thông báo thật (POST /api/purchase-requests
// — PR_SUBMITTED fan-out tới role warehouse+admin, roundtrip thật qua
// notifications.ts → publishNotifyEvent → Redis pub/sub → notify-stream.ts),
// đo độ trễ p50/p95/max TỪ LÚC API trả về TỚI LÚC client SSE nhận, số sự
// kiện mất, RAM/CPU tiến trình server trước/sau, số kết nối Redis.
//
// Không dùng thư viện ngoài (fetch/EventSource thủ công bằng ReadableStream,
// Redis INFO đọc bằng raw TCP) — chạy được bằng `node` thuần, không cần cài gì.
//
// Chuẩn bị (1 lần/staging):
//   DATABASE_URL=postgres://...staging... USER_COUNT=50 \
//     pnpm --filter @iot/db exec tsx ../../tests/load/setup-test-users.ts
//   → tạo loadtest-001..050 (mật khẩu mặc định Loadtest!234). Script này cần
//   các tài khoản đó CÓ role "warehouse" (hoặc role khác nằm trong target
//   của PR_SUBMITTED) để thật sự nhận được thông báo — gán 1 lần bằng SQL:
//     INSERT INTO app.user_role (user_id, role_id)
//     SELECT ua.id, r.id FROM app.user_account ua, app.role r
//     WHERE ua.username LIKE 'loadtest-%' AND r.code = 'warehouse'
//     ON CONFLICT DO NOTHING;
//
// Chạy:
//   BASE=http://localhost:3500 N=50  M=20 SERVER_PID=12345 \
//     REDIS_URL=redis://127.0.0.1:16379/5 node tests/load/notify-sse.mjs
//   BASE=http://localhost:3500 N=200 M=20 SERVER_PID=12345 \
//     REDIS_URL=redis://127.0.0.1:16379/5 node tests/load/notify-sse.mjs
//
// SERVER_PID (PID tiến trình `next start`) + REDIS_URL là TUỲ CHỌN — thiếu
// thì script vẫn chạy, chỉ bỏ qua phần đo RSS/CPU/Redis connected_clients.
// =====================================================================

import net from "node:net";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE;
if (!BASE) {
  console.error(
    "[load] Thiếu biến môi trường BASE bắt buộc. Ví dụ:\n" +
      "  BASE=http://localhost:3500 N=50 M=20 node tests/load/notify-sse.mjs\n",
  );
  process.exit(1);
}

const N = Number(process.env.N ?? 50);
const M = Number(process.env.M ?? 20);
const MAX_STREAMS_PER_USER = 5; // PHẢI khớp notify-stream-registry.ts
const USER_PREFIX = process.env.LOAD_USER_PREFIX ?? "loadtest-";
const USER_PASSWORD = process.env.LOAD_USER_PASSWORD ?? "Loadtest!234";
const USER_DIGITS = Number(process.env.LOAD_USER_DIGITS ?? 3);
const ACTOR_USERNAME = process.env.ACTOR_USERNAME ?? "admin";
const ACTOR_PASSWORD = process.env.ACTOR_PASSWORD ?? "ChangeMe!234";
const WAIT_PER_ROUND_MS = Number(process.env.WAIT_PER_ROUND_MS ?? 3000);
const SERVER_PID = process.env.SERVER_PID ? Number(process.env.SERVER_PID) : null;
const REDIS_URL = process.env.REDIS_URL ?? null;

const fmtUser = (i) => `${USER_PREFIX}${String(i).padStart(USER_DIGITS, "0")}`;

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`login ${username} thất bại: HTTP ${res.status} ${await res.text()}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error(`login ${username}: response thiếu set-cookie`);
  return setCookie.split(";")[0];
}

/** RSS (bytes) + CPU time (giây) của tiến trình server — Windows (PowerShell). */
function processStats(pid) {
  if (!pid) return null;
  try {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-Process -Id ${pid} | Select-Object WorkingSet64,CPU | ConvertTo-Json -Compress)`,
      ],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(out.trim());
    return { rssMB: parsed.WorkingSet64 / 1024 / 1024, cpuSeconds: parsed.CPU ?? 0 };
  } catch (err) {
    console.warn(`[load] Không đọc được process stats cho PID ${pid}: ${err.message}`);
    return null;
  }
}

/** connected_clients hiện tại của Redis — raw TCP, không cần thư viện ioredis. */
function redisConnectedClients(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    let u;
    try {
      u = new URL(url);
    } catch {
      return resolve(null);
    }
    const socket = net.createConnection(
      { host: u.hostname, port: Number(u.port || 6379), timeout: 3000 },
      () => socket.write("INFO clients\r\n"),
    );
    let buf = "";
    const done = (v) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    socket.on("data", (d) => {
      buf += d.toString("utf8");
      const m = /connected_clients:(\d+)/.exec(buf);
      if (m) done(Number(m[1]));
    });
    socket.on("error", () => done(null));
    socket.on("timeout", () => done(null));
  });
}

/** SSE client thủ công: fetch + ReadableStream reader (không cần EventSource/thư viện). */
function openStream(cookie, onEvent) {
  const ac = new AbortController();
  const state = { connected: false, closed: false, eventCount: 0, error: null };
  const promise = (async () => {
    try {
      const res = await fetch(`${BASE}/api/notifications/stream`, {
        headers: { Cookie: cookie },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (chunk.startsWith(": connected")) {
            state.connected = true;
          } else if (chunk.startsWith("event:")) {
            state.eventCount++;
            onEvent(Date.now());
          }
          // ": heartbeat" / "retry:" — bỏ qua, không phải sự kiện nghiệp vụ.
        }
      }
    } catch (err) {
      if (!state.closed && err?.name !== "AbortError") state.error = err;
    }
  })();
  return {
    state,
    promise,
    close: () => {
      state.closed = true;
      ac.abort();
    },
  };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function main() {
  console.log(`[load] BASE=${BASE} N=${N} M=${M} (tối đa ${MAX_STREAMS_PER_USER} stream/người)`);
  const numUsers = Math.min(50, Math.max(1, Math.ceil(N / MAX_STREAMS_PER_USER)));
  console.log(`[load] Cần ${numUsers} tài khoản ${USER_PREFIX}* để mở ${N} stream.`);

  console.log("[load] Đăng nhập...");
  const actorCookie = await login(ACTOR_USERNAME, ACTOR_PASSWORD);
  const userCookies = [];
  for (let i = 1; i <= numUsers; i++) {
    userCookies.push(await login(fmtUser(i), USER_PASSWORD));
  }
  console.log(`[load] Đăng nhập xong: actor=${ACTOR_USERNAME} + ${numUsers} user nhận.`);

  const statsBefore = processStats(SERVER_PID);
  const redisBefore = await redisConnectedClients(REDIS_URL);
  if (statsBefore) {
    console.log(
      `[load] Server TRƯỚC khi mở stream: RSS=${statsBefore.rssMB.toFixed(1)}MB CPU=${statsBefore.cpuSeconds.toFixed(1)}s`,
    );
  }
  if (redisBefore != null) console.log(`[load] Redis connected_clients TRƯỚC: ${redisBefore}`);

  console.log(`[load] Mở ${N} kết nối SSE...`);
  const receivedTimestamps = [];
  const streams = [];
  for (let i = 0; i < N; i++) {
    streams.push(openStream(userCookies[i % numUsers], (ts) => receivedTimestamps.push(ts)));
  }

  const connectDeadline = Date.now() + 15_000;
  let connectedCount = 0;
  while (Date.now() < connectDeadline) {
    connectedCount = streams.filter((s) => s.state.connected).length;
    if (connectedCount === N) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`[load] Đã kết nối ${connectedCount}/${N} stream.`);
  const errored = streams.filter((s) => s.state.error).length;
  if (errored > 0) console.warn(`[load] ${errored} stream lỗi khi mở/đọc — xem log phía trên.`);
  if (connectedCount < N) {
    console.warn(`[load] CẢNH BÁO: ${N - connectedCount} stream KHÔNG kết nối được trong 15s.`);
  }

  const statsAfterConnect = processStats(SERVER_PID);
  if (statsAfterConnect && statsBefore) {
    console.log(
      `[load] Server SAU KHI MỞ ${N} stream: RSS=${statsAfterConnect.rssMB.toFixed(1)}MB ` +
        `(Δ ${(statsAfterConnect.rssMB - statsBefore.rssMB).toFixed(1)}MB)`,
    );
  }
  const redisAfterConnect = await redisConnectedClients(REDIS_URL);
  if (redisAfterConnect != null) {
    console.log(
      `[load] Redis connected_clients SAU KHI MỞ stream: ${redisAfterConnect} ` +
        `(kỳ vọng ~không đổi theo N — server dùng 1 subscriber dùng chung/tiến trình)`,
    );
  }

  console.log(`[load] Tìm itemId hợp lệ để tạo PR test tải...`);
  const itemsRes = await fetch(`${BASE}/api/items?limit=1`, { headers: { Cookie: actorCookie } });
  const itemsBody = await itemsRes.json().catch(() => null);
  const itemId = itemsBody?.data?.[0]?.id;
  if (!itemId) throw new Error("Không tìm được itemId — DB test cần có ít nhất 1 item.");

  console.log(`[load] Phát ${M} thông báo thật (POST /api/purchase-requests)...`);
  const latencies = [];
  let missed = 0;
  for (let j = 0; j < M; j++) {
    const beforeLen = receivedTimestamps.length;
    const res = await fetch(`${BASE}/api/purchase-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: actorCookie },
      body: JSON.stringify({
        title: `[LOADTEST-SSE] round ${j + 1}/${M}`,
        source: "MANUAL",
        notes: "[LOADTEST-SSE] an toàn để xoá — sinh bởi tests/load/notify-sse.mjs",
        lines: [{ itemId, qty: 1, notes: "loadtest" }],
      }),
    });
    const tSent = Date.now(); // mốc "API trả về" — đúng theo yêu cầu đo độ trễ
    if (!res.ok) {
      console.warn(`[load] round ${j + 1}/${M}: tạo PR thất bại HTTP ${res.status}`);
      continue;
    }
    await res.json().catch(() => {});

    const deadline = Date.now() + WAIT_PER_ROUND_MS;
    while (Date.now() < deadline && receivedTimestamps.length - beforeLen < connectedCount) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const got = receivedTimestamps.slice(beforeLen);
    for (const ts of got) latencies.push(ts - tSent);
    if (got.length < connectedCount) {
      const gap = connectedCount - got.length;
      missed += gap;
      console.warn(`[load] round ${j + 1}/${M}: nhận ${got.length}/${connectedCount} sự kiện (thiếu ${gap})`);
    }
  }

  console.log(`[load] Đóng ${N} stream...`);
  streams.forEach((s) => s.close());
  await Promise.allSettled(streams.map((s) => s.promise));
  await new Promise((r) => setTimeout(r, 1500)); // để server dọn registry/GC trước khi đo lại

  const statsAfter = processStats(SERVER_PID);
  const redisAfter = await redisConnectedClients(REDIS_URL);

  console.log("\n================ KẾT QUẢ ================");
  console.log(`N (stream yêu cầu / kết nối được) : ${N} / ${connectedCount}`);
  console.log(`M (số thông báo phát)             : ${M}`);
  console.log(`Tổng sự kiện kỳ vọng              : ${M * connectedCount}`);
  console.log(`Tổng sự kiện nhận được            : ${latencies.length}`);
  console.log(`Số sự kiện MẤT                    : ${missed}`);
  console.log(`Độ trễ p50                        : ${percentile(latencies, 50)}ms`);
  console.log(`Độ trễ p95                        : ${percentile(latencies, 95)}ms`);
  console.log(`Độ trễ max                        : ${latencies.length ? Math.max(...latencies) : 0}ms`);
  if (statsBefore && statsAfter) {
    console.log(`RSS server TRƯỚC / SAU            : ${statsBefore.rssMB.toFixed(1)}MB / ${statsAfter.rssMB.toFixed(1)}MB (Δ ${(statsAfter.rssMB - statsBefore.rssMB).toFixed(1)}MB)`);
    console.log(`CPU server TRƯỚC / SAU            : ${statsBefore.cpuSeconds.toFixed(1)}s / ${statsAfter.cpuSeconds.toFixed(1)}s (Δ ${(statsAfter.cpuSeconds - statsBefore.cpuSeconds).toFixed(1)}s)`);
  } else {
    console.log("RSS/CPU server                    : (bỏ qua — thiếu SERVER_PID)");
  }
  if (redisBefore != null && redisAfter != null) {
    console.log(`Redis connected_clients TRƯỚC/SAU : ${redisBefore} / ${redisAfter}`);
  } else {
    console.log("Redis connected_clients           : (bỏ qua — thiếu REDIS_URL)");
  }
  console.log("===========================================\n");

  if (missed > 0 || connectedCount < N) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[load] FAIL:", err);
  process.exit(1);
});
