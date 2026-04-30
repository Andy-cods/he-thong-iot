#!/usr/bin/env node
// =====================================================================
// E2E Cross-Role Flow Test — MES SongChau
// =====================================================================
// Mục đích: chạy 6 bước end-to-end qua 4 role (TK-A → TM-A → KHO-A →
// VH-A → KHO-A → VH-A) trên https://mes.songchau.vn để phát hiện tắc
// nghẽn (broken endpoints, missing notifications, RBAC bug).
//
// Chạy:
//   node tests/e2e/cross-role-flow.mjs
//   BASE=https://mes.songchau.vn node tests/e2e/cross-role-flow.mjs
//
// Constraints:
//   - KHÔNG dùng admin để bypass RBAC.
//   - Cookie jar riêng từng user (Map<role, cookieString>).
//   - Password thử Test123!, fallback ChangeMe!234.
// =====================================================================

const BASE = process.env.BASE || "https://mes.songchau.vn";
const PASSWORDS = ["Test@1234", "Test123!", "ChangeMe!234"];
const TAG = "[E2E-TEST]";
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// ----- helpers -----
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

const issues = [];   // {step, kind:"FAIL"|"WARN", endpoint, status, body, hint}
const stepLog = [];  // {step, name, ok, summary}
const userJars = new Map();  // username → cookie header string

