#!/usr/bin/env node
// =====================================================================
// E2E Notification Flow Test — MES SongChau
// =====================================================================
// Mục đích: kiểm chứng hệ thống THÔNG BÁO (notification) của luồng duyệt
// đề xuất vật tư (YCVT/PR) 3 bước V4.0 hoạt động đúng và KHÔNG AI BỊ MISS:
//   1. Tạo phiếu (auto-submit)  → PR_SUBMITTED  fan-out direct: warehouse,
//      purchaser, admin (V4.0: warehouse là "Trưởng bộ phận" kiểm tồn).
//   2. Kho duyệt bước 2 (dept-approve, chỉ admin|warehouse — planner ĐÃ
//      MẤT quyền V4.0) → PR_DEPT_APPROVED tới: purchaser, admin, creator.
//   3. Duyệt cuối (director-approve admin|purchaser, hoặc quick-approve
//      admin) → PR_APPROVED tới: creator + accountant.
//
// Bám sát pattern tests/e2e/cross-role-flow.mjs: plain Node fetch (không
// framework), cookie jar riêng từng role (Map), màu ANSI, issues[] +
// stepLog[], chạy bằng `node tests/e2e/notification-flow.mjs`.
//
// Chạy:
//   node tests/e2e/notification-flow.mjs
//   BASE=http://localhost:3001 node tests/e2e/notification-flow.mjs
//
// Constraints:
//   - KHÔNG dùng admin để bypass RBAC ở các bước test quyền (Nhóm 2).
//   - Mọi data tạo ra gắn tag [E2E-NOTIF] để nhận diện + dọn tay sau.
//   - KHÔNG tự xoá dữ liệu — chỉ in danh sách cuối script.
//   - Exit code 1 nếu FAIL, 0 nếu pass (cắm CI sau này).
// =====================================================================

