#!/usr/bin/env node
// =====================================================================
// E2E hồi quy V4.2 — kiểm các bản vá của đợt hoàn thiện trước vận hành.
// =====================================================================
// Bổ sung cho finance-flow.mjs (đã phủ tạo HĐ → trả 1 phần → trả đủ, chống
// đếm trùng, chống trả vượt). Script này kiểm riêng:
//   A. Huỷ 1 đợt thanh toán → HĐ quay lại đúng số đã trả + trạng thái; số dư
//      nguồn hoàn lại (P0: HĐ từng cộng cả tiền của đợt đã huỷ).
//   B. Không ngưng dùng được nguồn còn số dư — cả DELETE lẫn PATCH (P0).
//   C. 4 API sơ đồ kho chỉ admin/warehouse (planner → 403).
//   D. API mồ côi đã xoá (/api/eco) → 404.
//
// Dữ liệu tạo ra gắn tag [E2E-V42] và nằm trên 1 nguồn tiền test riêng —
// KHÔNG đụng nguồn tiền thật. Cuối script in danh sách id để dọn.
//
// Chạy: BASE=https://mes.songchau.vn node tests/e2e/v42-regression.mjs
// Exit 1 nếu có ca FAIL.
// =====================================================================

const BASE = process.env.BASE;
if (!BASE) {
  console.error("[E2E] Thiếu BASE. Ví dụ: BASE=https://mes.songchau.vn node tests/e2e/v42-regression.mjs");
  process.exit(1);
}
const TAG = "[E2E-V42]";
const STAMP = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(2, 14);
const USERS = {
  admin: { username: "admin", passwords: ["ChangeMe!234"] },
  planner: { username: "e2e.planner", passwords: ["Test@1234"] },
  warehouse: { username: "e2e.warehouse", passwords: ["Test@1234"] },
};

const jars = new Map();
const results = [];
const created = { accountId: null, invoiceId: null, paymentIds: [] };