function recordCookies(jar, setCookieHeaders) {
  if (!setCookieHeaders) return jar;
  const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  const map = new Map();
  // parse existing
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

async function call(role, method, path, { body, raw = false } = {}) {
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
  // capture set-cookie (Node fetch: getSetCookie)
  const setCookies = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : null;
  if (setCookies && setCookies.length) {
    userJars.set(role, recordCookies(jar, setCookies));
  }
  let parsed = null;
  const text = await res.text();
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, ok: res.ok, body: parsed, rawText: text };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function login(username) {
  // V2: chỉ thử 1 password để tránh rate limit (5/60s/IP).
  // Có RATE_LIMITED retry với delay = retryAfter+2s, max 1 retry.
  let lastErr = null;
  for (const password of PASSWORDS) {
    userJars.delete(username);
    let r = await call(username, "POST", "/api/auth/login", {
      body: { username, password },
    });
    if (r.status === 429) {
      const wait = (r.body?.error?.details?.retryAfter ?? 60) + 2;
      console.log(c(`  · rate-limited login ${username} → wait ${wait}s`, "yellow"));
      await sleep(wait * 1000);
      r = await call(username, "POST", "/api/auth/login", {
        body: { username, password },
      });
    }
    if (r.ok) return { ok: true, password };
    lastErr = r;
    // 401 → password sai, đừng thử password khác để tiết kiệm rate
    if (r.status === 401) {
      // thử password kế tiếp NẾU có
      continue;
    }
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

// snapshot
const created = {
  prId: null, prCode: null,
  poId: null, poCode: null,
  woId: null, woNo: null,
  isrId: null, isrNo: null,
};

// ----- main flow -----
async function main() {
  console.log(c(`\n=== E2E Cross-Role Flow Test ===`, "bold"));
  console.log(c(`Base: ${BASE}`, "cyan"));
  console.log(c(`Run tag: ${TAG} ${TS}`, "cyan"));

  // ---------- Pre: login all 4 roles ----------
  const roles = ["TK-A", "TM-A", "KHO-A", "VH-A"];
  const loginResults = {};
  for (let idx = 0; idx < roles.length; idx++) {
    const r = roles[idx];
    if (idx > 0) await sleep(500); // spread requests
    const lr = await login(r);
    loginResults[r] = lr;
    if (!lr.ok) {
      console.log(c(`  ! Login ${r} FAILED status=${lr.status}`, "red"));
      fail("PRE", "POST /api/auth/login", lr.status,
        lr.body, `Không login được ${r}. Cả 2 password đều fail. Kiểm tra account có tồn tại + active không.`);
    } else {
      logInfo(`login ${r} OK (password=${lr.password})`);
    }
  }
  if (Object.values(loginResults).some(r => !r.ok)) {
    console.log(c("\nMột số role không login được — abort các bước sau cần role đó.", "red"));
  }

  // verify /api/me cho từng role
  for (const r of roles) {
    if (!loginResults[r].ok) continue;
    const me = await call(r, "GET", "/api/me");
    if (me.ok) logInfo(`me ${r}: roles=${JSON.stringify(me.body?.roles ?? me.body?.data?.roles ?? "?")}`);
    else fail("PRE", "GET /api/me", me.status, me.body, `${r} không lấy được /api/me`);
  }

  // ===================================================================
  // Step 1 — TK-A: tạo PR 2 dòng
  // ===================================================================
  console.log(c("\n--- Step 1: TK-A tạo Purchase Request ---", "bold"));
  if (loginResults["TK-A"]?.ok) {
    // fetch items có tồn (filter type RAW để tránh dùng FG)
    const items = await call("TK-A", "GET", "/api/items?type=RAW&pageSize=20&isActive=true");
    if (!items.ok) {
      fail(1, "GET /api/items", items.status, items.body, "TK-A không list được items (RBAC?). Kiểm tra requireCan('read','item') cho role planner.");
      step("Step 1", false, "Không lấy được items, abort tạo PR");
    } else {
      const rows = items.body?.data ?? [];
      logInfo(`Items (RAW) found: ${rows.length}`);
      if (rows.length < 2) {
        // fallback: lấy bất kỳ
        const any = await call("TK-A", "GET", "/api/items?pageSize=10");
        const anyRows = any.body?.data ?? [];
        if (anyRows.length >= 2) {
          rows.push(...anyRows.slice(0, 2));
        }
      }
      if (rows.length < 2) {
        fail(1, "GET /api/items", items.status, items.body, "DB không đủ 2 item để tạo PR — seed thêm items hoặc check filter.");
        step("Step 1", false, "DB không đủ items");
      } else {
        const [i1, i2] = rows;
        logInfo(`Pick item1=${i1.sku} item2=${i2.sku}`);
        const prRes = await call("TK-A", "POST", "/api/purchase-requests", {
          body: {
            title: `${TAG} cross-role ${TS}`,
            source: "MANUAL",
            notes: "E2E test — auto-generated, có thể xoá",
            lines: [
              { itemId: i1.id, qty: 5, notes: "line 1" },
              { itemId: i2.id, qty: 3, notes: "line 2" },
            ],
          },
        });
        if (prRes.status === 201 || prRes.ok) {
          const pr = prRes.body?.data ?? prRes.body;
          created.prId = pr?.id;
          created.prCode = pr?.code;
          step("Step 1", true, `TK-A tạo PR ${pr?.code} (id=${pr?.id?.slice(0, 8)}…) status=${pr?.status}`);
        } else {
          fail(1, "POST /api/purchase-requests", prRes.status, prRes.body,
            `TK-A không tạo được PR. Kiểm tra prCreateSchema (title/source/lines) + RBAC create pr cho planner.`);
          step("Step 1", false, `Tạo PR fail HTTP ${prRes.status}`);
        }
      }
    }
  } else {
    step("Step 1", false, "TK-A không login được");
  }

  // ===================================================================
  // Step 2 — TM-A: notif + approve PR + create PO + send PO
  // ===================================================================
  console.log(c("\n--- Step 2: TM-A duyệt PR + tạo PO + gửi ---", "bold"));
  if (loginResults["TM-A"]?.ok) {
    // 2a notifications
    const notif = await call("TM-A", "GET", "/api/notifications?unread=1&limit=20");
    if (!notif.ok) {
      fail(2, "GET /api/notifications?unread=1", notif.status, notif.body, "TM-A không truy cập được notifications.");
    } else {
      const items = notif.body?.data ?? [];
      const prMatched = items.find(n =>
        n.entityType === "purchase_request" &&
        (n.entityCode === created.prCode || n.entityId === created.prId)
      );
      if (prMatched) {
        logInfo(`notif PR_SUBMITTED → recipient=${prMatched.recipientRole ?? prMatched.recipientUser?.slice(0,8)} title=${prMatched.title}`);
      } else if (items.length > 0) {
        warn(2, "GET /api/notifications", `TM-A có ${items.length} unread notif nhưng không có PR ${created.prCode}. notifyPRSubmitted có thể không gửi tới purchaser role hoặc PR status DRAFT (không SUBMITTED).`);
        logInfo(`unread=${items.length} nhưng KHÔNG khớp PR ${created.prCode}`);
      } else {
        warn(2, "GET /api/notifications", `TM-A 0 unread notif. notifyPRSubmitted không bắn cho PR DRAFT (PR mới tạo có thể là DRAFT chứ không SUBMITTED — xem prCreateSchema/createPR).`);
        logInfo("0 unread");
      }
    }

    // 2b list PR
    if (created.prId) {
      const prList = await call("TM-A", "GET", "/api/purchase-requests?status=SUBMITTED&pageSize=20");
      if (prList.ok) {
        const found = prList.body?.data?.find(p => p.id === created.prId);
        logInfo(`PR list SUBMITTED: ${prList.body?.data?.length ?? 0} rows. Match PR vừa tạo: ${found ? "YES" : "NO"}`);
        if (!found) {
          // có thể status DRAFT
          const draftList = await call("TM-A", "GET", "/api/purchase-requests?status=DRAFT&pageSize=20");
          const draft = draftList.body?.data?.find(p => p.id === created.prId);
          if (draft) {
            warn(2, "POST /api/purchase-requests", "PR mới tạo đang DRAFT (không SUBMITTED) → notifyPRSubmitted không bắn → TM-A không thấy notif. Cần auto-submit PR khi tạo manual hoặc thêm bước /submit.");
          }
        }
      } else {
        fail(2, "GET /api/purchase-requests?status=SUBMITTED", prList.status, prList.body, "TM-A không list được PR.");
      }

      // 2c approve PR
      const approve = await call("TM-A", "POST", `/api/purchase-requests/${created.prId}/approve`, {
        body: { notes: `${TAG} approved by TM-A` },
      });
      if (approve.ok) {
        logInfo(`PR approved → status=${approve.body?.data?.status}`);
      } else {
        fail(2, `POST /api/purchase-requests/${created.prId}/approve`, approve.status, approve.body,
          "TM-A không duyệt được PR. Có thể RBAC role purchaser thiếu 'approve'/'pr', hoặc PR đang state không hợp lệ (chỉ DRAFT/SUBMITTED → APPROVED).");
      }
    }

    // 2d create PO from PR (use from-pr endpoint — đúng pattern V3.4)
    if (created.prId && (await call("TM-A","GET",`/api/purchase-requests/${created.prId}`)).body?.data?.status === "APPROVED") {
      const fromPR = await call("TM-A", "POST", `/api/purchase-orders/from-pr/${created.prId}`, { body: {} });
      if (fromPR.ok) {
        const created_pos = fromPR.body?.data?.createdPOs ?? [];
        if (created_pos.length > 0) {
          created.poId = created_pos[0].id;
          created.poCode = created_pos[0].poNo;
          logInfo(`Created ${created_pos.length} PO from PR. First: ${created.poCode}`);
        } else {
          warn(2, "POST /api/purchase-orders/from-pr/[prId]", "Convert thành công nhưng 0 PO trả về.");
        }
      } else if (fromPR.status === 422 && (fromPR.body?.error === "MISSING_SUPPLIER" || fromPR.body?.code === "MISSING_SUPPLIER")) {
        warn(2, "POST /api/purchase-orders/from-pr", "PR thiếu preferred_supplier_id trên line → MISSING_SUPPLIER. Test data items chưa link supplier preferred. Sẽ thử fallback POST /api/purchase-orders manual nếu có supplier.");
        // fallback: tạo PO manual (cần pick 1 supplier)
        const sup = await call("TM-A", "GET", "/api/suppliers?pageSize=5");
        const supplierId = sup.body?.data?.[0]?.id;
        if (supplierId && created.prId) {
          const prDetail = await call("TM-A", "GET", `/api/purchase-requests/${created.prId}`);
          const prLines = prDetail.body?.data?.lines ?? [];
          if (prLines.length > 0) {
            const poManual = await call("TM-A", "POST", "/api/purchase-orders", {
              body: {
                supplierId,
                prId: created.prId,
                currency: "VND",
                notes: `${TAG} fallback manual PO`,
                lines: prLines.map(l => ({
                  itemId: l.itemId,
                  orderedQty: Number(l.qty),
                  unitPrice: 1000,
                  taxRate: 8,
                })),
              },
            });
            if (poManual.ok || poManual.status === 201) {
              const po = poManual.body?.data ?? poManual.body;
              created.poId = po?.id;
              created.poCode = po?.poNo;
              logInfo(`Fallback manual PO created: ${created.poCode}`);
            } else {
              fail(2, "POST /api/purchase-orders (fallback)", poManual.status, poManual.body, "Fallback manual PO cũng fail.");
            }
          }
        }
      } else {
        fail(2, `POST /api/purchase-orders/from-pr/${created.prId}`, fromPR.status, fromPR.body,
          "TM-A không convert được PR→PO. Kiểm tra createPOFromPR + RBAC create po cho purchaser.");
      }
    }

    // 2e send PO (DRAFT → SENT)
    if (created.poId) {
      const sent = await call("TM-A", "POST", `/api/purchase-orders/${created.poId}/send`, { body: {} });
      if (sent.ok) {
        logInfo(`PO sent → ${sent.body?.data?.status}`);
        step("Step 2", true, `Approve PR + tạo PO ${created.poCode} + send SENT`);
      } else if (sent.status === 403) {
        fail(2, `POST /api/purchase-orders/${created.poId}/send`, sent.status, sent.body,
          "TM-A bị RBAC chặn /send (route yêu cầu 'approve','po' = admin only). Nếu purchaser cần send → mở RBAC hoặc đổi sang 'transition','po' + role purchaser.");
        step("Step 2", false, "TM-A không send được PO (RBAC admin only)");
      } else {
        fail(2, `POST /api/purchase-orders/${created.poId}/send`, sent.status, sent.body,
          "TM-A send PO fail.");
        step("Step 2", false, `Send PO fail HTTP ${sent.status}`);
      }
    } else {
      step("Step 2", false, "Không có PO để send");
    }
  } else {
    step("Step 2", false, "TM-A không login được");
  }

  // ===================================================================
  // Step 3 — KHO-A: receive + approve + check layout
  // ===================================================================
  console.log(c("\n--- Step 3: KHO-A nhận hàng + duyệt RECEIVED ---", "bold"));
  if (loginResults["KHO-A"]?.ok) {
    // 3a notif
    const notif = await call("KHO-A", "GET", "/api/notifications?unread=1&limit=20");
    if (notif.ok) {
      const items = notif.body?.data ?? [];
      const matched = items.find(n =>
        n.entityType === "purchase_order" &&
        (n.entityCode === created.poCode || n.entityId === created.poId)
      );
      if (matched) logInfo(`notif PO_SENT received → ${matched.title}`);
      else if (items.length > 0) {
        warn(3, "GET /api/notifications", `KHO-A có ${items.length} unread nhưng không có PO ${created.poCode}. notifyPOSent có thể không broadcast tới warehouse role.`);
      } else {
        warn(3, "GET /api/notifications", `KHO-A 0 unread. notifyPOSent có thể không bắn cho warehouse khi PO SENT.`);
      }
    } else {
      fail(3, "GET /api/notifications", notif.status, notif.body, "KHO-A không truy cập notifications.");
    }

    // 3b list PO SENT
    const poList = await call("KHO-A", "GET", "/api/purchase-orders?status=SENT&status=PARTIAL&pageSize=20");
    if (poList.ok) {
      const found = poList.body?.data?.find(p => p.id === created.poId);
      logInfo(`PO list SENT/PARTIAL: ${poList.body?.data?.length ?? 0}. Match PO vừa send: ${found ? "YES" : "NO"}`);
      if (!found && created.poId) warn(3, "GET /api/purchase-orders?status=SENT", "KHO-A list nhưng không thấy PO vừa SENT — index/filter sai?");
    } else {
      fail(3, "GET /api/purchase-orders?status=SENT", poList.status, poList.body, "KHO-A không list được PO.");
    }

    // 3c bin layout (before)
    const layout1 = await call("KHO-A", "GET", "/api/warehouse/layout");
    if (!layout1.ok) {
      fail(3, "GET /api/warehouse/layout", layout1.status, layout1.body, "KHO-A không lấy được warehouse layout.");
    }

    // 3d receiving events
    if (created.poId && created.poCode) {
      // fetch PO detail to get lines
      const poDetail = await call("KHO-A", "GET", `/api/purchase-orders/${created.poId}`);
      const lines = poDetail.body?.data?.lines ?? [];
      logInfo(`PO ${created.poCode} có ${lines.length} line`);
      if (lines.length === 0) {
        warn(3, "GET /api/purchase-orders/[id]", "PO detail không có lines — có thể schema khác.");
      } else {
        const events = lines.map((l, idx) => ({
          id: `e2e-${TS}-${idx}-${Math.random().toString(36).slice(2,8)}`,
          scanId: `e2e-scan-${TS}-${idx}-${Math.random().toString(36).slice(2,8)}`,
          poCode: created.poCode,
          sku: l.sku ?? l.itemSku ?? l.item?.sku,
          qty: Number(l.orderedQty ?? l.qty),
          qcStatus: "PASS",
          scannedAt: new Date().toISOString(),
        }));
        if (events.some(e => !e.sku)) {
          warn(3, "POST /api/receiving/events", `PO line response thiếu sku — phải GET item riêng.`);
          // attempt to fill sku
          for (let i = 0; i < events.length; i++) {
            if (!events[i].sku && lines[i].itemId) {
              const it = await call("KHO-A", "GET", `/api/items/${lines[i].itemId}`);
              events[i].sku = it.body?.data?.sku;
            }
          }
        }
        const recv = await call("KHO-A", "POST", "/api/receiving/events", { body: { events } });
        if (recv.ok) {
          const acked = recv.body?.data?.acked?.length ?? 0;
          const rejected = recv.body?.data?.rejected ?? [];
          logInfo(`receiving acked=${acked} rejected=${rejected.length}`);
          if (rejected.length > 0) {
            warn(3, "POST /api/receiving/events",
              `Một số scan rejected: ${JSON.stringify(rejected).slice(0, 200)}`);
          }
        } else {
          fail(3, "POST /api/receiving/events", recv.status, recv.body,
            "KHO-A POST events fail. Kiểm tra receivingEventsBatchSchema (id/scanId/poCode/sku/qty/qcStatus/scannedAt).");
        }
      }
    }

    // 3e approve receiving
    if (created.poId) {
      const approve = await call("KHO-A", "POST", `/api/receiving/${created.poId}/approve`, { body: {} });
      if (approve.ok) {
        logInfo(`PO RECEIVED ratio=${(approve.body?.totals?.ratio * 100).toFixed(1)}%`);
        step("Step 3", true, `KHO-A nhận + RECEIVED ${created.poCode}`);
      } else {
        fail(3, `POST /api/receiving/${created.poId}/approve`, approve.status, approve.body,
          "KHO-A không duyệt RECEIVED. Có thể chưa nhận đủ 95% hoặc PO state sai.");
        step("Step 3", false, `Approve receiving fail HTTP ${approve.status}`);
      }
    } else {
      step("Step 3", false, "Không có PO để receive");
    }

    // 3f layout (after)
    const layout2 = await call("KHO-A", "GET", "/api/warehouse/layout");
    if (layout1.ok && layout2.ok) {
      const sumQty = (l) => {
        const bins = l.body?.data?.bins ?? l.body?.bins ?? [];
        return bins.reduce((s, b) => s + Number(b.totalQty ?? b.qtyOnHand ?? 0), 0);
      };
      const before = sumQty(layout1);
      const after = sumQty(layout2);
      logInfo(`Layout total qty: before=${before} after=${after} delta=${after - before}`);
      if (after <= before) {
        warn(3, "GET /api/warehouse/layout", `Layout total không tăng sau RECEIVED — có thể bin assignment chưa chạy hoặc layout endpoint cache.`);
      }
    }
  } else {
    step("Step 3", false, "KHO-A không login được");
  }

  // ===================================================================
  // Step 4 — VH-A: tạo WO quick
  // ===================================================================
  console.log(c("\n--- Step 4: VH-A tạo Work Order quick ---", "bold"));
  if (loginResults["VH-A"]?.ok) {
    const notif = await call("VH-A", "GET", "/api/notifications?unread=1&limit=20");
    if (notif.ok) logInfo(`VH-A unread=${notif.body?.data?.length ?? 0}`);

    // tìm 1 product (FG) + 1 raw có tồn
    const fg = await call("VH-A", "GET", "/api/items?type=FG&pageSize=10");
    const raw = await call("VH-A", "GET", "/api/items?type=RAW&pageSize=10");
    const product = fg.body?.data?.[0];
    const material = raw.body?.data?.[0];
    if (!product || !material) {
      fail(4, "GET /api/items", null, null, `VH-A không tìm đủ FG/RAW: fg=${fg.body?.data?.length ?? 0} raw=${raw.body?.data?.length ?? 0}.`);
      step("Step 4", false, "Không đủ items để tạo WO");
    } else {
      const wo = await call("VH-A", "POST", "/api/work-orders/quick", {
        body: {
          productItemId: product.id,
          plannedQty: 1,
          priority: "NORMAL",
          notes: `${TAG} cross-role WO`,
          materials: [{ itemId: material.id, qty: 1 }],
        },
      });
      if (wo.ok) {
        const d = wo.body?.data ?? wo.body;
        created.woId = d?.woId;
        created.woNo = d?.woNo;
        created.isrId = d?.requestId;
        created.isrNo = d?.requestNo;
        logInfo(`WO=${created.woNo} ISR=${created.isrNo} totalShortage=${d?.totalShortage}`);
        step("Step 4", true, `WO ${created.woNo} + ISR ${created.isrNo} (shortage=${d?.totalShortage ?? 0})`);
      } else {
        fail(4, "POST /api/work-orders/quick", wo.status, wo.body,
          "VH-A không tạo được WO quick. Kiểm tra schema (productItemId/plannedQty/materials), suggestFifoPicks (cần inventory để FIFO), RBAC requireSession.");
        step("Step 4", false, `WO quick fail HTTP ${wo.status}`);
      }
    }
  } else {
    step("Step 4", false, "VH-A không login được");
  }

  // ===================================================================
  // Step 5 — KHO-A: duyệt ISR PENDING
  // ===================================================================
  console.log(c("\n--- Step 5: KHO-A duyệt Issue Request ---", "bold"));
  if (loginResults["KHO-A"]?.ok) {
    const notif = await call("KHO-A", "GET", "/api/notifications?unread=1&limit=20");
    if (notif.ok) {
      const items = notif.body?.data ?? [];
      const matched = items.find(n =>
        n.entityType === "warehouse_issue_request" ||
        (n.entityCode && created.isrNo && n.entityCode === created.isrNo)
      );
      if (matched) logInfo(`notif ISR_PENDING → ${matched.title}`);
      else warn(5, "GET /api/notifications", `KHO-A không có notif về ISR ${created.isrNo}. work-orders/quick không emit notification cho warehouse khi tạo ISR PENDING — cần thêm notifyISRSubmitted.`);
    }

    const isrList = await call("KHO-A", "GET", "/api/warehouse/issue-request?status=PENDING&pageSize=20");
    if (isrList.ok) {
      const isrFound = isrList.body?.data?.find(r => r.id === created.isrId);
      logInfo(`ISR PENDING list: ${isrList.body?.data?.length ?? 0}. Match: ${isrFound ? "YES" : "NO"}`);
    }

    const layoutBefore = await call("KHO-A", "GET", "/api/warehouse/layout");

    if (created.isrId) {
      const approve = await call("KHO-A", "POST", `/api/warehouse/issue-request/${created.isrId}/approve`, { body: {} });
      if (approve.ok) {
        const r = approve.body?.data ?? approve.body;
        logInfo(`ISR approved txnIds=${r?.txnIds?.length ?? 0} totalQty=${r?.totalQty}`);
        step("Step 5", true, `KHO-A duyệt ISR ${created.isrNo} → COMPLETED`);
      } else if (approve.status === 409 && /INSUFFICIENT/.test(JSON.stringify(approve.body))) {
        fail(5, `POST /api/warehouse/issue-request/${created.isrId}/approve`, approve.status, approve.body,
          "ISR pick reference inventory không đủ — vì WO quick suggestFifoPicks lúc tạo, có thể bin/lot không matching (item nhận hàng KHO-A vừa receive chưa được put-away đúng bin có inventory). Cần rà put-away atomic.");
        step("Step 5", false, "ISR insufficient inventory");
      } else {
        fail(5, `POST /api/warehouse/issue-request/${created.isrId}/approve`, approve.status, approve.body,
          "KHO-A duyệt ISR fail.");
        step("Step 5", false, `Approve ISR fail HTTP ${approve.status}`);
      }
    } else {
      step("Step 5", false, "Không có ISR để duyệt");
    }

    const layoutAfter = await call("KHO-A", "GET", "/api/warehouse/layout");
    if (layoutBefore.ok && layoutAfter.ok) {
      const sum = l => {
        const bins = l.body?.data?.bins ?? l.body?.bins ?? [];
        return bins.reduce((s, b) => s + Number(b.totalQty ?? b.qtyOnHand ?? 0), 0);
      };
      logInfo(`Layout total qty: before=${sum(layoutBefore)} after=${sum(layoutAfter)} delta=${sum(layoutAfter) - sum(layoutBefore)}`);
    }
  } else {
    step("Step 5", false, "KHO-A không login được");
  }

  // ===================================================================
  // Step 6 — VH-A: check completion notification
  // ===================================================================
  console.log(c("\n--- Step 6: VH-A check COMPLETED notif ---", "bold"));
  if (loginResults["VH-A"]?.ok) {
    const notif = await call("VH-A", "GET", "/api/notifications?limit=30");
    if (notif.ok) {
      const items = notif.body?.data ?? [];
      const matched = items.find(n =>
        (n.entityType === "warehouse_issue_request" && (n.entityCode === created.isrNo || n.entityId === created.isrId)) ||
        (n.entityType === "work_order" && (n.entityCode === created.woNo || n.entityId === created.woId)) ||
        /COMPLET|APPROVED|XUẤT|EXECUTE/i.test(`${n.eventType ?? ""} ${n.title ?? ""}`)
      );
      if (matched) {
        logInfo(`notif → ${matched.eventType} · ${matched.title}`);
        step("Step 6", true, `VH-A nhận notif (${matched.eventType})`);
      } else {
        warn(6, "GET /api/notifications", `VH-A không nhận notif khi ISR/WO COMPLETED. Cần thêm notifyISRApproved gửi tới requestedBy của ISR.`);
        step("Step 6", false, "VH-A không nhận notif COMPLETED — luồng feedback thiếu");
      }
    } else {
      fail(6, "GET /api/notifications", notif.status, notif.body, "VH-A list notif fail.");
      step("Step 6", false, "Không lấy được notifications");
    }
  } else {
    step("Step 6", false, "VH-A không login được");
  }

  // ===================================================================
  // Summary table
  // ===================================================================
  console.log(c("\n\n=== TỔNG KẾT ===", "bold"));
  console.log(c("Step pass/fail:", "bold"));
  for (const s of stepLog) {
    const tag = s.ok ? c("✅ PASS", "green") : c("❌ FAIL", "red");
    console.log(`  ${tag}  ${s.name.padEnd(8)}  ${s.summary}`);
  }

  const fails = issues.filter(i => i.kind === "FAIL");
  const warns = issues.filter(i => i.kind === "WARN");
  console.log(c(`\nIssues: ${fails.length} FAIL · ${warns.length} WARN`, "bold"));

  if (fails.length) {
    console.log(c("\n❌ FAILURES:", "red"));
    for (const i of fails) {
      console.log(c(`\n  Step ${i.step} · ${i.endpoint}`, "red"));
      console.log(`    HTTP: ${i.status}`);
      console.log(`    Body: ${typeof i.body === "string" ? i.body.slice(0, 200) : JSON.stringify(i.body).slice(0, 300)}`);
      console.log(c(`    Hint: ${i.hint}`, "yellow"));
    }
  }
  if (warns.length) {
    console.log(c("\n⚠ WARNINGS (UX/notification gaps):", "yellow"));
    for (const i of warns) {
      console.log(c(`  Step ${i.step} · ${i.endpoint}`, "yellow"));
      console.log(`    ${i.hint}`);
    }
  }

  // Top 3 issues priority
  console.log(c("\n=== TOP 3 ISSUES (priority) ===", "bold"));
  const top = [...fails, ...warns].slice(0, 3);
  if (top.length === 0) console.log(c("  (no issues)", "green"));
  for (let i = 0; i < top.length; i++) {
    const it = top[i];
    console.log(`  ${i + 1}. [${it.kind}] Step ${it.step} ${it.endpoint}`);
    console.log(`     Fix: ${it.hint}`);
  }

  // Cleanup hint
  console.log(c("\n=== CLEANUP ===", "bold"));
  console.log(`  Test data tag: ${TAG} ${TS}`);
  if (created.prCode) console.log(`  PR: ${created.prCode}`);
  if (created.poCode) console.log(`  PO: ${created.poCode}`);
  if (created.woNo)   console.log(`  WO: ${created.woNo}`);
  if (created.isrNo)  console.log(`  ISR: ${created.isrNo}`);
  console.log(c("  → grep title/notes có chuỗi [E2E-TEST] để xoá tay nếu cần.", "gray"));

  // exit code
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(c(`\nUNCAUGHT: ${err?.stack || err}`, "red"));
  process.exit(2);
});
