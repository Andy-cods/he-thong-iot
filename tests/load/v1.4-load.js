// =============================================================
// V1.4 Phase G — k6 load test 100 VU × 5 endpoint × 5 phút
//
// Chạy local:
//   LOAD_TEST_URL=http://localhost:3001 k6 run tests/load/v1.4-load.js
//
// Chạy CI (GitHub Actions):
//   LOAD_TEST_URL=https://staging.iot.domain.vn k6 run --out json=result.json tests/load/v1.4-load.js
//
// Seed 100 test user trước khi chạy:
//   psql $DATABASE_URL < tests/load/setup-test-users.sql
// =============================================================
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { randomIntBetween } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const errorRate = new Rate("errors");
const loginTrend = new Trend("login_duration");

const BASE_URL = __ENV.LOAD_TEST_URL || "http://localhost:3000";
const USER_COUNT = Number(__ENV.USER_COUNT || 100);
const PASSWORD = __ENV.LOAD_TEST_PASSWORD || "Loadtest!234";

// 100 VU constant arrival rate trong 5 phút (core scenario), 1 phút ramp up/down.
export const options = {
  scenarios: {
    steady_100vu: {
      executor: "constant-vus",
      vus: 100,
      duration: "5m",
      gracefulStop: "30s",
    },
  },
  thresholds: {
    // Global p95 < 500ms (GET heavy endpoints)
    "http_req_duration": ["p(95)<500"],
    // Login cho phép chậm hơn (argon2 19_456KB memory cost → ~300ms/req)
    "http_req_duration{endpoint:login}": ["p(95)<1500"],
    // Error rate toàn bộ < 1%
    "http_req_failed": ["rate<0.01"],
    "errors": ["rate<0.01"],
  },
};

// ---- Helpers ----
function pickUser(vu, iter) {
  // Deterministic: mỗi VU 1 user → giảm login conflict, tăng cache warm.
  const idx = ((vu - 1) % USER_COUNT) + 1;
  return {
    username: `loadtest-${String(idx).padStart(3, "0")}`,
    password: PASSWORD,
  };
}

function loginAndGetCookie(user) {
  const t0 = Date.now();
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    {
      headers: { "content-type": "application/json" },
      tags: { endpoint: "login" },
    },
  );
  loginTrend.add(Date.now() - t0);
  check(res, { "login 200": (r) => r.status === 200 }) ||
    errorRate.add(1) || errorRate.add(0);
  // Parse set-cookie
  const setCookie = res.headers["Set-Cookie"] || "";
  const m = setCookie.match(/iot_session=([^;]+)/);
  return m ? m[1] : null;
}

// ---- Setup: đảm bảo BASE_URL live + sinh 1 cookie admin để verify ----
export function setup() {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, { "health 200": (r) => r.status === 200 });
  return { startedAt: new Date().toISOString() };
}

// ---- VU default function: mix 5 endpoint theo tỉ lệ ----
// GET /api/items                40%
// GET /api/bom/templates        20%
// GET /api/orders               20%
// GET /api/dashboard/overview   10%
// POST /api/auth/login          10%
const ENDPOINT_MIX = [
  { weight: 40, kind: "items" },
  { weight: 20, kind: "bom_templates" },
  { weight: 20, kind: "orders" },
  { weight: 10, kind: "dashboard" },
  { weight: 10, kind: "login" },
];
const TOTAL_WEIGHT = ENDPOINT_MIX.reduce((s, e) => s + e.weight, 0);

function pickEndpoint() {
  const r = randomIntBetween(1, TOTAL_WEIGHT);
  let acc = 0;
  for (const e of ENDPOINT_MIX) {
    acc += e.weight;
    if (r <= acc) return e.kind;
  }
  return "items";
}

// VU state: login 1 lần đầu, reuse cookie toàn bộ iteration còn lại.
let cachedCookie = null;

export default function () {
  // Mỗi VU login 1 lần (warm), sau đó 100% iteration reuse cookie.
  if (!cachedCookie) {
    const user = pickUser(__VU, __ITER);
    cachedCookie = loginAndGetCookie(user);
    if (!cachedCookie) {
      errorRate.add(1);
      sleep(1);
      return;
    }
  }

  const cookieHeader = { Cookie: `iot_session=${cachedCookie}` };
  const kind = pickEndpoint();

  let res;
  switch (kind) {
    case "items":
      res = http.get(`${BASE_URL}/api/items?q=bu&pageSize=50`, {
        headers: cookieHeader,
        tags: { endpoint: "items" },
      });
      check(res, { "items 200": (r) => r.status === 200 });
      errorRate.add(res.status !== 200);
      break;

    case "bom_templates":
      res = http.get(`${BASE_URL}/api/bom/templates?pageSize=20`, {
        headers: cookieHeader,
        tags: { endpoint: "bom_templates" },
      });
      check(res, { "bom 200": (r) => r.status === 200 });
      errorRate.add(res.status !== 200);
      break;

    case "orders":
      res = http.get(`${BASE_URL}/api/orders?pageSize=20`, {
        headers: cookieHeader,
        tags: { endpoint: "orders" },
      });
      check(res, { "orders 200": (r) => r.status === 200 });
      errorRate.add(res.status !== 200);
      break;

    case "dashboard":
      res = http.get(`${BASE_URL}/api/dashboard/overview`, {
        headers: cookieHeader,
        tags: { endpoint: "dashboard" },
      });
      check(res, { "dashboard 200": (r) => r.status === 200 });
      errorRate.add(res.status !== 200);
      break;

    case "login":
      // 10% iteration vẫn hit login để stress argon2
      const user = pickUser(__VU, __ITER);
      const c = loginAndGetCookie(user);
      if (c) cachedCookie = c; // refresh cookie khi success
      break;
  }

  sleep(randomIntBetween(1, 3));
}

// ---- Teardown: log summary ----
export function teardown(data) {
  // eslint-disable-next-line no-console
  console.log(`Load test finished — started at ${data.startedAt}`);
}
