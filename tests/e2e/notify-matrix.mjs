#!/usr/bin/env node
// =====================================================================
// E2E Notify Matrix — MES SongChau (TASK-notify V4.4)
// =====================================================================
// Bổ sung cho tests/e2e/notification-flow.mjs (đã kiểm kỹ fan-out PR 3
// bước) — script này tập trung vào 3 mảng MỚI của đợt V4.4 mà
// notification-flow.mjs KHÔNG kiểm:
//
//   A. Chống trùng / tự hết hiệu lực ("hộp thư dồn"): khi PR đi tiếp bước,
//      thông báo "chờ duyệt" bước TRƯỚC của mọi người nhận phải tự chuyển
//      sang ĐÃ ĐỌC (RESOLVES_STALE trong notification-plans.ts) — verify
//      bằng readAt khác null trong list, KHÔNG chỉ verify thông báo mới.
//   B. Lệnh sản xuất (WO): yêu cầu SX mới → operator nhận, người không liên
//      quan (Kho/QC) KHÔNG nhận.
//   C. Dashboard "Cần xử lý" PHẢI khớp nhóm "Cần bạn duyệt" của chuông
//      (sửa P0 kiểm kê giao diện — trước đây đếm sai/đếm chung mọi người).
//   D. API Web Push (subscribe/unsubscribe) — hợp đồng API, không cần trình
//      duyệt thật (xem tests/e2e/push-register.spec.mjs cho phần trình
//      duyệt thật qua Playwright).
//
// Chạy (BẮT BUỘC set BASE — KHÔNG mặc định prod):
//   BASE=http://127.0.0.1:3700 node tests/e2e/notify-matrix.mjs
//
// Tài khoản: admin/ChangeMe!234 + e2e.planner/e2e.purchaser/e2e.warehouse/
// e2e.operator/e2e.qc (Test@1234) — xem seed-e2e-test-users.sql. Thêm
// e2e.accountant (Test@1234, role accountant) nếu có seed riêng — script tự
// SKIP (WARN) nhóm liên quan nếu thiếu, không crash.
// =====================================================================

const BASE = process.env.BASE;
if (!BASE) {
  console.error(
    "[E2E] Thiếu biến môi trường BASE. Đặt tường minh trước khi chạy, ví dụ:\n" +
      "  BASE=http://127.0.0.1:3700 node tests/e2e/notify-matrix.mjs",
  );
  process.exit(1);
}
const PASSWORDS = ["Test@1234", "Test123!", "ChangeMe!234"];
const TAG = "[E2E-NOTIFY-MATRIX]";
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const ROLE_USERS = {
  admin: "admin",
  planner: "e2e.planner",
  purchaser: "e2e.purchaser",
  warehouse: "e2e.warehouse",
  operator: "e2e.operator",
  qc: "e2e.qc",
  accountant: "e2e.accountant", // bonus — không bắt buộc theo brief gốc
};

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

const issues = []; // {group, kind:"FAIL"|"WARN", endpoint, status, body, hint}
const stepLog = [];
const userJars = new Map();
const createdIds = { prIds: [], prCodes: [], itemIds: [], woIds: [] };

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (r.status === 401) continue;
    break;
  }
  return { ok: false, status: lastErr?.status, body: lastErr?.body };
}

function fail(group, endpoint, status, body, hint) {
  issues.push({ group, kind: "FAIL", endpoint, status, body, hint });
}
function warn(group, endpoint, hint) {
  issues.push({ group, kind: "WARN", endpoint, status: null, body: null, hint });
}
function step(name, ok, summary) {
  stepLog.push({ name, ok, summary });
  const tag = ok ? c("PASS", "green") : c("FAIL", "red");
  console.log(`\n[${tag}] ${c(name, "bold")} — ${summary}`);
}
function logInfo(msg) {
  console.log(c(`  · ${msg}`, "gray"));
}

async function getNotifState(role) {
  const res = await call(role, "GET", "/api/notifications?limit=100");
  if (!res.ok) return { ok: false, res, unreadCount: null, unreadTotal: null, items: [] };
  return {
    ok: true,
    res,
    unreadCount: res.body?.meta?.unreadCount ?? null,
    unreadTotal: res.body?.meta?.unreadTotal ?? null,
    items: res.body?.data ?? [],
  };
}

function findNotif(items, eventType, entityId) {
  return items.find((n) => n.eventType === eventType && n.entityId === entityId);
}

