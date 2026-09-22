#!/usr/bin/env node
// =====================================================================
// E2E Finance Flow Test — MES SongChau (V4.0 phân hệ Tài chính)
// =====================================================================
// Mục đích: kiểm chứng phân hệ Tài chính (21 endpoint `/api/finance/**`)
// hoạt động đúng nghiệp vụ, ĐẶC BIỆT là bất biến "KHÔNG ĐẾM TRÙNG tổng đã
// thu/đã chi" mô tả trong `apps/web/src/server/repos/finPayments.ts` (đầu
// file) và `plans/v4-finance/wave-2-finance.md` §C.2:
//   - `fin_transaction` là NGUỒN SỰ THẬT DUY NHẤT cho mọi tổng hợp dòng tiền
//     (dashboard/KPI). `fin_payment` chỉ là "đợt thanh toán" nhìn theo góc kế
//     toán, KHÔNG BAO GIỜ được cộng song song với fin_transaction.
//   - Mọi payment có allocation phải sinh ĐÚNG 1 fin_transaction / allocation.
//   - API tạo transaction thủ công CẤM set `paymentId` (400
//     FIN_TRANSACTION_PAYMENT_ID_FORBIDDEN) — chỉ createPaymentWithAllocations
//     mới được gán.
//
// Quy ước direction đọc từ schema/repo (packages/shared/src/schemas/finance.ts,
// apps/web/src/server/repos/finInvoices.ts):
//   - fin_transaction.direction: "IN" = tiền vào (thu), "OUT" = tiền ra (chi).
//   - fin_invoice.direction: "OUT" = hoá đơn mình xuất bán (khách nợ mình —
//     dùng cho /receivables/aging, WHERE direction='OUT'); "IN" = hoá đơn
//     mình NHẬN từ NCC (mình nợ NCC, mua vào) — thanh toán hoá đơn này sinh
//     dòng tiền CHI ra nên fin_payment.direction tương ứng = "OUT".
//   Nhóm 3 dùng "hoá đơn đầu vào" = mua vào = finInvoice.direction: "IN",
//   thanh toán = finPayment.direction: "OUT" (chi tiền trả NCC).
//
// Bám ĐÚNG pattern tests/e2e/notification-flow.mjs (683 dòng, 12/12 PASS
// trên prod): plain Node fetch, cookie jar Map theo role, màu ANSI,
// issues[]/stepLog[], helper call()/login()/fail()/warn()/step(), exit code 1
// nếu FAIL, in bảng tổng kết + danh sách id đã tạo để dọn tay.
//
// Chạy:
//   node tests/e2e/finance-flow.mjs
//   BASE=http://localhost:3001 node tests/e2e/finance-flow.mjs
//
// Constraints:
//   - Mọi data tạo ra gắn tag [E2E-FIN] trong description/name/notes.
//   - KHÔNG tự xoá dữ liệu prod — chỉ in danh sách cuối script.
//   - Exit 1 nếu FAIL, 0 nếu pass, 2 nếu exception (uncaught).
// =====================================================================

const BASE = process.env.BASE || "https://mes.songchau.vn";
const PASSWORDS = ["ChangeMe!234", "Test@1234"];
const TAG = "[E2E-FIN]";
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// ----- role cần cho kịch bản -----
// admin: full quyền finance (create/read/update/delete/approve — xem
// packages/shared/src/rbac/matrix.ts dòng 84). ketoan (accountant) chỉ có
// create/read/update (dòng 206).
//
// LƯU Ý must_change_password: đã đọc apps/web/src/middleware.ts +
// apps/web/src/app/(app)/layout.tsx — cờ `must_change_password` CHỈ được
// enforce ở RSC layout của app shell (redirect HTML sang
// /admin/settings/force-change-password), API route login
// (apps/web/src/app/api/auth/login/route.ts) KHÔNG đọc/trả field này và
// KHÔNG có middleware nào chặn `/api/**` theo cờ này. Vì vậy account
// ketoan/codong dù must_change_password=TRUE vẫn gọi thẳng được
// `/api/finance/**` bằng cookie sau login — script KHÔNG cần né tránh,
// chỉ WARN nếu login thất bại vì lý do khác (sai mật khẩu/account khoá).
const ROLE_USERS = {
  admin: "admin",
  accountant: "ketoan",
};

// ----- helpers (ANSI màu) -----
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};
const c = (s, col) => `${colors[col] || ""}${s}${colors.reset}`;

const issues = []; // {step, kind:"FAIL"|"WARN", endpoint, status, body, hint}
const stepLog = []; // {name, ok, summary}
const userJars = new Map(); // role → cookie header string
const createdIds = {
  accountIds: [],
  invoiceIds: [],
  paymentIds: [],
  transactionIds: [],
}; // để in cleanup cuối