function mergeCookies(jar, setCookies) {
  const map = new Map();
  for (const kv of (jar ?? "").split("; ").filter(Boolean)) {
    const i = kv.indexOf("=");
    if (i > 0) map.set(kv.slice(0, i), kv.slice(i + 1));
  }
  for (const sc of setCookies) {
    const first = sc.split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) map.set(first.slice(0, i), first.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(who, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (jars.get(who)) headers.Cookie = jars.get(who);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const sc = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  if (sc.length) jars.set(who, mergeCookies(jars.get(who), sc));
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function login(who) {
  for (const password of USERS[who].passwords) {
    jars.delete(who);
    const r = await call(who, "POST", "/api/auth/login", { username: USERS[who].username, password });
    if (r.status === 200) return true;
  }
  return false;
}

function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${id} — ${detail}`);
}

const errCode = (b) => b?.error?.code ?? b?.code ?? "";
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + (7 * 3600 + n * 86400) * 1000).toISOString().slice(0, 10);

async function accountBalance(id) {
  const r = await call("admin", "GET", `/api/finance/accounts/${id}`);
  return Number(r.body?.data?.currentBalance ?? NaN);
}
async function invoiceState(id) {
  const r = await call("admin", "GET", `/api/finance/invoices/${id}`);
  const d = r.body?.data?.invoice ?? r.body?.data;
  return { paid: Number(d?.paidAmount ?? NaN), status: d?.status };
}

async function main() {
  for (const who of Object.keys(USERS)) {
    check(`LOGIN ${who}`, await login(who), USERS[who].username);
  }

  // ── A + B dùng 1 nguồn tiền test riêng ─────────────────────────────
  const acc = await call("admin", "POST", "/api/finance/accounts", {
    code: `E2E${STAMP}`,
    name: `${TAG} Nguồn test`,
    type: "BANK",
    openingBalance: 50_000_000,
    openingBalanceDate: today,
  });
  created.accountId = acc.body?.data?.id ?? null;
  check("A0 tạo nguồn test", acc.status === 201 || acc.status === 200, `HTTP ${acc.status} ${errCode(acc.body)}`);
  if (!created.accountId) return;

  const inv = await call("admin", "POST", "/api/finance/invoices", {
    invoiceNo: `E2E-V42-${STAMP}`,
    direction: "IN",
    issueDate: today,
    dueDate: plusDays(30),
    subtotalAmount: 10_000_000,
    vatRate: 10,
    vatAmount: 1_000_000,
    totalAmount: 11_000_000,
    notes: `${TAG} HĐ mua test`,
  });
  created.invoiceId = inv.body?.data?.id ?? null;
  check("A1 tạo HĐ mua 11tr", !!created.invoiceId, `HTTP ${inv.status} ${errCode(inv.body)}`);
  if (!created.invoiceId) return;

  const pay = async (amount) => {
    const r = await call("admin", "POST", "/api/finance/payments", {
      direction: "OUT",
      accountId: created.accountId,
      paymentDate: today,
      totalAmount: amount,
      notes: `${TAG} trả ${amount}`,
      allocations: [{ invoiceId: created.invoiceId, amount }],
    });
    const id = r.body?.data?.payment?.id ?? r.body?.data?.id ?? null;
    if (id) created.paymentIds.push(id);
    return { r, id };
  };

  const p1 = await pay(4_000_000);
  let s = await invoiceState(created.invoiceId);
  check("A2 trả đợt 1 4tr → PARTIAL", !!p1.id && s.paid === 4_000_000 && s.status === "PARTIAL", `paid=${s.paid} status=${s.status}`);

  const p2 = await pay(7_000_000);
  s = await invoiceState(created.invoiceId);
  check("A3 trả đợt 2 7tr → PAID", !!p2.id && s.paid === 11_000_000 && s.status === "PAID", `paid=${s.paid} status=${s.status}`);
  const balAfterPay = await accountBalance(created.accountId);
  check("A4 số dư nguồn 50tr − 11tr = 39tr", balAfterPay === 39_000_000, `balance=${balAfterPay}`);

  if (p2.id) {
    const v = await call("admin", "DELETE", `/api/finance/payments/${p2.id}`);
    s = await invoiceState(created.invoiceId);
    check(
      "A5 huỷ đợt 2 → HĐ còn 4tr, PARTIAL (P0 V4.2)",
      v.status === 200 && s.paid === 4_000_000 && s.status === "PARTIAL",
      `HTTP ${v.status} paid=${s.paid} status=${s.status}`,
    );
    const balAfterVoid = await accountBalance(created.accountId);
    check("A6 số dư hoàn lại 7tr → 46tr (50 − 4)", balAfterVoid === 46_000_000, `balance=${balAfterVoid}`);
    const again = await call("admin", "DELETE", `/api/finance/payments/${p2.id}`);
    check("A7 huỷ lần 2 → 409", again.status === 409, `HTTP ${again.status} ${errCode(again.body)}`);
  }

  const del = await call("admin", "DELETE", `/api/finance/accounts/${created.accountId}`);
  check("B1 DELETE nguồn còn 46tr → 409", del.status === 409 && errCode(del.body) === "FIN_ACCOUNT_HAS_BALANCE", `HTTP ${del.status} ${errCode(del.body)}`);
  const patch = await call("admin", "PATCH", `/api/finance/accounts/${created.accountId}`, { isActive: false });
  check("B2 PATCH isActive=false nguồn còn tiền → 409", patch.status === 409, `HTTP ${patch.status} ${errCode(patch.body)}`);

  // ── C. RBAC sơ đồ kho ─────────────────────────────────────────────
  for (const path of ["/api/warehouse/layout", "/api/warehouse/lookup?q=AL"]) {
    const pl = await call("planner", "GET", path);
    const wh = await call("warehouse", "GET", path);
    check(`C ${path}`, pl.status === 403 && wh.status === 200, `planner=${pl.status} warehouse=${wh.status}`);
  }

  // ── D. API mồ côi đã xoá ──────────────────────────────────────────
  const eco = await call("admin", "GET", "/api/eco");
  check("D /api/eco đã xoá → 404", eco.status === 404, `HTTP ${eco.status}`);
}

try {
  await main();
} catch (err) {
  check("EXCEPTION", false, String(err?.stack ?? err));
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
console.log("Dữ liệu test cần dọn:", JSON.stringify(created));
process.exit(failed.length ? 1 : 0);