const BASE = process.env.BASE || "https://mes.songchau.vn";
const PASSWORDS = ["Test@1234", "Test123!", "ChangeMe!234"];
const TAG = "[E2E-NOTIF]";
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// ----- danh sách role cần cho kịch bản + username seed thực tế -----
// V4.0 — dùng bộ account `e2e.*` RIÊNG cho test (xem
// packages/db/migrations/seed-e2e-test-users.sql). KHÔNG dùng account nhân
// viên thật trên prod (THIETKE-DUC, KHO-HOA, THUMUA-KETOAN...) vì test không
// được biết/đổi mật khẩu của người dùng thật.
//
// Chạy seed trước khi test lần đầu:
//   docker exec -i iot_postgres psql -U hethong_app -d hethong_iot \
//     -f - < packages/db/migrations/seed-e2e-test-users.sql
const ROLE_USERS = {
  admin: "admin",
  planner: "e2e.planner",
  purchaser: "e2e.purchaser",
  warehouse: "e2e.warehouse",
  operator: "e2e.operator", // dùng làm role "không liên quan" (Nhóm 2 + 4)
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
const createdIds = { prIds: [], prCodes: [] }; // để in cleanup cuối

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
    if (r.ok) return { ok: true, password };
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

// ----- helper nghiệp vụ: đọc unreadCount + list notif của 1 role -----
async function getNotifState(role) {
  const res = await call(role, "GET", "/api/notifications?limit=50");
  if (!res.ok) return { ok: false, res, unreadCount: null, items: [] };
  return {
    ok: true,
    res,
    unreadCount: res.body?.meta?.unreadCount ?? null,
    items: res.body?.data ?? [],
  };
}

/**
 * Tìm notification khớp eventType + entityId trong danh sách `items`.
 * Trả về undefined nếu không tìm thấy — caller tự fail/warn theo ngữ cảnh.
 */
function findNotif(items, eventType, entityId) {
  return items.find((n) => n.eventType === eventType && n.entityId === entityId);
}

async function main() {
  console.log(c("\n=== E2E Notification Flow Test ===", "bold"));
  console.log(c(`Base: ${BASE}`, "cyan"));
  console.log(c(`Run tag: ${TAG} ${TS}`, "cyan"));

  // ===================================================================
  // Pre: login tất cả role cần dùng
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
      warn("PRE", "POST /api/auth/login", `Không login được role=${role} user=${ROLE_USERS[role]} — các nhóm test cần role này sẽ SKIP (WARN), không crash. Kiểm tra account có tồn tại/active không (packages/db/migrations/seed-test-users.sql, seed-ketoan-user.sql).`);
    } else {
      logInfo(`login ${role} (${ROLE_USERS[role]}) OK (password=${lr.password})`);
    }
  }

  const has = (role) => loginResults[role]?.ok === true;

  // Các nhóm cần tối thiểu các role nào:
  const group1Ready = has("warehouse") && has("purchaser") && has("admin") && has("planner");
  const group2Ready = has("planner") && has("warehouse") && has("operator");
  const group4Ready = has("planner") && has("operator");

  if (!group1Ready) {
    warn("PRE", "GROUP-1", "Thiếu 1 trong các role warehouse/purchaser/admin/planner — SKIP Nhóm 1 (luồng thông báo PR đầy đủ) + phần lớn Nhóm 3.");
  }
  if (!group2Ready) {
    warn("PRE", "GROUP-2", "Thiếu 1 trong các role planner/warehouse/operator — SKIP Nhóm 2 (RBAC dept-approve).");
  }
  if (!group4Ready) {
    warn("PRE", "GROUP-4", "Thiếu 1 trong các role planner/operator — SKIP Nhóm 4 (rò rỉ dữ liệu).");
  }

  // snapshot kết quả chạy
  const created = { prId: null, prCode: null, prTitle: null, notifIdOwnedByPlanner: null };

  // ===================================================================
  // NHÓM 1 — Luồng thông báo PR đầy đủ (mấu chốt "không ai miss")
  // ===================================================================
  console.log(c("\n=== NHÓM 1: Luồng thông báo PR đầy đủ ===", "bold"));

  let baseline = {}; // role → unreadCount TRƯỚC khi tạo phiếu

  if (group1Ready) {
    // ---- 1a. Baseline unreadCount TRƯỚC khi tạo phiếu ----
    console.log(c("\n--- Bước 1a: Ghi nhận baseline unreadCount ---", "bold"));
    for (const role of ["warehouse", "purchaser", "admin", "planner", "accountant"]) {
      if (!has(role)) continue;
      const st = await getNotifState(role);
      if (st.ok) {
        baseline[role] = st.unreadCount;
        logInfo(`baseline unreadCount[${role}] = ${st.unreadCount}`);
      } else {
        fail(1, "GET /api/notifications", st.res.status, st.res.body, `${role} không lấy được baseline unreadCount.`);
      }
    }

    // ---- 1b. planner tạo PR mới (tag nhận diện trong title) ----
    console.log(c("\n--- Bước 1b: planner tạo phiếu YCVT mới ---", "bold"));
    const items = await call("planner", "GET", "/api/items?type=PURCHASED&pageSize=20");
    let itemRow = (items.body?.data ?? [])[0];
    if (!itemRow) {
      // fallback: bất kỳ item nào active
      const any = await call("planner", "GET", "/api/items?pageSize=10");
      itemRow = (any.body?.data ?? [])[0];
    }
    if (!itemRow) {
      fail(1, "GET /api/items", items.status, items.body, "Không tìm được item nào để tạo PR — seed thiếu data.");
      step("Bước 1b", false, "Không có item để tạo PR — abort Nhóm 1");
    } else {
      created.prTitle = `${TAG} ${TS}`;
      const prRes = await call("planner", "POST", "/api/purchase-requests", {
        body: {
          title: created.prTitle,
          source: "MANUAL",
          notes: `${TAG} auto-generated — an toàn để xoá`,
          lines: [{ itemId: itemRow.id, qty: 1, notes: "e2e-notif line" }],
        },
      });
      if (prRes.status === 201) {
        const pr = prRes.body?.data;
        created.prId = pr?.id;
        created.prCode = pr?.paperFormNo ?? pr?.code;
        createdIds.prIds.push(created.prId);
        createdIds.prCodes.push(created.prCode);
        // Xác nhận auto-submit đã chạy (approvalStep phải = SUBMITTED, không DRAFT)
        // — nếu không SUBMITTED thì notifyPRSubmitted không được gọi và toàn bộ
        // Nhóm 1 sẽ fail dây chuyền, nên assert riêng ngay tại đây cho rõ nguyên nhân.
        if (pr?.status === "SUBMITTED" || pr?.approvalStep === "SUBMITTED") {
          step("Bước 1b", true, `Tạo PR ${created.prCode} (id=${created.prId?.slice(0, 8)}…) status=${pr?.status} approvalStep=${pr?.approvalStep}`);
        } else {
          fail(1, "POST /api/purchase-requests", prRes.status, prRes.body,
            `PR tạo xong nhưng KHÔNG ở trạng thái SUBMITTED (status=${pr?.status}, approvalStep=${pr?.approvalStep}) → notifyPRSubmitted không được gọi theo route hiện tại (chỉ gọi khi finalStatus === "SUBMITTED"). Kiểm tra auto-submit trong POST /api/purchase-requests/route.ts.`);
          step("Bước 1b", false, `PR tạo nhưng không SUBMITTED — các assert notif phía sau sẽ fail theo`);
        }
      } else {
        fail(1, "POST /api/purchase-requests", prRes.status, prRes.body,
          "planner không tạo được PR. Kiểm tra prCreateSchema + RBAC create:pr cho planner.");
        step("Bước 1b", false, `Tạo PR fail HTTP ${prRes.status}`);
      }
    }

    // ---- 1c. Assert PR_SUBMITTED tới warehouse + purchaser + admin ----
    if (created.prId) {
      console.log(c("\n--- Bước 1c: assert PR_SUBMITTED không ai bị miss ---", "bold"));
      // Đợi ngắn để fire-and-forget notify* (không await trong route) kịp insert.
      await sleep(800);
      for (const role of ["warehouse", "purchaser", "admin"]) {
        if (!has(role)) continue;
        const st = await getNotifState(role);
        if (!st.ok) {
          fail(1, "GET /api/notifications", st.res.status, st.res.body, `${role} không đọc được notifications sau khi PR submitted.`);
          continue;
        }
        const matched = findNotif(st.items, "PR_SUBMITTED", created.prId);
        if (!matched) {
          fail(1, "GET /api/notifications", 200, null,
            `${role} KHÔNG nhận được PR_SUBMITTED cho phiếu ${created.prCode} — ĐÂY LÀ MISS. Kiểm tra notifyPRSubmitted() trong notifications.ts có gọi emitToUsersWithRole("${role}", ...) không, và user test role=${role} có active=true không.`);
          continue;
        }
        // isDirect PHẢI true — đây là fan-out direct (emitToUsersWithRole), không phải broadcast.
        // Nếu isDirect=false nghĩa là code đã bị revert về emitNotification({recipientRole})
        // (broadcast) — về mặt chức năng vẫn hiển thị nhưng KHÔNG đếm badge → dễ bị người dùng bỏ sót.
        if (matched.isDirect !== true) {
          fail(1, "GET /api/notifications", 200, matched,
            `${role} nhận PR_SUBMITTED nhưng isDirect=${matched.isDirect} (kỳ vọng true). notifyPRSubmitted phải dùng emitToUsersWithRole (fan-out direct, đếm badge) chứ không phải emitNotification({recipientRole}) (broadcast, không đếm badge) — xem comment V3.16 trong notifications.ts.`);
        } else {
          logInfo(`${role} nhận PR_SUBMITTED đúng (isDirect=true, title="${matched.title}")`);
        }
        // unreadCount phải TĂNG so với baseline — đây là điểm mấu chốt "không miss badge".
        const after = await getNotifState(role);
        if (after.ok && baseline[role] !== undefined) {
          if (after.unreadCount > baseline[role]) {
            logInfo(`${role} unreadCount tăng: ${baseline[role]} → ${after.unreadCount}`);
          } else {
            fail(1, "GET /api/notifications (unreadCount)", 200, { before: baseline[role], after: after.unreadCount },
              `${role} unreadCount KHÔNG tăng sau PR_SUBMITTED (before=${baseline[role]}, after=${after.unreadCount}) — badge chuông sẽ không nhắc, coi như MISS dù có row trong DB.`);
          }
        }
      }
      step("Bước 1c", !issues.some((i) => i.step === 1 && i.kind === "FAIL"), "Assert PR_SUBMITTED cho warehouse/purchaser/admin");
    } else {
      step("Bước 1c", false, "Không có PR để assert (bước 1b fail)");
    }

    // ---- 1d. Kho duyệt bước 2 (dept-approve) → assert PR_DEPT_APPROVED ----
    console.log(c("\n--- Bước 1d: warehouse duyệt bước 2 (dept-approve) ---", "bold"));
    if (created.prId && has("warehouse")) {
      const baseline2 = {};
      for (const role of ["purchaser", "admin"]) {
        if (!has(role)) continue;
        const st = await getNotifState(role);
        if (st.ok) baseline2[role] = st.unreadCount;
      }
      const deptApprove = await call("warehouse", "POST", `/api/purchase-requests/${created.prId}/dept-approve`, {
        body: { note: `${TAG} kho kiểm tồn OK` },
      });
      if (deptApprove.status === 200 && deptApprove.body?.data?.approvalStep === "DEPT_APPROVED") {
        step("Bước 1d", true, `warehouse duyệt bước 2 thành công → approvalStep=DEPT_APPROVED`);
        await sleep(800);
        // assert purchaser + admin + creator (planner) đều nhận PR_DEPT_APPROVED
        for (const role of ["purchaser", "admin", "planner"]) {
          if (!has(role)) continue;
          const st = await getNotifState(role);
          if (!st.ok) {
            fail(1, "GET /api/notifications", st.res.status, st.res.body, `${role} không đọc được notifications sau dept-approve.`);
            continue;
          }
          const matched = findNotif(st.items, "PR_DEPT_APPROVED", created.prId);
          if (!matched) {
            fail(1, "GET /api/notifications", 200, null,
              `${role} KHÔNG nhận được PR_DEPT_APPROVED cho phiếu ${created.prCode} — MISS. Kiểm tra notifyPRDeptApproved() có emit tới role="${role === "planner" ? "creator (requestedBy)" : role}" không.`);
          } else {
            logInfo(`${role} nhận PR_DEPT_APPROVED đúng (title="${matched.title}")`);
            if (role !== "planner" && baseline2[role] !== undefined) {
              const after = await getNotifState(role);
              if (after.ok && after.unreadCount <= baseline2[role]) {
                fail(1, "GET /api/notifications (unreadCount)", 200, { before: baseline2[role], after: after.unreadCount },
                  `${role} unreadCount KHÔNG tăng sau PR_DEPT_APPROVED.`);
              }
            }
          }
        }
      } else {
        fail(1, `POST /api/purchase-requests/${created.prId}/dept-approve`, deptApprove.status, deptApprove.body,
          "warehouse (Kho) không duyệt được bước 2. Kiểm tra RBAC route dept-approve (admin|warehouse) + PR đang đúng approvalStep=SUBMITTED.");
        step("Bước 1d", false, `dept-approve fail HTTP ${deptApprove.status}`);
      }
    } else {
      step("Bước 1d", false, "Không có PR hoặc warehouse chưa login — skip dept-approve");
    }

    // ---- 1e. Duyệt cuối (director-approve) → assert PR_APPROVED tới creator + accountant ----
    console.log(c("\n--- Bước 1e: purchaser duyệt cuối (director-approve) ---", "bold"));
    if (created.prId && has("purchaser")) {
      // chỉ chạy nếu bước 1d đã đưa PR sang DEPT_APPROVED
      const prCheck = await call("purchaser", "GET", `/api/purchase-requests/${created.prId}`);
      if (prCheck.ok && prCheck.body?.data?.approvalStep === "DEPT_APPROVED") {
        const baseline3 = {};
        if (has("accountant")) {
          const st = await getNotifState("accountant");
          if (st.ok) baseline3.accountant = st.unreadCount;
        }
        const dirApprove = await call("purchaser", "POST", `/api/purchase-requests/${created.prId}/director-approve`, {
          body: { note: `${TAG} duyệt cuối` },
        });
        if (dirApprove.status === 200 && dirApprove.body?.data?.status === "APPROVED") {
          step("Bước 1e", true, "purchaser duyệt cuối thành công → status=APPROVED");
          await sleep(800);
          // creator (planner) nhận PR_APPROVED
          if (has("planner")) {
            const st = await getNotifState("planner");
            const matched = st.ok ? findNotif(st.items, "PR_APPROVED", created.prId) : null;
            if (matched) logInfo(`planner (creator) nhận PR_APPROVED đúng (title="${matched.title}")`);
            else fail(1, "GET /api/notifications", 200, null,
              `planner (người tạo phiếu) KHÔNG nhận PR_APPROVED cho ${created.prCode} — MISS. Kiểm tra notifyPRApproved() emitNotification({recipientUser: creatorUserId}).`);
          }
          // accountant nhận PR_APPROVED
          if (has("accountant")) {
            const st = await getNotifState("accountant");
            const matched = st.ok ? findNotif(st.items, "PR_APPROVED", created.prId) : null;
            if (matched) {
              logInfo(`accountant nhận PR_APPROVED đúng (title="${matched.title}", isDirect=${matched.isDirect})`);
              if (matched.isDirect !== true) {
                fail(1, "GET /api/notifications", 200, matched,
                  `accountant nhận PR_APPROVED nhưng isDirect=${matched.isDirect} (kỳ vọng true — notifyPRApprovedToAccounting dùng emitToUsersWithRole).`);
              }
              if (st.ok && baseline3.accountant !== undefined && st.unreadCount <= baseline3.accountant) {
                fail(1, "GET /api/notifications (unreadCount)", 200, { before: baseline3.accountant, after: st.unreadCount },
                  "accountant unreadCount không tăng sau PR_APPROVED.");
              }
            } else {
              fail(1, "GET /api/notifications", 200, null,
                `accountant KHÔNG nhận PR_APPROVED cho ${created.prCode} — MISS. Kiểm tra notifyPRApprovedToAccounting() có được gọi trong director-approve route không.`);
            }
          } else {
            warn(1, "GET /api/notifications", "Thiếu account 'ketoan' (accountant) — SKIP assert PR_APPROVED → accountant.");
          }
        } else {
          fail(1, `POST /api/purchase-requests/${created.prId}/director-approve`, dirApprove.status, dirApprove.body,
            "purchaser không duyệt cuối được. Kiểm tra RBAC route director-approve (admin|purchaser) + PR đang DEPT_APPROVED.");
          step("Bước 1e", false, `director-approve fail HTTP ${dirApprove.status}`);
        }
      } else {
        step("Bước 1e", false, "PR chưa ở DEPT_APPROVED (bước 1d có thể đã fail) — skip director-approve");
      }
    } else {
      step("Bước 1e", false, "Không có PR hoặc purchaser chưa login — skip director-approve");
    }
  } else {
    step("Nhóm 1", false, "SKIP — thiếu role bắt buộc (xem WARN ở trên)");
  }

  // ===================================================================
  // NHÓM 2 — RBAC của luồng duyệt (V4.0)
  // ===================================================================
  console.log(c("\n=== NHÓM 2: RBAC luồng duyệt (V4.0) ===", "bold"));
  if (group2Ready) {
    // Cần 1 PR riêng ở trạng thái SUBMITTED để test dept-approve RBAC —
    // KHÔNG dùng chung PR của Nhóm 1 vì PR đó có thể đã DEPT_APPROVED/APPROVED
    // (state machine chặn — sẽ trả 409 thay vì 403, làm sai lệch ý nghĩa test).
    console.log(c("\n--- Tạo PR riêng cho test RBAC ---", "bold"));
    const items2 = await call("planner", "GET", "/api/items?type=PURCHASED&pageSize=5");
    const item2 = (items2.body?.data ?? [])[0] ?? (await call("planner", "GET", "/api/items?pageSize=5")).body?.data?.[0];
    let rbacPrId = null;
    if (item2) {
      const prRes2 = await call("planner", "POST", "/api/purchase-requests", {
        body: {
          title: `${TAG} RBAC ${TS}`,
          source: "MANUAL",
          notes: `${TAG} test RBAC dept-approve`,
          lines: [{ itemId: item2.id, qty: 1 }],
        },
      });
      if (prRes2.status === 201) {
        rbacPrId = prRes2.body?.data?.id;
        createdIds.prIds.push(rbacPrId);
        createdIds.prCodes.push(prRes2.body?.data?.paperFormNo ?? prRes2.body?.data?.code);
        logInfo(`Tạo PR RBAC test id=${rbacPrId?.slice(0, 8)}… status=${prRes2.body?.data?.status}`);
      } else {
        fail(2, "POST /api/purchase-requests", prRes2.status, prRes2.body, "Không tạo được PR riêng cho test RBAC Nhóm 2.");
      }
    } else {
      fail(2, "GET /api/items", null, null, "Không có item để tạo PR test RBAC.");
    }

    if (rbacPrId) {
      // 2a. planner gọi dept-approve → PHẢI 403 (đã mất quyền V4.0)
      const plannerTry = await call("planner", "POST", `/api/purchase-requests/${rbacPrId}/dept-approve`, {
        body: { note: "planner thử duyệt — phải bị chặn" },
      });
      if (plannerTry.status === 403) {
        step("Bước 2a", true, "planner gọi dept-approve → 403 đúng như kỳ vọng (đã mất quyền V4.0)");
      } else {
        fail(2, `POST /api/purchase-requests/${rbacPrId}/dept-approve`, plannerTry.status, plannerTry.body,
          `planner gọi dept-approve trả HTTP ${plannerTry.status} thay vì 403 — RBAC V4.0 bị hở, planner (Thiết kế) đáng lẽ đã mất quyền duyệt bước 2 (xem route dept-approve/route.ts check roles.includes("admin")||("warehouse")).`);
        step("Bước 2a", false, `planner dept-approve trả ${plannerTry.status} (kỳ vọng 403)`);
      }

      // 2b. operator (role không liên quan) gọi → PHẢI 403
      const operatorTry = await call("operator", "POST", `/api/purchase-requests/${rbacPrId}/dept-approve`, {
        body: { note: "operator thử duyệt — phải bị chặn" },
      });
      if (operatorTry.status === 403) {
        step("Bước 2b", true, "operator (role không liên quan) gọi dept-approve → 403 đúng như kỳ vọng");
      } else {
        fail(2, `POST /api/purchase-requests/${rbacPrId}/dept-approve`, operatorTry.status, operatorTry.body,
          `operator gọi dept-approve trả HTTP ${operatorTry.status} thay vì 403 — RBAC hở cho role không liên quan.`);
        step("Bước 2b", false, `operator dept-approve trả ${operatorTry.status} (kỳ vọng 403)`);
      }

      // 2c. warehouse gọi → PHẢI 200 (đúng quyền V4.0, "Trưởng bộ phận")
      const warehouseTry = await call("warehouse", "POST", `/api/purchase-requests/${rbacPrId}/dept-approve`, {
        body: { note: `${TAG} warehouse duyệt hợp lệ` },
      });
      if (warehouseTry.status === 200) {
        step("Bước 2c", true, "warehouse gọi dept-approve → 200 đúng như kỳ vọng (V4.0 Trưởng bộ phận)");
      } else {
        fail(2, `POST /api/purchase-requests/${rbacPrId}/dept-approve`, warehouseTry.status, warehouseTry.body,
          `warehouse gọi dept-approve trả HTTP ${warehouseTry.status} thay vì 200 — warehouse ĐÁNG LẼ có quyền duyệt bước 2 theo V4.0 (RBAC matrix packages/shared/src/rbac/matrix.ts phải có pr:["...","approve"] cho warehouse).`);
        step("Bước 2c", false, `warehouse dept-approve trả ${warehouseTry.status} (kỳ vọng 200)`);
      }
    } else {
      step("Nhóm 2", false, "Không có PR để test RBAC — abort Nhóm 2");
    }
  } else {
    step("Nhóm 2", false, "SKIP — thiếu role bắt buộc (planner/warehouse/operator)");
  }

  // ===================================================================
  // NHÓM 3 — Cơ chế đọc/đếm badge
  // ===================================================================
  console.log(c("\n=== NHÓM 3: Cơ chế đọc/đếm badge ===", "bold"));
  if (has("warehouse")) {
    // Dùng chính notification PR_SUBMITTED mà warehouse nhận ở Nhóm 1 (nếu có),
    // nếu không thì lấy bất kỳ unread nào của warehouse để test cơ chế đọc.
    console.log(c("\n--- Bước 3a: đánh dấu 1 notification đã đọc ---", "bold"));
    const before = await getNotifState("warehouse");
    if (before.ok) {
      const unreadItem = before.items.find((n) => n.isDirect && !n.readAt);
      if (unreadItem) {
        const beforeCount = before.unreadCount;
        const markRes = await call("warehouse", "POST", `/api/notifications/${unreadItem.id}/read`, { body: {} });
        if (markRes.ok && markRes.body?.data?.marked) {
          const after = await getNotifState("warehouse");
          if (after.ok && after.unreadCount === beforeCount - 1) {
            step("Bước 3a", true, `Đánh dấu đã đọc → unreadCount giảm đúng 1 (${beforeCount} → ${after.unreadCount})`);
          } else {
            fail(3, "POST /api/notifications/[id]/read", 200, { before: beforeCount, after: after.unreadCount },
              `unreadCount không giảm đúng 1 sau khi mark-read (before=${beforeCount}, after=${after.unreadCount}). Kiểm tra getUnreadCount/route GET đếm lại đúng chưa.`);
            step("Bước 3a", false, "unreadCount không giảm đúng 1");
          }
        } else {
          fail(3, `POST /api/notifications/${unreadItem.id}/read`, markRes.status, markRes.body,
            "Mark-read fail hoặc marked=false dù notification thuộc chính warehouse và chưa đọc.");
          step("Bước 3a", false, `Mark-read fail HTTP ${markRes.status}`);
        }
      } else {
        warn(3, "GET /api/notifications", "warehouse không có notification direct chưa đọc nào để test mark-read (có thể Nhóm 1 đã fail trước đó) — SKIP Bước 3a.");
        step("Bước 3a", false, "Không có unread notif để test — skip");
      }
    } else {
      fail(3, "GET /api/notifications", before.res.status, before.res.body, "warehouse không đọc được notifications.");
      step("Bước 3a", false, "Không lấy được state ban đầu");
    }

    // ---- 3b. read-all → unreadCount về 0 ----
    console.log(c("\n--- Bước 3b: read-all → unreadCount về 0 ---", "bold"));
    const readAllRes = await call("warehouse", "POST", "/api/notifications/read-all", { body: {} });
    if (readAllRes.ok) {
      const after = await getNotifState("warehouse");
      if (after.ok && after.unreadCount === 0) {
        step("Bước 3b", true, `read-all thành công (marked=${readAllRes.body?.data?.marked}) → unreadCount=0`);
      } else {
        fail(3, "POST /api/notifications/read-all", 200, { unreadCountAfter: after.unreadCount },
          `Sau read-all, unreadCount vẫn = ${after.unreadCount} (kỳ vọng 0).`);
        step("Bước 3b", false, `unreadCount sau read-all = ${after.unreadCount}, kỳ vọng 0`);
      }
    } else {
      fail(3, "POST /api/notifications/read-all", readAllRes.status, readAllRes.body, "read-all fail.");
      step("Bước 3b", false, `read-all fail HTTP ${readAllRes.status}`);
    }

    // ---- 3c. notification của người khác KHÔNG đếm vào badge của mình ----
    // (không rò rỉ chéo unreadCount) — kiểm bằng cách: sau khi warehouse đã
    // read-all (unreadCount=0), nếu purchaser vừa nhận 1 notif mới (Nhóm 1
    // bước 1e chẳng hạn) thì warehouse vẫn phải = 0, KHÔNG bị cộng nhầm.
    console.log(c("\n--- Bước 3c: cross-check không rò rỉ badge chéo ---", "bold"));
    if (has("purchaser")) {
      const whAfter = await getNotifState("warehouse");
      const puAfter = await getNotifState("purchaser");
      if (whAfter.ok && puAfter.ok) {
        // Điều kiện thật sự cần: unreadCount của warehouse chỉ phụ thuộc
        // recipient_user=warehouse.id, không lẫn của purchaser.
        // Assert gián tiếp: whAfter.unreadCount === 0 (đã read-all ở 3b) dù
        // purchaser có thể có unread > 0 tại cùng thời điểm.
        if (whAfter.unreadCount === 0) {
          logInfo(`warehouse unreadCount=0 độc lập với purchaser unreadCount=${puAfter.unreadCount} (không rò rỉ chéo)`);
          step("Bước 3c", true, "Badge warehouse không bị ảnh hưởng bởi notification của purchaser");
        } else {
          fail(3, "GET /api/notifications (cross-check)", 200, { warehouse: whAfter.unreadCount, purchaser: puAfter.unreadCount },
            "warehouse unreadCount != 0 sau read-all trong lúc kiểm tra rò rỉ chéo — có thể badge đang cộng nhầm notification role khác.");
          step("Bước 3c", false, "warehouse unreadCount bất thường");
        }
      } else {
        warn(3, "GET /api/notifications", "Không đọc được state để cross-check rò rỉ chéo badge — SKIP.");
      }
    } else {
      warn(3, "GET /api/notifications", "Thiếu role purchaser để cross-check rò rỉ chéo badge — SKIP Bước 3c.");
    }
  } else {
    step("Nhóm 3", false, "SKIP — thiếu role warehouse");
  }

  // ===================================================================
  // NHÓM 4 — Không rò rỉ dữ liệu (user không có quyền đọc PR không được
  // notify về phiếu đó)
  // ===================================================================
  console.log(c("\n=== NHÓM 4: Không rò rỉ dữ liệu ===", "bold"));
  if (group4Ready && created.prId) {
    // operator không tạo PR này, không phải warehouse/purchaser/admin/accountant
    // → theo PR_VIEW_ALL_ROLES (prAccess.ts) operator KHÔNG được xem PR người
    // khác tạo (GET detail trả 404) và cũng không nằm trong danh sách nhận
    // notify của luồng PR_SUBMITTED/DEPT_APPROVED/APPROVED (chỉ warehouse/
    // purchaser/admin/creator/accountant). Assert cả 2 mặt: API detail 404
    // VÀ notification không rò rỉ.
    console.log(c("\n--- Bước 4a: operator không đọc được PR detail của phiếu Nhóm 1 ---", "bold"));
    const detailTry = await call("operator", "GET", `/api/purchase-requests/${created.prId}`);
    if (detailTry.status === 404) {
      step("Bước 4a", true, "operator GET PR detail (không sở hữu) → 404 đúng như kỳ vọng (không lộ tồn tại phiếu)");
    } else {
      fail(4, `GET /api/purchase-requests/${created.prId}`, detailTry.status, detailTry.body,
        `operator xem được PR không thuộc quyền (HTTP ${detailTry.status}, kỳ vọng 404) — RÒ RỈ DỮ LIỆU. Kiểm tra canViewAllPRs() + ownership check trong GET /api/purchase-requests/[id]/route.ts.`);
      step("Bước 4a", false, `operator xem PR detail trả ${detailTry.status} (kỳ vọng 404)`);
    }

    console.log(c("\n--- Bước 4b: operator KHÔNG nhận notification của phiếu Nhóm 1 ---", "bold"));
    const opState = await getNotifState("operator");
    if (opState.ok) {
      const leaked = opState.items.find(
        (n) => n.entityId === created.prId && ["PR_SUBMITTED", "PR_DEPT_APPROVED", "PR_APPROVED"].includes(n.eventType),
      );
      if (!leaked) {
        step("Bước 4b", true, "operator không nhận bất kỳ notification nào của phiếu không liên quan — đúng kỳ vọng");
      } else {
        fail(4, "GET /api/notifications", 200, leaked,
          `operator nhận được notification "${leaked.eventType}" của phiếu ${created.prCode} dù không liên quan (không phải warehouse/purchaser/admin/creator/accountant) — RÒ RỈ. Kiểm tra emitToUsersWithRole/emitNotification không vô tình gửi cho role operator.`);
        step("Bước 4b", false, "operator nhận nhầm notification của phiếu người khác");
      }
    } else {
      fail(4, "GET /api/notifications", opState.res.status, opState.res.body, "operator không đọc được notifications.");
      step("Bước 4b", false, "Không lấy được notifications của operator");
    }
  } else {
    step("Nhóm 4", false, "SKIP — thiếu role (planner/operator) hoặc chưa có PR từ Nhóm 1 để test rò rỉ");
  }

  // ===================================================================
  // Summary table
  // ===================================================================
  console.log(c("\n\n=== TỔNG KẾT ===", "bold"));
  console.log(c("Step pass/fail:", "bold"));
  for (const s of stepLog) {
    const tag = s.ok ? c("PASS", "green") : c("FAIL", "red");
    console.log(`  [${tag}]  ${s.name.padEnd(12)}  ${s.summary}`);
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
  if (createdIds.prIds.length) {
    console.log(`  PR ids tạo ra:`);
    for (let i = 0; i < createdIds.prIds.length; i++) {
      console.log(`    - ${createdIds.prIds[i]} (${createdIds.prCodes[i] ?? "?"})`);
    }
  } else {
    console.log("  (không có PR nào được tạo)");
  }
  console.log(c(`  → grep title/notes chứa "${TAG}" trong bảng purchase_request để xoá tay nếu cần.`, "gray"));

  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c(`\nUNCAUGHT: ${err?.stack || err}`, "red"));
  process.exit(2);
});