function recordCookies(jar, setCookieHeaders) {
  if (!setCookieHeaders) return jar;
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const map = new Map();
  if (jar) {
    for (const kv of jar.split("; ").filter(Boolean)) {
      const idx = kv.indexOf("=");
      if (idx > 0) map.set(kv.slice(0, idx), kv.slice(idx + 1));
    }
  }
  for (const sc of arr) {
    const first = sc.split(";")[0];
    const idx = first.indexOf("=");
    if (idx > 0) map.set(first.slice(0, idx), first.slice(idx + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(role, method, path, { body } = {}) {
  const url = `${BASE}${path}`;
  const headers = { "Content-Type": "application/json" };
  const jar = userJars.get(role);
  if (jar) headers.Cookie = jar;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : null;
  if (setCookies && setCookies.length) {
    userJars.set(role, recordCookies(jar, setCookies));
  }
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, ok: res.ok, body: parsed, rawText: text };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(role, username) {
  let lastErr = null;
  for (const password of PASSWORDS) {
    userJars.delete(role);
    let r = await call(role, "POST", "/api/auth/login", { body: { username, password } });
    if (r.status === 429) {
      const wait = (r.body?.error?.details?.retryAfter ?? 60) + 2;
      console.log(c(`  · rate-limited login ${role} → wait ${wait}s`, "yellow"));
      await sleep(wait * 1000);
      r = await call(role, "POST", "/api/auth/login", { body: { username, password } });
    }
    if (r.ok) {
      // must_change_password (nếu có) chỉ chặn app shell HTML, KHÔNG chặn
      // /api/** — xem giải thích ở ROLE_USERS phía trên. Cookie đã set là
      // dùng được ngay cho mọi lời gọi API tiếp theo.
      return { ok: true, password };
    }
    lastErr = r;
    if (r.status === 401) continue; // thử password khác
    break;
  }
  return { ok: false, status: lastErr?.status, body: lastErr?.body };
}

function fail(step, endpoint, status, body, hint) {
  issues.push({ step, kind: "FAIL", endpoint, status, body, hint });
}
function warn(step, endpoint, hint) {
  issues.push({ step, kind: "WARN", endpoint, status: null, body: null, hint });
}
function step(stepName, ok, summary) {
  stepLog.push({ name: stepName, ok, summary });
  const tag = ok ? c("PASS", "green") : c("FAIL", "red");
  console.log(`\n[${tag}] ${c(stepName, "bold")} — ${summary}`);
}
function logInfo(msg) {
  console.log(c(`  · ${msg}`, "gray"));
}
function bodySnip(body) {
  return typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 300);
}
/** Lấy code lỗi chuẩn hoá từ response envelope { error: { code, message, details } }. */
function errCode(body) {
  return body?.error?.code ?? null;
}

async function main() {
  console.log(c("\n=== E2E Finance Flow Test ===", "bold"));
  console.log(c(`Base: ${BASE}`, "cyan"));
  console.log(c(`Run tag: ${TAG} ${TS}`, "cyan"));

  // ===================================================================
  // Pre: login admin (bắt buộc) + ketoan (best-effort, có thể bị must_change_password)
  // ===================================================================
  console.log(c("\n--- Pre: login các role ---", "bold"));
  const loginResults = {};
  const roleNames = Object.keys(ROLE_USERS);
  for (let idx = 0; idx < roleNames.length; idx++) {
    const role = roleNames[idx];
    if (idx > 0) await sleep(500); // spread requests, tránh rate-limit
    const lr = await login(role, ROLE_USERS[role]);
    loginResults[role] = lr;
    if (!lr.ok) {
      console.log(c(`  ! Login ${role} (${ROLE_USERS[role]}) FAILED status=${lr.status}`, "yellow"));
      warn(
        "PRE",
        "POST /api/auth/login",
        `Không login được role=${role} user=${ROLE_USERS[role]} — các nhóm test cần role này sẽ SKIP (WARN), không crash. Kiểm tra account có tồn tại/active trên prod không.`,
      );
    } else {
      logInfo(`login ${role} (${ROLE_USERS[role]}) OK (password=${lr.password})`);
    }
  }

  const usable = (role) => loginResults[role]?.ok === true;

  if (!usable("admin")) {
    console.log(c("\nKHÔNG login được admin bằng bất kỳ mật khẩu nào trong danh sách thử — ABORT toàn bộ script.", "red"));
    fail("PRE", "POST /api/auth/login", loginResults.admin?.status ?? null, loginResults.admin?.body ?? null,
      "admin là tài khoản bắt buộc cho mọi nhóm test finance — kiểm tra mật khẩu hiện tại hoặc account có bị khoá không.");
    printSummaryAndExit();
    return;
  }
  if (!usable("accountant")) {
    warn("PRE", "GROUP-RBAC", "Không login được ketoan (accountant) — SKIP mọi khả năng cross-check bằng role accountant, dùng admin cho toàn bộ nghiệp vụ Nhóm 1-7. Kiểm tra account 'ketoan' có tồn tại/active trên prod không (packages/db/migrations/seed-ketoan-user.sql).");
  } else {
    logInfo("accountant (ketoan) login OK — có thể dùng cho API /api/finance/** (must_change_password chỉ chặn app shell HTML, không chặn API, xem comment ROLE_USERS).");
  }

  // Dùng admin làm actor chính cho mọi nghiệp vụ (đủ quyền finance:create/read/update/delete/approve).
  const ACTOR = "admin";

  // snapshot dữ liệu tạo xuyên suốt các nhóm
  const state = {
    accountId: null,
    accountCode: null,
  };

  // ===================================================================
  // NHÓM 1 — Danh mục & tài khoản giao dịch
  // ===================================================================
  console.log(c("\n=== NHÓM 1: Danh mục & tài khoản giao dịch ===", "bold"));

  // ---- 1a. GET categories → phải có 10 danh mục seed (7 CHI + 3 THU) ----
  console.log(c("\n--- Bước 1a: GET /api/finance/categories (seed 7 CHI + 3 THU) ---", "bold"));
  {
    const res = await call(ACTOR, "GET", "/api/finance/categories");
    if (res.ok) {
      const rows = res.body?.data ?? [];
      const chiCount = rows.filter((r) => r.direction === "OUT").length;
      const thuCount = rows.filter((r) => r.direction === "IN").length;
      // Seed cố định trong 0055_finance_core.sql — 7 CHI_* (direction=OUT) +
      // 3 THU_* (direction=IN). Dùng >= thay vì === để không fail nếu admin
      // đã bổ sung thêm danh mục hợp lệ khác trong quá trình vận hành thật.
      if (rows.length >= 10 && chiCount >= 7 && thuCount >= 3) {
        step("Bước 1a", true, `Có ${rows.length} danh mục (>= 10 seed): ${chiCount} CHI (OUT) + ${thuCount} THU (IN)`);
      } else {
        fail(1, "GET /api/finance/categories", res.status, res.body,
          `Kỳ vọng >= 10 danh mục (7 CHI direction=OUT + 3 THU direction=IN), thực tế total=${rows.length}, CHI=${chiCount}, THU=${thuCount}. Kiểm tra seed INSERT trong packages/db/migrations/0055_finance_core.sql đã chạy trên prod chưa.`);
        step("Bước 1a", false, `Danh mục không đủ (total=${rows.length}, CHI=${chiCount}, THU=${thuCount})`);
      }
    } else {
      fail(1, "GET /api/finance/categories", res.status, res.body, "Không lấy được danh sách danh mục — kiểm tra RBAC read:finance hoặc route categories/route.ts.");
      step("Bước 1a", false, `HTTP ${res.status}`);
    }
  }

  // ---- 1b. POST tạo tài khoản tiền mặt [E2E-FIN] openingBalance 10tr → 201, currentBalance = 10tr ----
  console.log(c("\n--- Bước 1b: tạo tài khoản tiền mặt E2E-FIN openingBalance 10.000.000 ---", "bold"));
  {
    const code = `E2EFIN${TS.replace(/-/g, "").slice(-8)}`;
    const res = await call(ACTOR, "POST", "/api/finance/accounts", {
      body: {
        code,
        name: `${TAG} Tiền mặt test ${TS}`,
        type: "CASH",
        openingBalance: 10_000_000,
      },
    });
    if (res.status === 201) {
      const row = res.body?.data;
      state.accountId = row?.id;
      state.accountCode = row?.code;
      createdIds.accountIds.push(state.accountId);
      const balance = Number(row?.currentBalance);
      if (balance === 10_000_000) {
        step("Bước 1b", true, `Tạo tài khoản ${state.accountCode} (id=${state.accountId?.slice(0, 8)}…) currentBalance=${balance}`);
      } else {
        fail(1, "POST /api/finance/accounts", 201, row,
          `Tạo tài khoản thành công nhưng currentBalance=${balance} (kỳ vọng 10000000) — kiểm tra createFinAccount trong apps/web/src/server/repos/finAccounts.ts có set current_balance = opening_balance khi insert không.`);
        step("Bước 1b", false, `currentBalance=${balance} (kỳ vọng 10000000)`);
      }
    } else {
      fail(1, "POST /api/finance/accounts", res.status, res.body,
        "Không tạo được tài khoản tiền mặt. Kiểm tra finAccountCreateSchema (packages/shared/src/schemas/finance.ts) hoặc RBAC create:finance cho admin.");
      step("Bước 1b", false, `HTTP ${res.status}`);
    }
  }

  if (!state.accountId) {
    console.log(c("\nKHÔNG có tài khoản để tiếp tục Nhóm 2+ — ABORT các nhóm phụ thuộc tài khoản.", "red"));
  }

  // ===================================================================
  // NHÓM 2 — Khoản chi KHÔNG hoá đơn (nghiệp vụ riêng của user)
  // ===================================================================
  console.log(c("\n=== NHÓM 2: Khoản chi KHÔNG hoá đơn ===", "bold"));
  if (state.accountId) {
    // ---- 2a. POST transaction OUT 1.500.000 không kèm invoiceId → 201 ----
    console.log(c("\n--- Bước 2a: transaction OUT 1.500.000 không hoá đơn ---", "bold"));
    let tx1Ok = false;
    {
      const res = await call(ACTOR, "POST", "/api/finance/transactions", {
        body: {
          direction: "OUT",
          accountId: state.accountId,
          amount: 1_500_000,
          transactionDate: TS.slice(0, 10),
          description: `${TAG} chi không hoá đơn`,
        },
      });
      if (res.status === 201) {
        createdIds.transactionIds.push(res.body?.data?.id);
        tx1Ok = true;
        step("Bước 2a", true, `Tạo transaction OUT 1.500.000 (id=${res.body?.data?.id?.slice(0, 8)}…), không invoiceId/paymentId`);
      } else {
        fail(2, "POST /api/finance/transactions", res.status, res.body,
          "Không tạo được transaction OUT không hoá đơn — invoiceId phải optional theo finTransactionCreateSchema. Kiểm tra route transactions/route.ts hoặc createTransaction trong finTransactions.ts.");
        step("Bước 2a", false, `HTTP ${res.status}`);
      }
    }

    // ---- 2b. GET account → currentBalance giảm đúng còn 8.500.000 (trigger DB) ----
    console.log(c("\n--- Bước 2b: currentBalance sau chi phải còn 8.500.000 (trigger DB) ---", "bold"));
    if (tx1Ok) {
      const res = await call(ACTOR, "GET", `/api/finance/accounts/${state.accountId}`);
      const balance = Number(res.body?.data?.currentBalance);
      if (res.ok && balance === 8_500_000) {
        step("Bước 2b", true, `currentBalance = ${balance} đúng như kỳ vọng (trigger fin_account_recalc_balance chạy đúng)`);
      } else {
        fail(2, `GET /api/finance/accounts/${state.accountId}`, res.status, res.body,
          `currentBalance=${balance} (kỳ vọng 8500000 = 10000000 - 1500000) — trigger DB fin_account_recalc_balance (packages/db/migrations/0055_finance_core.sql) có thể chưa chạy hoặc chạy sai khi insert fin_transaction status=POSTED.`);
        step("Bước 2b", false, `currentBalance=${balance} (kỳ vọng 8500000)`);
      }
    } else {
      step("Bước 2b", false, "Skip — bước 2a fail nên không kiểm tra được balance");
    }

    // ---- 2c. POST transaction IN 3.000.000 → currentBalance = 11.500.000 ----
    console.log(c("\n--- Bước 2c: transaction IN 3.000.000 → currentBalance = 11.500.000 ---", "bold"));
    {
      const res = await call(ACTOR, "POST", "/api/finance/transactions", {
        body: {
          direction: "IN",
          accountId: state.accountId,
          amount: 3_000_000,
          transactionDate: TS.slice(0, 10),
          description: `${TAG} thu không hoá đơn`,
        },
      });
      if (res.status === 201) {
        createdIds.transactionIds.push(res.body?.data?.id);
        const after = await call(ACTOR, "GET", `/api/finance/accounts/${state.accountId}`);
        const balance = Number(after.body?.data?.currentBalance);
        if (after.ok && balance === 11_500_000) {
          step("Bước 2c", true, `Tạo transaction IN 3.000.000 → currentBalance=${balance} đúng như kỳ vọng`);
        } else {
          fail(2, `GET /api/finance/accounts/${state.accountId}`, after.status, after.body,
            `Sau khi thu 3.000.000, currentBalance=${balance} (kỳ vọng 11500000 = 8500000 + 3000000).`);
          step("Bước 2c", false, `currentBalance=${balance} (kỳ vọng 11500000)`);
        }
      } else {
        fail(2, "POST /api/finance/transactions", res.status, res.body, "Không tạo được transaction IN không hoá đơn.");
        step("Bước 2c", false, `HTTP ${res.status}`);
      }
    }
  } else {
    step("Nhóm 2", false, "SKIP — không có tài khoản (bước 1b fail)");
  }

  // ===================================================================
  // NHÓM 3 — CHỐNG ĐẾM TRÙNG (quan trọng nhất)
  // ===================================================================
  console.log(c("\n=== NHÓM 3: Chống đếm trùng (payment → transaction) ===", "bold"));
  if (state.accountId) {
    // ---- 3a. POST transaction kèm paymentId bất kỳ → PHẢI 400 FIN_TRANSACTION_PAYMENT_ID_FORBIDDEN ----
    // Đây là lớp phòng thủ tường minh trong route (đọc raw body TRƯỚC zod strip
    // field lạ) — xem comment trong apps/web/src/app/api/finance/transactions/route.ts.
    // Nếu lớp này bị gỡ, client có thể tự gán paymentId cho 1 transaction thủ
    // công KHÔNG qua createPaymentWithAllocations → phá vỡ bất biến "1
    // transaction/allocation" và làm sai lệch mọi tổng hợp dashboard.
    console.log(c("\n--- Bước 3a: transaction kèm paymentId thủ công → PHẢI 400 ---", "bold"));
    {
      const res = await call(ACTOR, "POST", "/api/finance/transactions", {
        body: {
          direction: "OUT",
          accountId: state.accountId,
          amount: 100_000,
          transactionDate: TS.slice(0, 10),
          description: `${TAG} thử gán paymentId trái phép`,
          paymentId: "00000000-0000-0000-0000-000000000000",
        },
      });
      if (res.status === 400 && errCode(res.body) === "FIN_TRANSACTION_PAYMENT_ID_FORBIDDEN") {
        step("Bước 3a", true, "Gán paymentId thủ công bị chặn đúng 400 FIN_TRANSACTION_PAYMENT_ID_FORBIDDEN");
      } else {
        fail(3, "POST /api/finance/transactions", res.status, res.body,
          `Kỳ vọng 400 code=FIN_TRANSACTION_PAYMENT_ID_FORBIDDEN, thực tế status=${res.status} code=${errCode(res.body)} — LỖ HỔNG ĐẾM TRÙNG. Kiểm tra khối đọc rawBody TRƯỚC parseJson trong apps/web/src/app/api/finance/transactions/route.ts (POST) có còn nguyên không.`);
        step("Bước 3a", false, `status=${res.status} code=${errCode(res.body)} (kỳ vọng 400/FIN_TRANSACTION_PAYMENT_ID_FORBIDDEN)`);
      }
    }

    // ---- 3b. Tạo 2 hoá đơn đầu vào (direction=IN — hoá đơn mua, mình nợ NCC), mỗi cái 2.000.000 ----
    console.log(c("\n--- Bước 3b: tạo 2 hoá đơn mua vào (direction=IN) 2.000.000/cái ---", "bold"));
    const invoiceIds = [];
    for (let i = 1; i <= 2; i++) {
      const res = await call(ACTOR, "POST", "/api/finance/invoices", {
        body: {
          invoiceNo: `${TAG.replace(/[[\]]/g, "")}-INV-${TS}-${i}`,
          direction: "IN",
          issueDate: TS.slice(0, 10),
          subtotalAmount: 2_000_000,
          vatRate: 0,
          vatAmount: 0,
          totalAmount: 2_000_000,
          notes: `${TAG} hoá đơn mua test đếm trùng #${i}`,
        },
      });
      if (res.status === 201) {
        invoiceIds.push(res.body?.data?.id);
        createdIds.invoiceIds.push(res.body?.data?.id);
      } else {
        fail(3, "POST /api/finance/invoices", res.status, res.body,
          `Không tạo được hoá đơn mua #${i}. Kiểm tra finInvoiceCreateSchema (packages/shared/src/schemas/finance.ts) — totalAmount phải = subtotalAmount + vatAmount (sai số ±1).`);
      }
    }
    if (invoiceIds.length === 2 && invoiceIds.every(Boolean)) {
      step("Bước 3b", true, `Tạo 2 hoá đơn mua thành công: ${invoiceIds.map((id) => id.slice(0, 8)).join(", ")}`);
    } else {
      step("Bước 3b", false, `Chỉ tạo được ${invoiceIds.filter(Boolean).length}/2 hoá đơn — các bước sau sẽ SKIP`);
    }

    if (invoiceIds.length === 2 && invoiceIds.every(Boolean)) {
      // ---- 3c. Snapshot dashboard summary TRƯỚC khi thanh toán ----
      console.log(c("\n--- Bước 3c: snapshot dashboard summary TRƯỚC khi thanh toán ---", "bold"));
      const beforeSummary = await call(ACTOR, "GET", "/api/finance/dashboard/summary");
      let totalOutBefore = null;
      if (beforeSummary.ok) {
        totalOutBefore = Number(beforeSummary.body?.data?.totalOut);
        logInfo(`totalOut (30 ngày) TRƯỚC thanh toán = ${totalOutBefore}`);
      } else {
        fail(3, "GET /api/finance/dashboard/summary", beforeSummary.status, beforeSummary.body,
          "Không lấy được dashboard summary trước khi thanh toán — không thể assert chống đếm trùng ở bước 3e.");
      }

      // ---- 3d. Tạo 1 payment 4.000.000 phân bổ CẢ 2 hoá đơn (2tr/cái) → 201 ----
      console.log(c("\n--- Bước 3d: payment 4.000.000 phân bổ cho cả 2 hoá đơn ---", "bold"));
      // direction=OUT vì đây là dòng tiền CHI trả NCC cho hoá đơn mua (direction=IN).
      const payRes = await call(ACTOR, "POST", "/api/finance/payments", {
        body: {
          direction: "OUT",
          accountId: state.accountId,
          paymentDate: TS.slice(0, 10),
          totalAmount: 4_000_000,
          method: "BANK_TRANSFER",
          notes: `${TAG} thanh toán gộp 2 hoá đơn — test chống đếm trùng`,
          allocations: invoiceIds.map((invoiceId) => ({ invoiceId, amount: 2_000_000 })),
        },
      });
      let paymentId = null;
      if (payRes.status === 201) {
        paymentId = payRes.body?.data?.payment?.id;
        createdIds.paymentIds.push(paymentId);
        const allocRows = payRes.body?.data?.allocations ?? [];
        for (const a of allocRows) {
          // fin_transaction sinh từ payment — không lấy id trực tiếp từ response
          // payment (repo không return transaction), nhưng vẫn ghi nhận invoice
          // để cleanup; transaction ids sẽ lấy qua GET /transactions?... nếu cần.
          void a;
        }
        step("Bước 3d", true, `Tạo payment ${payRes.body?.data?.payment?.code ?? paymentId} (id=${paymentId?.slice(0, 8)}…) phân bổ 2.000.000 x 2 = 4.000.000`);
      } else {
        fail(3, "POST /api/finance/payments", payRes.status, payRes.body,
          "Không tạo được payment phân bổ 2 hoá đơn. Kiểm tra createPaymentWithAllocations (apps/web/src/server/repos/finPayments.ts) — có thể lock FOR UPDATE hoặc validate remaining bị sai.");
        step("Bước 3d", false, `HTTP ${payRes.status}`);
      }

      // ---- 3e. Assert 2 hoá đơn đều PAID + tổng chi KHÔNG bị gấp đôi ----
      console.log(c("\n--- Bước 3e: assert 2 hoá đơn PAID + tổng chi tăng ĐÚNG 4.000.000 (không x2) ---", "bold"));
      if (paymentId) {
        // 3e.1 — cả 2 hoá đơn phải chuyển PAID
        let allPaid = true;
        for (const invoiceId of invoiceIds) {
          const invRes = await call(ACTOR, "GET", `/api/finance/invoices/${invoiceId}`);
          const status = invRes.body?.data?.status;
          const paidAmount = Number(invRes.body?.data?.paidAmount);
          if (invRes.ok && status === "PAID" && paidAmount === 2_000_000) {
            logInfo(`Hoá đơn ${invoiceId.slice(0, 8)}… status=PAID paidAmount=${paidAmount}`);
          } else {
            allPaid = false;
            fail(3, `GET /api/finance/invoices/${invoiceId}`, invRes.status, invRes.body,
              `Hoá đơn kỳ vọng status=PAID paidAmount=2000000, thực tế status=${status} paidAmount=${paidAmount} — kiểm tra recalcInvoicePaidAmount (finInvoices.ts) có được gọi đúng trong createPaymentWithAllocations không.`);
          }
        }

        // 3e.2 — MẤU CHỐT: tổng chi (fin_transaction) tăng ĐÚNG 4.000.000,
        // KHÔNG PHẢI 8.000.000. Nếu dashboard/summary vô tình cộng cả
        // fin_payment.totalAmount LẪN fin_transaction sinh ra từ payment đó
        // (double source), hoặc createPaymentWithAllocations lỡ insert 2 lần
        // transaction/allocation, số này sẽ ra 8.000.000 thay vì 4.000.000.
        await sleep(500); // để chắc chắn transaction đã commit trước khi query lại summary
        const afterSummary = await call(ACTOR, "GET", "/api/finance/dashboard/summary");
        if (afterSummary.ok && totalOutBefore !== null) {
          const totalOutAfter = Number(afterSummary.body?.data?.totalOut);
          const delta = totalOutAfter - totalOutBefore;
          if (delta === 4_000_000) {
            step("Bước 3e", allPaid, `Tổng chi tăng ĐÚNG 4.000.000 (${totalOutBefore} → ${totalOutAfter}), 2 hoá đơn đều PAID`);
          } else if (delta === 8_000_000) {
            fail(3, "GET /api/finance/dashboard/summary", 200, { totalOutBefore, totalOutAfter, delta },
              `ĐẾM TRÙNG XÁC NHẬN: tổng chi tăng ${delta} (gấp đôi 4.000.000) thay vì đúng 4.000.000. Nguyên nhân khả nghi: createPaymentWithAllocations (finPayments.ts) insert 2 lần fin_transaction cho mỗi allocation, HOẶC getCashflowTotals/getAccountsBalanceSummary (finInvoices.ts) cộng cả fin_payment lẫn fin_transaction. Đây là bug nghiêm trọng nhất cần chặn trước khi ship.`);
            step("Bước 3e", false, `Tổng chi tăng ${delta} — ĐẾM TRÙNG (kỳ vọng 4000000)`);
          } else {
            fail(3, "GET /api/finance/dashboard/summary", 200, { totalOutBefore, totalOutAfter, delta },
              `Tổng chi tăng ${delta} (kỳ vọng đúng 4000000) — không khớp giá trị mong đợi lẫn dấu hiệu double-count 8000000, kiểm tra thủ công thêm giao dịch nào khác đã chen vào cửa sổ 30 ngày.`);
            step("Bước 3e", false, `Tổng chi tăng ${delta} (kỳ vọng 4000000)`);
          }
        } else {
          fail(3, "GET /api/finance/dashboard/summary", afterSummary.status, afterSummary.body,
            "Không lấy được dashboard summary SAU thanh toán để so sánh chống đếm trùng.");
          step("Bước 3e", false, "Không lấy được summary sau thanh toán");
        }
      } else {
        step("Bước 3e", false, "Skip — bước 3d fail nên không có payment để assert");
      }
    } else {
      step("Bước 3c/3d/3e", false, "Skip — thiếu đủ 2 hoá đơn từ bước 3b");
    }
  } else {
    step("Nhóm 3", false, "SKIP — không có tài khoản (bước 1b fail)");
  }

  // ===================================================================
  // NHÓM 4 — Thanh toán nhiều đợt (partial)
  // ===================================================================
  console.log(c("\n=== NHÓM 4: Thanh toán nhiều đợt (partial) ===", "bold"));
  if (state.accountId) {
    console.log(c("\n--- Bước 4a: tạo hoá đơn 5.000.000 ---", "bold"));
    let invoiceId = null;
    {
      const res = await call(ACTOR, "POST", "/api/finance/invoices", {
        body: {
          invoiceNo: `${TAG.replace(/[[\]]/g, "")}-PARTIAL-${TS}`,
          direction: "IN",
          issueDate: TS.slice(0, 10),
          subtotalAmount: 5_000_000,
          vatRate: 0,
          vatAmount: 0,
          totalAmount: 5_000_000,
          notes: `${TAG} hoá đơn test thanh toán nhiều đợt`,
        },
      });
      if (res.status === 201) {
        invoiceId = res.body?.data?.id;
        createdIds.invoiceIds.push(invoiceId);
        step("Bước 4a", true, `Tạo hoá đơn 5.000.000 (id=${invoiceId?.slice(0, 8)}…)`);
      } else {
        fail(4, "POST /api/finance/invoices", res.status, res.body, "Không tạo được hoá đơn test partial payment.");
        step("Bước 4a", false, `HTTP ${res.status}`);
      }
    }

    console.log(c("\n--- Bước 4b: payment đợt 1 = 2.000.000 → PARTIAL, paidAmount=2.000.000 ---", "bold"));
    if (invoiceId) {
      const res = await call(ACTOR, "POST", "/api/finance/payments", {
        body: {
          direction: "OUT",
          accountId: state.accountId,
          paymentDate: TS.slice(0, 10),
          totalAmount: 2_000_000,
          method: "BANK_TRANSFER",
          notes: `${TAG} thanh toán đợt 1/2`,
          allocations: [{ invoiceId, amount: 2_000_000 }],
        },
      });
      if (res.status === 201) {
        createdIds.paymentIds.push(res.body?.data?.payment?.id);
        const invAfter = await call(ACTOR, "GET", `/api/finance/invoices/${invoiceId}`);
        const status = invAfter.body?.data?.status;
        const paidAmount = Number(invAfter.body?.data?.paidAmount);
        if (invAfter.ok && status === "PARTIAL" && paidAmount === 2_000_000) {
          step("Bước 4b", true, `Sau đợt 1: status=PARTIAL paidAmount=${paidAmount} đúng như kỳ vọng`);
        } else {
          fail(4, `GET /api/finance/invoices/${invoiceId}`, invAfter.status, invAfter.body,
            `Sau payment đợt 1 (2tr/5tr), kỳ vọng status=PARTIAL paidAmount=2000000, thực tế status=${status} paidAmount=${paidAmount}. Kiểm tra recalcInvoicePaidAmount() nhánh "0 < paid < total → PARTIAL".`);
          step("Bước 4b", false, `status=${status} paidAmount=${paidAmount} (kỳ vọng PARTIAL/2000000)`);
        }
      } else {
        fail(4, "POST /api/finance/payments", res.status, res.body, "Không tạo được payment đợt 1 (2.000.000).");
        step("Bước 4b", false, `HTTP ${res.status}`);
      }

      console.log(c("\n--- Bước 4c: payment đợt 2 = 3.000.000 → PAID, paidAmount=5.000.000 ---", "bold"));
      const res2 = await call(ACTOR, "POST", "/api/finance/payments", {
        body: {
          direction: "OUT",
          accountId: state.accountId,
          paymentDate: TS.slice(0, 10),
          totalAmount: 3_000_000,
          method: "BANK_TRANSFER",
          notes: `${TAG} thanh toán đợt 2/2`,
          allocations: [{ invoiceId, amount: 3_000_000 }],
        },
      });
      if (res2.status === 201) {
        createdIds.paymentIds.push(res2.body?.data?.payment?.id);
        const invAfter2 = await call(ACTOR, "GET", `/api/finance/invoices/${invoiceId}`);
        const status2 = invAfter2.body?.data?.status;
        const paidAmount2 = Number(invAfter2.body?.data?.paidAmount);
        if (invAfter2.ok && status2 === "PAID" && paidAmount2 === 5_000_000) {
          step("Bước 4c", true, `Sau đợt 2: status=PAID paidAmount=${paidAmount2} đúng như kỳ vọng`);
        } else {
          fail(4, `GET /api/finance/invoices/${invoiceId}`, invAfter2.status, invAfter2.body,
            `Sau payment đợt 2 (tổng 5tr/5tr), kỳ vọng status=PAID paidAmount=5000000, thực tế status=${status2} paidAmount=${paidAmount2}. Kiểm tra recalcInvoicePaidAmount() nhánh "paid >= total → PAID" và validate FOR UPDATE lock allocation trong createPaymentWithAllocations.`);
          step("Bước 4c", false, `status=${status2} paidAmount=${paidAmount2} (kỳ vọng PAID/5000000)`);
        }
      } else {
        fail(4, "POST /api/finance/payments", res2.status, res2.body, "Không tạo được payment đợt 2 (3.000.000).");
        step("Bước 4c", false, `HTTP ${res2.status}`);
      }
    } else {
      step("Bước 4b/4c", false, "Skip — bước 4a fail nên không có hoá đơn");
    }
  } else {
    step("Nhóm 4", false, "SKIP — không có tài khoản (bước 1b fail)");
  }

  // ===================================================================
  // NHÓM 5 — Chặn phân bổ vượt số còn nợ
  // ===================================================================
  console.log(c("\n=== NHÓM 5: Chặn phân bổ vượt số còn nợ ===", "bold"));
  if (state.accountId) {
    // Tạo 1 hoá đơn nhỏ, thanh toán đủ (PAID), rồi thử phân bổ thêm 999tr —
    // remaining = 0 nên bất kỳ allocation > 1đ (sai số cho phép) đều phải bị
    // từ chối theo FIN_PAYMENT_ALLOCATION_EXCEEDS_REMAINING (409) trong
    // createPaymentWithAllocations (finPayments.ts, bước (b) validate remaining).
    console.log(c("\n--- Chuẩn bị: tạo + thanh toán đủ 1 hoá đơn nhỏ để remaining=0 ---", "bold"));
    let paidInvoiceId = null;
    {
      const res = await call(ACTOR, "POST", "/api/finance/invoices", {
        body: {
          invoiceNo: `${TAG.replace(/[[\]]/g, "")}-OVERPAY-${TS}`,
          direction: "IN",
          issueDate: TS.slice(0, 10),
          subtotalAmount: 1_000_000,
          vatRate: 0,
          vatAmount: 0,
          totalAmount: 1_000_000,
          notes: `${TAG} hoá đơn test chặn overpay`,
        },
      });
      if (res.status === 201) {
        paidInvoiceId = res.body?.data?.id;
        createdIds.invoiceIds.push(paidInvoiceId);
        const payRes = await call(ACTOR, "POST", "/api/finance/payments", {
          body: {
            direction: "OUT",
            accountId: state.accountId,
            paymentDate: TS.slice(0, 10),
            totalAmount: 1_000_000,
            method: "BANK_TRANSFER",
            notes: `${TAG} thanh toán đủ trước khi test overpay`,
            allocations: [{ invoiceId: paidInvoiceId, amount: 1_000_000 }],
          },
        });
        if (payRes.status === 201) {
          createdIds.paymentIds.push(payRes.body?.data?.payment?.id);
          logInfo(`Hoá đơn ${paidInvoiceId.slice(0, 8)}… đã PAID đủ (1.000.000/1.000.000) — sẵn sàng test overpay`);
        } else {
          fail(5, "POST /api/finance/payments", payRes.status, payRes.body, "Không thanh toán đủ được hoá đơn chuẩn bị cho test overpay.");
          paidInvoiceId = null;
        }
      } else {
        fail(5, "POST /api/finance/invoices", res.status, res.body, "Không tạo được hoá đơn chuẩn bị cho test overpay.");
      }
    }

    console.log(c("\n--- Bước 5: payment phân bổ 999.000.000 cho hoá đơn đã PAID → PHẢI bị từ chối (4xx) ---", "bold"));
    if (paidInvoiceId) {
      const res = await call(ACTOR, "POST", "/api/finance/payments", {
        body: {
          direction: "OUT",
          accountId: state.accountId,
          paymentDate: TS.slice(0, 10),
          totalAmount: 999_000_000,
          method: "BANK_TRANSFER",
          notes: `${TAG} thử overpay hoá đơn đã PAID — phải bị chặn`,
          allocations: [{ invoiceId: paidInvoiceId, amount: 999_000_000 }],
        },
      });
      if (res.status >= 400 && res.status < 500) {
        createdIds.paymentIds.push(res.body?.data?.payment?.id); // undefined nếu bị chặn đúng — không sao
        logInfo(`Bị từ chối đúng: HTTP ${res.status} code=${errCode(res.body)}`);
        step("Bước 5", true, `Phân bổ 999.000.000 cho hoá đơn đã PAID bị từ chối đúng (HTTP ${res.status}, code=${errCode(res.body)})`);
      } else if (res.status === 201) {
        createdIds.paymentIds.push(res.body?.data?.payment?.id);
        fail(5, "POST /api/finance/payments", res.status, res.body,
          "NGHIÊM TRỌNG: payment overpay 999.000.000 cho hoá đơn đã PAID được chấp nhận (HTTP 201) thay vì bị từ chối — kiểm tra bước (b) validate remaining trong createPaymentWithAllocations (finPayments.ts): `if (allocAmount - remaining > 1) throw FIN_PAYMENT_ALLOCATION_EXCEEDS_REMAINING`. remaining lúc này phải = 0 vì hoá đơn đã PAID đủ ở bước chuẩn bị.");
        step("Bước 5", false, "Overpay được chấp nhận (201) — LỖ HỔNG");
      } else {
        fail(5, "POST /api/finance/payments", res.status, res.body, `Status ${res.status} không phải 4xx cũng không phải 201 — response bất thường.`);
        step("Bước 5", false, `HTTP bất thường ${res.status}`);
      }
    } else {
      step("Bước 5", false, "Skip — không chuẩn bị được hoá đơn đã PAID đủ");
    }
  } else {
    step("Nhóm 5", false, "SKIP — không có tài khoản (bước 1b fail)");
  }

  // ===================================================================
  // NHÓM 6 — Công nợ & dashboard
  // ===================================================================
  console.log(c("\n=== NHÓM 6: Công nợ & dashboard ===", "bold"));
  {
    console.log(c("\n--- Bước 6a: GET /api/finance/receivables/aging ---", "bold"));
    const res = await call(ACTOR, "GET", "/api/finance/receivables/aging");
    const buckets = res.body?.data?.buckets;
    if (res.ok && Array.isArray(buckets)) {
      const validShape = buckets.every(
        (b) => typeof b.bucket === "string" && typeof b.invoiceCount === "number" && typeof b.outstandingAmount === "number",
      );
      if (validShape) {
        step("Bước 6a", true, `200 OK, ${buckets.length} bucket(s), shape đúng {bucket, invoiceCount, outstandingAmount}`);
      } else {
        fail(6, "GET /api/finance/receivables/aging", 200, buckets,
          "Response 200 nhưng shape bucket sai — kỳ vọng {bucket:string, invoiceCount:number, outstandingAmount:number} theo getReceivablesAging() trong finInvoices.ts.");
        step("Bước 6a", false, "Shape bucket không đúng");
      }
    } else {
      fail(6, "GET /api/finance/receivables/aging", res.status, res.body, "Không lấy được aging buckets.");
      step("Bước 6a", false, `HTTP ${res.status}`);
    }

    console.log(c("\n--- Bước 6b: GET /api/finance/dashboard/cashflow?from=...&to=... ---", "bold"));
    const to = TS.slice(0, 10);
    const fromDate = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const res2 = await call(ACTOR, "GET", `/api/finance/dashboard/cashflow?from=${fromDate}&to=${to}`);
    const series = res2.body?.data?.series;
    if (res2.ok && Array.isArray(series)) {
      step("Bước 6b", true, `200 OK, series ${series.length} ngày, summary=${JSON.stringify(res2.body?.data?.summary)}`);
    } else {
      fail(6, "GET /api/finance/dashboard/cashflow", res2.status, res2.body, "Không lấy được cashflow series theo ngày.");
      step("Bước 6b", false, `HTTP ${res2.status}`);
    }

    console.log(c("\n--- Bước 6c: GET /api/finance/dashboard/summary ---", "bold"));
    const res3 = await call(ACTOR, "GET", "/api/finance/dashboard/summary");
    if (res3.ok && typeof res3.body?.data?.totalIn === "number" && typeof res3.body?.data?.totalOut === "number") {
      step("Bước 6c", true, `200 OK, totalIn=${res3.body.data.totalIn}, totalOut=${res3.body.data.totalOut}, totalBalance=${res3.body.data.totalBalance}`);
    } else {
      fail(6, "GET /api/finance/dashboard/summary", res3.status, res3.body, "Không lấy được dashboard summary hoặc thiếu field totalIn/totalOut.");
      step("Bước 6c", false, `HTTP ${res3.status}`);
    }
  }

  // ===================================================================
  // NHÓM 7 — Huỷ chứng từ (VOID, không xoá cứng)
  // ===================================================================
  console.log(c("\n=== NHÓM 7: Huỷ chứng từ (VOID) ===", "bold"));
  if (state.accountId) {
    console.log(c("\n--- Bước 7: tạo transaction rồi VOID, currentBalance phải tính lại đúng ---", "bold"));
    const balBefore = await call(ACTOR, "GET", `/api/finance/accounts/${state.accountId}`);
    const balanceBefore = Number(balBefore.body?.data?.currentBalance);
    const createRes = await call(ACTOR, "POST", "/api/finance/transactions", {
      body: {
        direction: "OUT",
        accountId: state.accountId,
        amount: 500_000,
        transactionDate: TS.slice(0, 10),
        description: `${TAG} transaction sẽ bị void`,
      },
    });
    if (createRes.status === 201) {
      const txId = createRes.body?.data?.id;
      createdIds.transactionIds.push(txId);
      const balAfterCreate = await call(ACTOR, "GET", `/api/finance/accounts/${state.accountId}`);
      const balanceAfterCreate = Number(balAfterCreate.body?.data?.currentBalance);
      const expectedAfterCreate = balanceBefore - 500_000;
      if (balanceAfterCreate !== expectedAfterCreate) {
        fail(7, `GET /api/finance/accounts/${state.accountId}`, balAfterCreate.status, balAfterCreate.body,
          `Trước khi test void: currentBalance=${balanceAfterCreate} (kỳ vọng ${expectedAfterCreate}) — dữ liệu nền không như mong đợi, kết quả void phía sau có thể sai lệch theo.`);
      }

      const voidRes = await call(ACTOR, "POST", `/api/finance/transactions/${txId}/void`);
      if (voidRes.status === 200 && voidRes.body?.data?.status === "VOID") {
        const balAfterVoid = await call(ACTOR, "GET", `/api/finance/accounts/${state.accountId}`);
        const balanceAfterVoid = Number(balAfterVoid.body?.data?.currentBalance);
        // VOID phải cộng lại đúng 500.000 vì trigger fin_account_recalc_balance
        // chỉ SUM(status='POSTED') — giao dịch VOID không còn được tính.
        if (balanceAfterVoid === balanceAfterCreate + 500_000) {
          step("Bước 7", true, `VOID transaction thành công (status=VOID), currentBalance tính lại đúng: ${balanceAfterCreate} → ${balanceAfterVoid} (+500.000)`);
        } else {
          fail(7, `GET /api/finance/accounts/${state.accountId}`, balAfterVoid.status, balAfterVoid.body,
            `Sau VOID, currentBalance=${balanceAfterVoid} (kỳ vọng ${balanceAfterCreate + 500_000}) — trigger fin_account_recalc_balance có thể không lọc status='POSTED' đúng, hoặc route void không update status trước khi trigger chạy lại.`);
          step("Bước 7", false, `currentBalance sau void=${balanceAfterVoid} (kỳ vọng ${balanceAfterCreate + 500_000})`);
        }
      } else {
        fail(7, `POST /api/finance/transactions/${txId}/void`, voidRes.status, voidRes.body,
          "Không void được transaction. Kiểm tra RBAC guard requireCan(req, 'update', 'finance') trong transactions/[id]/void/route.ts hoặc voidTransaction() trong finTransactions.ts.");
        step("Bước 7", false, `HTTP ${voidRes.status}`);
      }
    } else {
      fail(7, "POST /api/finance/transactions", createRes.status, createRes.body, "Không tạo được transaction để test void.");
      step("Bước 7", false, `HTTP ${createRes.status} khi tạo transaction chuẩn bị`);
    }
  } else {
    step("Nhóm 7", false, "SKIP — không có tài khoản (bước 1b fail)");
  }

  printSummaryAndExit();
}

function printSummaryAndExit() {
  // ===================================================================
  // Summary table
  // ===================================================================
  console.log(c("\n\n=== TỔNG KẾT ===", "bold"));
  console.log(c("Step pass/fail:", "bold"));
  for (const s of stepLog) {
    const tag = s.ok ? c("PASS", "green") : c("FAIL", "red");
    console.log(`  [${tag}]  ${s.name.padEnd(14)}  ${s.summary}`);
  }
  const passCount = stepLog.filter((s) => s.ok).length;
  console.log(c(`\nSố bước: ${passCount}/${stepLog.length} PASS`, "bold"));

  const fails = issues.filter((i) => i.kind === "FAIL");
  const warns = issues.filter((i) => i.kind === "WARN");
  console.log(c(`Issues: ${fails.length} FAIL · ${warns.length} WARN`, "bold"));

  if (fails.length) {
    console.log(c("\nFAILURES (chi tiết endpoint/status/body/gợi ý):", "red"));
    for (const i of fails) {
      console.log(c(`\n  Nhóm ${i.step} · ${i.endpoint}`, "red"));
      console.log(`    HTTP: ${i.status}`);
      console.log(`    Body: ${bodySnip(i.body)}`);
      console.log(c(`    Gợi ý: ${i.hint}`, "yellow"));
    }
  }
  if (warns.length) {
    console.log(c("\nWARNINGS (thiếu account/data — đã SKIP thay vì crash):", "yellow"));
    for (const i of warns) {
      console.log(c(`  Nhóm ${i.step} · ${i.endpoint}`, "yellow"));
      console.log(`    ${i.hint}`);
    }
  }

  console.log(c("\n=== CLEANUP (dọn tay nếu cần, KHÔNG tự xoá) ===", "bold"));
  console.log(`  Tag: ${TAG} ${TS}`);
  console.log(`  fin_account ids:`, createdIds.accountIds.filter(Boolean));
  console.log(`  fin_invoice ids:`, createdIds.invoiceIds.filter(Boolean));
  console.log(`  fin_payment ids:`, createdIds.paymentIds.filter(Boolean));
  console.log(`  fin_transaction ids (tạo thủ công, không tính transaction sinh từ payment):`, createdIds.transactionIds.filter(Boolean));
  console.log(c(`  → grep name/notes/description chứa "${TAG}" trong app.fin_account / app.fin_invoice / app.fin_payment / app.fin_transaction để xoá tay nếu cần.`, "gray"));
  console.log(c(`  → Lưu ý: fin_payment KHÔNG có cột soft-delete riêng — muốn dọn payment test, gọi lại voidPaymentWithAllocations qua code hoặc xoá tay theo transaction thật trên staging, KHÔNG thao tác tay trên prod nếu không chắc.`, "gray"));

  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c(`\nUNCAUGHT: ${err?.stack || err}`, "red"));
  process.exit(2);
});