async function main() {
  console.log(c("\n=== E2E Notify Matrix (V4.4) ===", "bold"));
  console.log(c(`Base: ${BASE}`, "cyan"));
  console.log(c(`Run tag: ${TAG} ${TS}`, "cyan"));

  console.log(c("\n--- Pre: login các role ---", "bold"));
  const loginResults = {};
  const roleNames = Object.keys(ROLE_USERS);
  for (let idx = 0; idx < roleNames.length; idx++) {
    const role = roleNames[idx];
    if (idx > 0) await sleep(400);
    const lr = await login(role, ROLE_USERS[role]);
    loginResults[role] = lr;
    if (!lr.ok) {
      console.log(c(`  ! Login ${role} (${ROLE_USERS[role]}) FAILED status=${lr.status}`, "yellow"));
      warn("PRE", "POST /api/auth/login", `Không login được role=${role} user=${ROLE_USERS[role]} — nhóm test cần role này SKIP.`);
    } else {
      logInfo(`login ${role} (${ROLE_USERS[role]}) OK`);
    }
  }
  const has = (role) => loginResults[role]?.ok === true;

  // ===================================================================
  // NHÓM A — PR: chống trùng / tự hết hiệu lực khi đi tiếp bước
  // ===================================================================
  console.log(c("\n=== NHÓM A: PR — chống trùng + tự hết hiệu lực (RESOLVES_STALE) ===", "bold"));
  const groupAReady = has("planner") && has("warehouse") && has("purchaser") && has("admin");
  if (!groupAReady) {
    warn("A", "GROUP-A", "Thiếu role planner/warehouse/purchaser/admin — SKIP Nhóm A.");
  } else {
    const items = await call("planner", "GET", "/api/items?pageSize=10");
    const itemRow = (items.body?.data ?? [])[0];
    if (!itemRow) {
      fail("A", "GET /api/items", items.status, items.body, "Không có item nào để tạo PR — seed ít nhất 1 item trước khi chạy.");
      step("A.1 tạo PR", false, "Không có item — abort Nhóm A");
    } else {
      const prTitle = `${TAG} A ${TS}`;
      const prRes = await call("planner", "POST", "/api/purchase-requests", {
        body: {
          title: prTitle,
          source: "MANUAL",
          notes: `${TAG} auto-generated`,
          lines: [{ itemId: itemRow.id, qty: 1, notes: "e2e-notify-matrix" }],
        },
      });
      const pr = prRes.body?.data;
      if (prRes.status !== 201 || !pr?.id) {
        fail("A", "POST /api/purchase-requests", prRes.status, prRes.body, "planner không tạo được PR.");
        step("A.1 tạo PR", false, `HTTP ${prRes.status}`);
      } else {
        createdIds.prIds.push(pr.id);
        createdIds.prCodes.push(pr.paperFormNo ?? pr.code);
        step("A.1 tạo PR", true, `Tạo ${pr.paperFormNo ?? pr.code} (approvalStep=${pr.approvalStep})`);

        await sleep(800);
        // A.2 — PR_SUBMITTED tới warehouse + admin, KHÔNG tới operator/qc.
        console.log(c("\n--- A.2: PR_SUBMITTED đúng người, không lọt người ngoài ---", "bold"));
        for (const role of ["warehouse", "admin"]) {
          const st = await getNotifState(role);
          const m = findNotif(st.items, "PR_SUBMITTED", pr.id);
          if (!m || m.readAt) {
            fail("A", "GET /api/notifications", 200, m ?? null, `${role} không có PR_SUBMITTED CHƯA ĐỌC cho ${pr.code ?? pr.id}.`);
          } else {
            logInfo(`${role} nhận PR_SUBMITTED chưa đọc (category=${m.category})`);
            if (m.category !== "action") {
              fail("A", "category", 200, m, `PR_SUBMITTED tới ${role} phải category="action" (Cần bạn duyệt), thực tế="${m.category}".`);
            }
          }
        }
        for (const role of ["operator", "qc"]) {
          if (!has(role)) continue;
          const st = await getNotifState(role);
          const m = findNotif(st.items, "PR_SUBMITTED", pr.id);
          if (m) {
            fail("A", "GET /api/notifications", 200, m, `${role} KHÔNG liên quan nhưng lại nhận PR_SUBMITTED của ${pr.code ?? pr.id} — rò rỉ thông báo.`);
          } else {
            logInfo(`${role} đúng là KHÔNG nhận PR_SUBMITTED (không liên quan)`);
          }
        }

        // A.3 — Kho duyệt bước 2 → PR_SUBMITTED cũ của warehouse/admin phải
        // tự chuyển ĐÃ ĐỌC (RESOLVES_STALE), PR_DEPT_APPROVED mới xuất hiện.
        console.log(c("\n--- A.3: dept-approve → PR_SUBMITTED cũ tự đánh dấu đã đọc ---", "bold"));
        const deptRes = await call("warehouse", "POST", `/api/purchase-requests/${pr.id}/dept-approve`, {
          body: { note: `${TAG} kho duyệt` },
        });
        if (deptRes.status !== 200) {
          fail("A", "dept-approve", deptRes.status, deptRes.body, "warehouse không duyệt được bước 2.");
        } else {
          await sleep(800);
          for (const role of ["warehouse", "admin"]) {
            const st = await getNotifState(role);
            const old = findNotif(st.items, "PR_SUBMITTED", pr.id);
            if (!old || !old.readAt) {
              fail("A", "GET /api/notifications", 200, old ?? null,
                `${role}: PR_SUBMITTED của ${pr.code ?? pr.id} PHẢI tự chuyển đã đọc sau khi dept-approve (RESOLVES_STALE) — vẫn đang chưa đọc → hộp thư dồn.`);
            } else {
              logInfo(`${role}: PR_SUBMITTED cũ đã tự đánh dấu đã đọc (readAt=${old.readAt})`);
            }
          }
          for (const role of ["admin", "purchaser"]) {
            const st = await getNotifState(role);
            const m = findNotif(st.items, "PR_DEPT_APPROVED", pr.id);
            if (!m || m.readAt) {
              fail("A", "GET /api/notifications", 200, m ?? null, `${role} không có PR_DEPT_APPROVED chưa đọc.`);
            } else {
              logInfo(`${role} nhận PR_DEPT_APPROVED chưa đọc`);
            }
          }
          step("A.3 dept-approve", true, "PR_SUBMITTED cũ tự đọc + PR_DEPT_APPROVED mới đúng người");

          // A.4 — Duyệt cuối → PR_DEPT_APPROVED cũ tự đọc, PR_APPROVED mới tới
          // purchaser + planner (creator) + accountant (nếu có).
          // Dùng admin (không phải purchaser) để duyệt cuối — nếu dùng chính
          // purchaser thì actor bị loại khỏi target role("purchaser") của
          // chính họ (đúng thiết kế "không tự báo hành động của mình"), sẽ
          // khiến assert "purchaser nhận PR_APPROVED" sai một cách giả tạo.
          console.log(c("\n--- A.4: director-approve → PR_DEPT_APPROVED cũ tự đánh dấu đã đọc ---", "bold"));
          const dirRes = await call("admin", "POST", `/api/purchase-requests/${pr.id}/director-approve`, {
            body: { note: `${TAG} duyệt cuối` },
          });
          if (dirRes.status !== 200) {
            fail("A", "director-approve", dirRes.status, dirRes.body, "purchaser không duyệt cuối được.");
          } else {
            await sleep(800);
            for (const role of ["admin", "purchaser"]) {
              const st = await getNotifState(role);
              const old = findNotif(st.items, "PR_DEPT_APPROVED", pr.id);
              if (!old || !old.readAt) {
                fail("A", "GET /api/notifications", 200, old ?? null,
                  `${role}: PR_DEPT_APPROVED của ${pr.code ?? pr.id} phải tự đọc sau director-approve.`);
              } else {
                logInfo(`${role}: PR_DEPT_APPROVED cũ đã tự đọc`);
              }
            }
            const purchaserSt = await getNotifState("purchaser");
            const approvedForPurchaser = findNotif(purchaserSt.items, "PR_APPROVED", pr.id);
            if (!approvedForPurchaser || approvedForPurchaser.readAt) {
              fail("A", "GET /api/notifications", 200, approvedForPurchaser ?? null, "purchaser không có PR_APPROVED chưa đọc (cần tạo PO).");
            } else {
              logInfo("purchaser nhận PR_APPROVED chưa đọc (cần tạo PO)");
            }
            if (has("accountant")) {
              const accSt = await getNotifState("accountant");
              const accM = findNotif(accSt.items, "PR_APPROVED", pr.id);
              if (!accM) {
                warn("A", "GET /api/notifications", "accountant không nhận PR_APPROVED — kiểm tra role accountant có active + đúng seed không (không phải lỗi chặn tiến độ).");
              } else {
                logInfo("accountant nhận PR_APPROVED (tải PDF/Excel)");
              }
            }
            step("A.4 director-approve", true, "PR_DEPT_APPROVED cũ tự đọc + PR_APPROVED mới đúng người");
          }
        }
      }
    }
  }

  // ===================================================================
  // NHÓM B — WO: yêu cầu SX mới → operator, người ngoài không nhận
  // ===================================================================
  console.log(c("\n=== NHÓM B: WO — yêu cầu SX mới đúng người ===", "bold"));
  const groupBReady = has("planner") && has("operator") && has("admin");
  if (!groupBReady) {
    warn("B", "GROUP-B", "Thiếu role planner/operator/admin — SKIP Nhóm B.");
  } else {
    const skuSuffix = Date.now().toString().slice(-8);
    const itemRes = await call("admin", "POST", "/api/items", {
      body: { sku: `E2ENM-${skuSuffix}`, name: `${TAG} sản phẩm test`, itemType: "FG", uom: "PCS" },
    });
    const newItem = itemRes.body?.data;
    if (itemRes.status !== 201 || !newItem?.id) {
      fail("B", "POST /api/items", itemRes.status, itemRes.body, "admin không tạo được item FG cho WO test.");
      step("B.1 tạo item", false, `HTTP ${itemRes.status}`);
    } else {
      createdIds.itemIds.push(newItem.id);
      step("B.1 tạo item", true, `Tạo item ${newItem.sku}`);

      const woRes = await call("planner", "POST", "/api/work-orders/lsx", {
        body: { productItemId: newItem.id, plannedQty: 1, notes: `${TAG} WO test` },
      });
      const wo = woRes.body?.data;
      if (woRes.status !== 201 || !wo?.id) {
        fail("B", "POST /api/work-orders/lsx", woRes.status, woRes.body, "planner không tạo được WO (lsx).");
        step("B.2 tạo WO", false, `HTTP ${woRes.status}`);
      } else {
        createdIds.woIds.push(wo.id);
        step("B.2 tạo WO", true, `Tạo ${wo.woNo ?? wo.id} (status=${wo.status})`);
        await sleep(800);

        const opSt = await getNotifState("operator");
        const opM = findNotif(opSt.items, "WO_REQUEST_SUBMITTED", wo.id);
        if (!opM || opM.readAt) {
          fail("B", "GET /api/notifications", 200, opM ?? null, "operator không có WO_REQUEST_SUBMITTED chưa đọc.");
        } else {
          logInfo(`operator nhận WO_REQUEST_SUBMITTED (category=${opM.category})`);
        }
        for (const role of ["warehouse", "qc"]) {
          if (!has(role)) continue;
          const st = await getNotifState(role);
          const m = findNotif(st.items, "WO_REQUEST_SUBMITTED", wo.id);
          if (m) {
            fail("B", "GET /api/notifications", 200, m, `${role} KHÔNG liên quan nhưng nhận WO_REQUEST_SUBMITTED — rò rỉ.`);
          } else {
            logInfo(`${role} đúng là KHÔNG nhận WO_REQUEST_SUBMITTED`);
          }
        }

        const approveRes = await call("operator", "POST", `/api/work-orders/${wo.id}/approve`, { body: {} });
        if (approveRes.status !== 200) {
          fail("B", "approve WO", approveRes.status, approveRes.body, "operator không duyệt được WO.");
        } else {
          await sleep(800);
          const plSt = await getNotifState("planner");
          const plM = findNotif(plSt.items, "WO_APPROVED", wo.id);
          if (!plM || plM.readAt) {
            fail("B", "GET /api/notifications", 200, plM ?? null, "planner (người lập) không có WO_APPROVED chưa đọc.");
          } else {
            logInfo("planner nhận WO_APPROVED chưa đọc");
          }
          const opStOld = await getNotifState("operator");
          const opOld = findNotif(opStOld.items, "WO_REQUEST_SUBMITTED", wo.id);
          if (!opOld || !opOld.readAt) {
            fail("B", "GET /api/notifications", 200, opOld ?? null, "operator: WO_REQUEST_SUBMITTED phải tự đọc sau khi chính operator đã duyệt.");
          } else {
            logInfo("operator: WO_REQUEST_SUBMITTED cũ đã tự đọc sau khi duyệt");
          }
          step("B.3 duyệt WO", true, "WO_APPROVED đúng người lập + WO_REQUEST_SUBMITTED cũ tự đọc");
        }
      }
    }
  }

  // ===================================================================
  // NHÓM C — Dashboard "Cần xử lý" PHẢI khớp nhóm "Cần bạn duyệt" (P0)
  // ===================================================================
  console.log(c("\n=== NHÓM C: Dashboard action-items khớp bell (P0) ===", "bold"));
  for (const role of ["admin", "purchaser", "warehouse"]) {
    if (!has(role)) continue;
    const notif = await getNotifState(role);
    const actionCount = notif.items.filter((n) => n.category === "action" && !n.readAt).length;
    const dash = await call(role, "GET", "/api/dashboard/action-items?fresh=1");
    if (!dash.ok) {
      fail("C", "GET /api/dashboard/action-items", dash.status, dash.body, `${role} không tải được dashboard action-items.`);
      continue;
    }
    const dashTotal =
      (dash.body?.prDraft?.count ?? 0) + (dash.body?.poOverdue?.count ?? 0) + (dash.body?.woOverdue?.count ?? 0);
    // Lưu ý: notif.items giới hạn limit=100 — nếu người có > 100 thông báo,
    // actionCount (đếm trên trang 1) có thể < thực tế trong khi dashTotal
    // (đếm DB đầy đủ) chính xác hơn → chỉ fail khi dashTotal < actionCount
    // (dashboard đếm THIẾU so với 1 trang chuông chắc chắn đã thấy).
    if (dashTotal < actionCount) {
      fail("C", "dashboard vs bell", 200, { dashTotal, actionCount, role },
        `${role}: Dashboard "Cần xử lý" (${dashTotal}) ÍT HƠN số "Cần bạn duyệt" chuông đang thấy (${actionCount}) — vẫn còn đếm thiếu.`);
    } else {
      logInfo(`${role}: dashboard total=${dashTotal} ≥ bell action (trang 1)=${actionCount} — OK`);
    }
    step(`C.${role}`, dashTotal >= actionCount, `dashboard=${dashTotal} · bell(action, trang 1)=${actionCount}`);
  }

  // ===================================================================
  // NHÓM D — API Web Push (hợp đồng, không cần trình duyệt thật)
  // ===================================================================
  console.log(c("\n=== NHÓM D: API Web Push ===", "bold"));
  if (has("admin")) {
    const keyRes = await call("admin", "GET", "/api/push/public-key");
    if (!keyRes.ok) {
      fail("D", "GET /api/push/public-key", keyRes.status, keyRes.body, "Không lấy được public key.");
    } else {
      logInfo(`configured=${keyRes.body?.data?.configured}`);
      const fakeEndpoint = `https://example-push.test/ep/${TS}-${Math.random().toString(36).slice(2, 8)}`;
      const subRes = await call("admin", "POST", "/api/push/subscribe", {
        body: { endpoint: fakeEndpoint, keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) } },
      });
      if (subRes.status !== 200) {
        fail("D", "POST /api/push/subscribe", subRes.status, subRes.body, "Subscribe thất bại với payload hợp lệ.");
      } else {
        logInfo("subscribe OK");
        const unsubRes = await call("admin", "POST", "/api/push/unsubscribe", { body: { endpoint: fakeEndpoint } });
        if (unsubRes.status !== 200) {
          fail("D", "POST /api/push/unsubscribe", unsubRes.status, unsubRes.body, "Unsubscribe thất bại.");
        } else {
          logInfo("unsubscribe OK");
        }
      }
      step("D. Push API", subRes?.status === 200, "subscribe/unsubscribe hợp lệ");
    }
  } else {
    warn("D", "GROUP-D", "Thiếu role admin — SKIP Nhóm D.");
  }

  // ===================================================================
  // Tổng kết
  // ===================================================================
  console.log(c("\n\n=== TỔNG KẾT ===", "bold"));
  const fails = issues.filter((i) => i.kind === "FAIL");
  const warns = issues.filter((i) => i.kind === "WARN");
  console.log(`Steps: ${stepLog.length} · Fail: ${c(fails.length, fails.length ? "red" : "green")} · Warn: ${c(warns.length, "yellow")}`);
  for (const s of stepLog) {
    console.log(`  [${s.ok ? c("PASS", "green") : c("FAIL", "red")}] ${s.name} — ${s.summary}`);
  }
  if (fails.length > 0) {
    console.log(c("\n--- FAIL chi tiết ---", "red"));
    for (const f of fails) {
      console.log(c(`\n[${f.group}] ${f.endpoint} (status=${f.status})`, "red"));
      console.log(`  Hint: ${f.hint}`);
    }
  }
  if (warns.length > 0) {
    console.log(c("\n--- WARN chi tiết ---", "yellow"));
    for (const w of warns) console.log(c(`  [${w.group}] ${w.hint}`, "yellow"));
  }

  console.log(c("\n--- Dữ liệu tạo ra (KHÔNG tự xoá) ---", "cyan"));
  console.log("PR:", createdIds.prCodes.join(", ") || "(none)");
  console.log("Item:", createdIds.itemIds.join(", ") || "(none)");
  console.log("WO:", createdIds.woIds.join(", ") || "(none)");

  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c("\n[FATAL]", "red"), err);
  process.exit(1);
});
