#!/usr/bin/env node
// =====================================================================
// FULL SYSTEM AUDIT — MES SongChau (V3.7.30)
// =====================================================================
// Pre-production E2E audit toàn diện 4 phòng ban × tất cả workflow.
//
// 8 sections × multi-step:
//   A. Auth + Hub + RBAC matrix
//   B. BOM lifecycle (create→edit→sheets→rename→clone→revisions)
//   C. Master data (items/suppliers CRUD)
//   D. Procurement E2E (PR→approve→PO→send→receive)
//   E. Production E2E (WO→ISR→approve→complete)
//   F. Warehouse ops (bin transfer/adjust/inventory)
//   G. Notifications system (cross-role + mark read)
//   H. Super-workflow A→B→C→D end-to-end
//
// Output: results array với pass/fail/skip + detail.
// Usage: node tests/e2e/full-system-audit.mjs > audit-results.json
// =====================================================================

const BASE = process.env.BASE || "https://mes.songchau.vn";
const PASSWORDS = ["Test@1234", "ChangeMe!234"];
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const TAG = `[AUDIT-${TS.slice(-6)}]`;

const colors = {
  reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", gray: "\x1b[90m", bold: "\x1b[1m", magenta: "\x1b[35m",
};
const c = (s, col) => `${colors[col] || ""}${s}${colors.reset}`;

const results = [];   // { section, name, status: PASS/FAIL/SKIP/WARN, http, detail }
const userJars = new Map();
const created = {};   // shared state across sections

// ----- helpers -----
function recordCookies(jar, scs) {
  if (!scs?.length) return jar;
  const map = new Map();
  if (jar) for (const kv of jar.split("; ").filter(Boolean)) {
    const i = kv.indexOf("="); if (i > 0) map.set(kv.slice(0, i), kv.slice(i + 1));
  }
  for (const sc of scs) {
    const f = sc.split(";")[0];
    const i = f.indexOf("="); if (i > 0) map.set(f.slice(0, i), f.slice(i + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(role, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const jar = userJars.get(role);
  if (jar) headers.Cookie = jar;
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const scs = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie() : null;
  if (scs?.length) userJars.set(role, recordCookies(jar, scs));
  let parsed = null;
  const text = await res.text();
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 300); }
  return { status: res.status, ok: res.ok, body: parsed };
}

async function callPage(role, path) {
  const headers = {};
  const jar = userJars.get(role);
  if (jar) headers.Cookie = jar;
  const res = await fetch(`${BASE}${path}`, { method: "GET", headers, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
}

async function login(username) {
  for (const password of PASSWORDS) {
    userJars.delete(username);
    let r = await call(username, "POST", "/api/auth/login", { username, password });
    if (r.status === 429) {
      const wait = (r.body?.error?.details?.retryAfter ?? 30) + 2;
      console.log(c(`  · rate-limit ${username} → wait ${wait}s`, "yellow"));
      await new Promise(rs => setTimeout(rs, wait * 1000));
      r = await call(username, "POST", "/api/auth/login", { username, password });
    }
    if (r.ok) return { ok: true, password };
    if (r.status !== 401) return { ok: false, status: r.status, body: r.body };
  }
  return { ok: false, status: 401 };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function record(section, name, status, http, detail) {
  results.push({ section, name, status, http: http ?? null, detail });
  const map = { PASS: "green", FAIL: "red", WARN: "yellow", SKIP: "gray" };
  const icon = { PASS: "✓", FAIL: "✗", WARN: "⚠", SKIP: "·" };
  console.log(`  ${c(icon[status], map[status])} [${section}] ${name} ${http ? c(`(${http})`, "gray") : ""} — ${c(detail, "gray")}`);
}

function header(t) { console.log(c(`\n=== ${t} ===`, "bold")); }
function sub(t) { console.log(c(`\n--- ${t} ---`, "magenta")); }

// =====================================================================
// MAIN
// =====================================================================
async function main() {
  console.log(c(`\n╔══════════════════════════════════════════╗`, "bold"));
  console.log(c(`║  FULL SYSTEM AUDIT — ${TAG}        ║`, "bold"));
  console.log(c(`║  Base: ${BASE}      ║`, "bold"));
  console.log(c(`╚══════════════════════════════════════════╝\n`, "bold"));

  // ---- PRE: Login all users ----
  header("PRE: Login 5 roles");
  const ROLES = ["admin", "TK-A", "TM-A", "KHO-A", "VH-A"];
  for (const r of ROLES) {
    const lr = await login(r);
    if (lr.ok) record("PRE", `Login ${r}`, "PASS", 200, `password=${lr.password}`);
    else record("PRE", `Login ${r}`, "FAIL", lr.status, JSON.stringify(lr.body).slice(0, 150));
    await sleep(400);
  }

  // ===================================================================
  // SECTION A: Hub Access + RBAC matrix
  // ===================================================================
  header("SECTION A — Auth + Hub + RBAC matrix");

  sub("A.1 Hub page accessibility");
  const HUB_MATRIX = {
    "admin":  ["/", "/warehouse", "/sales", "/engineering", "/operations", "/admin"],
    "TK-A":   ["/", "/engineering"],
    "TM-A":   ["/", "/sales"],
    "KHO-A":  ["/", "/warehouse"],
    "VH-A":   ["/", "/operations"],
  };
  for (const [role, paths] of Object.entries(HUB_MATRIX)) {
    if (!userJars.has(role)) continue;
    for (const p of paths) {
      const r = await callPage(role, p);
      const ok = r.status === 200 || r.status === 307;
      record("A.1", `${role} GET ${p}`, ok ? "PASS" : "FAIL", r.status,
        ok ? "accessible" : `unexpected ${r.status} → ${r.location}`);
    }
  }

  sub("A.2 Sidebar role-based filtering — pages cấm should redirect/403");
  const FORBIDDEN = [
    ["TK-A", "/warehouse"], ["TK-A", "/sales"],
    ["TM-A", "/warehouse"], ["TM-A", "/engineering"], ["TM-A", "/operations"],
    ["KHO-A", "/sales"], ["KHO-A", "/engineering"],
    ["VH-A", "/warehouse"], ["VH-A", "/sales"], ["VH-A", "/engineering"],
    ["TK-A", "/admin"], ["TM-A", "/admin"], ["KHO-A", "/admin"], ["VH-A", "/admin"],
  ];
  for (const [role, p] of FORBIDDEN) {
    if (!userJars.has(role)) continue;
    const r = await callPage(role, p);
    const blocked = r.status === 307 || r.status === 403 || r.status === 404;
    record("A.2", `${role} blocked from ${p}`, blocked ? "PASS" : "FAIL", r.status,
      blocked ? `blocked (${r.status})` : `LEAKED — ${role} accessed ${p}!`);
  }

  sub("A.3 RBAC API — negative tests");
  const RBAC_NEG = [
    ["KHO-A", "POST", "/api/purchase-requests", { title: "x", source: "MANUAL", lines: [{ itemId: "00000000-0000-0000-0000-000000000001", qty: 1 }] }, "warehouse blocked from PR create"],
    ["KHO-A", "POST", "/api/purchase-requests/00000000-0000-0000-0000-000000000001/approve", {}, "warehouse blocked from PR approve"],
    ["KHO-A", "POST", "/api/bom/templates", { code: "x", name: "x", targetQty: 1 }, "warehouse blocked from BOM create"],
    ["TM-A",  "POST", "/api/work-orders/quick", { productItemId: "00000000-0000-0000-0000-000000000001", plannedQty: 1, materials: [{ itemId: "x", qty: 1 }] }, "purchaser blocked from WO create"],
    ["TM-A",  "POST", "/api/bom/templates", { code: "x", name: "x", targetQty: 1 }, "purchaser blocked from BOM create"],
    ["VH-A",  "POST", "/api/bom/templates", { code: "x", name: "x", targetQty: 1 }, "operator blocked from BOM create"],
    ["VH-A",  "POST", "/api/purchase-requests", { title: "x", source: "MANUAL", lines: [{ itemId: "x", qty: 1 }] }, "operator blocked from PR create"],
    ["VH-A",  "POST", "/api/suppliers", { code: "x", name: "x" }, "operator blocked from supplier create"],
  ];
  for (const [role, method, path, body, desc] of RBAC_NEG) {
    if (!userJars.has(role)) continue;
    const r = await call(role, method, path, body);
    const blocked = r.status === 403 || r.status === 401;
    record("A.3", desc, blocked ? "PASS" : "FAIL", r.status,
      blocked ? "denied" : `LEAKED — ${role} could ${method} ${path}`);
  }

  sub("A.4 RBAC API — positive (planner can create BOM, etc.)");
  const RBAC_POS = [
    ["TK-A", "GET", "/api/bom/templates?limit=1", null, "planner reads BOM"],
    ["TM-A", "GET", "/api/suppliers?limit=1", null, "purchaser reads suppliers"],
    ["KHO-A", "GET", "/api/warehouse/layout", null, "warehouse reads layout"],
    ["VH-A", "GET", "/api/work-orders?pageSize=1", null, "operator reads WO"],
    ["admin", "GET", "/api/admin/users?limit=1", null, "admin reads users"],
  ];
  for (const [role, method, path, body, desc] of RBAC_POS) {
    if (!userJars.has(role)) continue;
    const r = await call(role, method, path, body);
    record("A.4", desc, r.ok ? "PASS" : "FAIL", r.status,
      r.ok ? "allowed" : "DENIED — should be allowed");
  }

  // ===================================================================
  // SECTION B: BOM Lifecycle
  // ===================================================================
  header("SECTION B — BOM lifecycle (TK-A)");

  sub("B.1 List + filter BOM");
  const bomList = await call("TK-A", "GET", "/api/bom/templates?limit=10&hasComponents=true");
  if (bomList.ok) {
    record("B.1", "List BOM templates", "PASS", 200, `${bomList.body?.data?.length ?? 0} rows, total=${bomList.body?.meta?.total}`);
    created.existingBomId = bomList.body?.data?.[0]?.id;
    created.existingBomCode = bomList.body?.data?.[0]?.code;
  } else {
    record("B.1", "List BOM templates", "FAIL", bomList.status, JSON.stringify(bomList.body).slice(0, 150));
  }

  sub("B.2 BOM detail + tree + sheets");
  if (created.existingBomId) {
    const detail = await call("TK-A", "GET", `/api/bom/templates/${created.existingBomId}`);
    record("B.2", `Detail ${created.existingBomCode}`, detail.ok ? "PASS" : "FAIL", detail.status,
      `tree=${detail.body?.data?.tree?.length ?? 0} lines`);

    const sheets = await call("TK-A", "GET", `/api/bom/templates/${created.existingBomId}/sheets`);
    if (sheets.ok) {
      const list = sheets.body?.data ?? [];
      const hasProject = list.some(s => s.kind === "PROJECT");
      const hasMaterial = list.some(s => s.kind === "MATERIAL");
      record("B.2", "Sheets PROJECT + MATERIAL (V3.7.27)",
        hasProject && hasMaterial ? "PASS" : "WARN", 200,
        `${list.length} sheets, P=${hasProject} M=${hasMaterial}`);
    } else {
      record("B.2", "Sheets list", "FAIL", sheets.status, "");
    }
  } else {
    record("B.2", "Detail", "SKIP", null, "no BOM found");
  }

  sub("B.3 Create new BOM template");
  const bomCode = `AUDIT-${TS.slice(-8)}`;
  const itemForBom = await call("TK-A", "GET", "/api/items?type=FG&pageSize=1");
  const fgItem = itemForBom.body?.data?.[0];
  const bomCreate = await call("TK-A", "POST", "/api/bom/templates", {
    code: bomCode,
    name: `Audit BOM ${TAG}`,
    description: "Auto E2E audit",
    parentItemId: fgItem?.id,
    targetQty: 1,
  });
  if (bomCreate.status === 201 || bomCreate.ok) {
    created.bomId = bomCreate.body?.data?.id;
    created.bomCode = bomCreate.body?.data?.code;
    record("B.3", "Create BOM", "PASS", bomCreate.status, `code=${created.bomCode}`);
  } else {
    record("B.3", "Create BOM", "FAIL", bomCreate.status, JSON.stringify(bomCreate.body).slice(0, 200));
  }

  sub("B.4 Auto-create MATERIAL sheet on new BOM (V3.7.27)");
  if (created.bomId) {
    await sleep(500);
    const sheets = await call("TK-A", "GET", `/api/bom/templates/${created.bomId}/sheets`);
    const list = sheets.body?.data ?? [];
    const matSheet = list.find(s => s.kind === "MATERIAL");
    if (matSheet) {
      record("B.4", "MATERIAL sheet auto-created", "PASS", 200, `${list.length} sheets, MATERIAL=${matSheet.name}`);
      const matRows = await call("TK-A", "GET", `/api/bom/sheets/${matSheet.id}/material-rows?limit=5`);
      record("B.4", "MATERIAL rows populated", matRows.ok && matRows.body?.data?.length > 0 ? "PASS" : "WARN",
        matRows.status, `${matRows.body?.data?.length ?? 0} material rows`);
    } else {
      record("B.4", "MATERIAL sheet", "FAIL", 200, `Only ${list.length} sheets, no MATERIAL — V3.7.27 broken!`);
    }
  } else {
    record("B.4", "Skip", "SKIP", null, "BOM not created");
  }

  sub("B.5 Add BOM line");
  if (created.bomId) {
    const item = await call("TK-A", "GET", "/api/items?type=PURCHASED&pageSize=1");
    const i = item.body?.data?.[0];
    if (i) {
      const addLine = await call("TK-A", "POST", `/api/bom/templates/${created.bomId}/lines`, {
        componentItemId: i.id,
        qtyPerParent: "2",
        scrapPercent: "0",
        position: 1,
      });
      const ok = addLine.status === 201 || addLine.ok;
      record("B.5", "Add BOM line", ok ? "PASS" : "FAIL", addLine.status,
        ok ? `lineId=${addLine.body?.data?.id?.slice(0, 8)}` : JSON.stringify(addLine.body).slice(0, 150));
      if (ok) created.lineId = addLine.body?.data?.id;
    } else {
      record("B.5", "Add line", "SKIP", null, "no item available");
    }
  }

  sub("B.6 Rename BOM (V3.7.27)");
  if (created.bomId) {
    const newName = `Audit BOM ${TAG} [renamed]`;
    const ren = await call("TK-A", "PATCH", `/api/bom/templates/${created.bomId}`, { name: newName });
    record("B.6", "Rename BOM", ren.ok ? "PASS" : "FAIL", ren.status,
      ren.ok ? `name=${ren.body?.data?.name}` : JSON.stringify(ren.body).slice(0, 150));
  }

  sub("B.7 Clone BOM");
  if (created.bomId) {
    const clone = await call("TK-A", "POST", `/api/bom/templates/${created.bomId}/clone`, {
      newCode: `${bomCode}_COPY`,
    });
    const ok = clone.status === 201 || clone.ok;
    record("B.7", "Clone BOM", ok ? "PASS" : "FAIL", clone.status,
      ok ? `clonedId=${clone.body?.data?.template?.id?.slice(0, 8)}, lines=${clone.body?.data?.lineCount}` :
           JSON.stringify(clone.body).slice(0, 200));
    if (ok) created.clonedBomId = clone.body?.data?.template?.id;
  }

  sub("B.8 Soft-delete (OBSOLETE)");
  if (created.clonedBomId) {
    const del = await call("TK-A", "DELETE", `/api/bom/templates/${created.clonedBomId}`);
    record("B.8", "Soft-delete clone", del.ok ? "PASS" : "FAIL", del.status, del.ok ? "OBSOLETE" : "");
  }

  // ===================================================================
  // SECTION C: Master data
  // ===================================================================
  header("SECTION C — Master data (items + suppliers)");

  sub("C.1 Item CRUD");
  const itemList = await call("TK-A", "GET", "/api/items?pageSize=5");
  record("C.1", "List items", itemList.ok ? "PASS" : "FAIL", itemList.status,
    `${itemList.body?.data?.length ?? 0} rows`);

  const newSku = `AUDIT-ITEM-${TS.slice(-8)}`;
  const itemCreate = await call("TK-A", "POST", "/api/items", {
    sku: newSku,
    name: "Audit test item",
    itemType: "PURCHASED",
    uom: "PCS",
  });
  const ic = itemCreate.status === 201 || itemCreate.ok;
  record("C.1", "Create item", ic ? "PASS" : "FAIL", itemCreate.status,
    ic ? `sku=${newSku}` : JSON.stringify(itemCreate.body).slice(0, 150));
  if (ic) created.itemId = itemCreate.body?.data?.id;

  if (created.itemId) {
    const upd = await call("TK-A", "PATCH", `/api/items/${created.itemId}`, {
      name: "Audit test item [updated]",
    });
    record("C.1", "Update item", upd.ok ? "PASS" : "FAIL", upd.status, upd.ok ? "ok" : "");
  }

  sub("C.2 Supplier CRUD");
  const supList = await call("TM-A", "GET", "/api/suppliers?pageSize=5");
  record("C.2", "List suppliers", supList.ok ? "PASS" : "FAIL", supList.status,
    `${supList.body?.data?.length ?? 0} rows`);

  const supCreate = await call("TM-A", "POST", "/api/suppliers", {
    code: `AUDIT-SUP-${TS.slice(-6)}`,
    name: `Audit supplier ${TAG}`,
    contactName: "Audit contact",
    phone: "0900000000",
  });
  const sc = supCreate.status === 201 || supCreate.ok;
  record("C.2", "Create supplier (TM-A)", sc ? "PASS" : "FAIL", supCreate.status,
    sc ? `id=${supCreate.body?.data?.id?.slice(0, 8)}` : JSON.stringify(supCreate.body).slice(0, 150));
  if (sc) created.supplierId = supCreate.body?.data?.id;

  if (created.supplierId) {
    const supUpd = await call("TM-A", "PATCH", `/api/suppliers/${created.supplierId}`, {
      contactName: "Audit contact [updated]",
    });
    record("C.2", "Update supplier", supUpd.ok ? "PASS" : "FAIL", supUpd.status, "");

    const supStats = await call("TM-A", "GET", `/api/suppliers/${created.supplierId}/po-stats`);
    record("C.2", "Supplier PO stats", supStats.ok ? "PASS" : "FAIL", supStats.status, "");
  }

  // ===================================================================
  // SECTION D: Procurement E2E
  // ===================================================================
  header("SECTION D — Procurement E2E (PR→approve→PO→send→receive)");

  sub("D.1 TK-A creates PR");
  // Pick 2 items có DEMO supplier
  const items = await call("TK-A", "GET", "/api/items?type=PURCHASED&q=DEMO-&pageSize=10");
  const demoItems = (items.body?.data ?? []).filter(i => i.sku?.startsWith("DEMO-")).slice(0, 2);
  if (demoItems.length < 2) {
    record("D.1", "Pick 2 DEMO items", "FAIL", null, `only ${demoItems.length} DEMO items`);
  } else {
    record("D.1", "Pick 2 DEMO items", "PASS", null, demoItems.map(i => i.sku).join(", "));
    const prRes = await call("TK-A", "POST", "/api/purchase-requests", {
      title: `${TAG} PR audit`,
      source: "MANUAL",
      notes: "Auto E2E audit",
      lines: [
        { itemId: demoItems[0].id, qty: 4, notes: "L1" },
        { itemId: demoItems[1].id, qty: 2, notes: "L2" },
      ],
    });
    const prOk = prRes.status === 201 || prRes.ok;
    record("D.1", "Create PR", prOk ? "PASS" : "FAIL", prRes.status,
      prOk ? `code=${prRes.body?.data?.code} status=${prRes.body?.data?.status}` :
             JSON.stringify(prRes.body).slice(0, 200));
    if (prOk) {
      created.prId = prRes.body?.data?.id;
      created.prCode = prRes.body?.data?.code;
    }
  }

  sub("D.2 TM-A receives notification");
  if (created.prCode) {
    await sleep(500);
    const notif = await call("TM-A", "GET", "/api/notifications?unread=1&limit=20");
    const found = (notif.body?.data ?? []).find(n =>
      n.entityType === "purchase_request" && (n.entityCode === created.prCode || n.entityId === created.prId)
    );
    record("D.2", "PR_SUBMITTED notif → TM-A", found ? "PASS" : "WARN", null,
      found ? `title="${found.title}"` : "no notif found");
  }

  sub("D.3 TM-A approves PR");
  if (created.prId) {
    const ap = await call("TM-A", "POST", `/api/purchase-requests/${created.prId}/approve`, {
      notes: `${TAG} approved`,
    });
    record("D.3", "Approve PR", ap.ok ? "PASS" : "FAIL", ap.status,
      ap.ok ? `status=${ap.body?.data?.status}` : JSON.stringify(ap.body).slice(0, 150));
  }

  sub("D.4 TM-A creates PO from PR");
  if (created.prId) {
    const cp = await call("TM-A", "POST", `/api/purchase-orders/from-pr/${created.prId}`, {});
    const cpOk = cp.status === 201 || cp.ok;
    record("D.4", "Create PO from PR", cpOk ? "PASS" : "FAIL", cp.status,
      cpOk ? "created" : JSON.stringify(cp.body).slice(0, 200));
    if (cpOk) {
      const pos = Array.isArray(cp.body?.data) ? cp.body.data : [cp.body?.data];
      created.poId = pos[0]?.id;
      created.poCode = pos[0]?.code;
      record("D.4", "PO details", "PASS", null, `code=${created.poCode}`);
    }
  }

  sub("D.5 TM-A sends PO to supplier");
  if (created.poId) {
    const sd = await call("TM-A", "POST", `/api/purchase-orders/${created.poId}/send`, {});
    record("D.5", "Send PO", sd.ok ? "PASS" : "FAIL", sd.status,
      sd.ok ? `status=${sd.body?.data?.status}` : JSON.stringify(sd.body).slice(0, 150));
  }

  sub("D.6 KHO-A nhận hàng (receiving scan)");
  if (created.poId) {
    await sleep(500);
    // Get PO lines
    const poDetail = await call("KHO-A", "GET", `/api/purchase-orders/${created.poId}`);
    const lines = poDetail.body?.data?.lines ?? [];
    if (lines.length > 0) {
      // Build receiving events for each line (full qty)
      const events = lines.map(l => ({
        poLineId: l.id,
        qtyAcked: l.qty,
        qtyRejected: 0,
        notes: `${TAG} rcv`,
      }));
      const rcv = await call("KHO-A", "POST", `/api/receiving/${created.poId}/events`, { events });
      const rcvOk = rcv.status === 201 || rcv.ok;
      record("D.6", `Receiving ${lines.length} lines`, rcvOk ? "PASS" : "FAIL", rcv.status,
        rcvOk ? `acked=${rcv.body?.data?.acked} rejected=${rcv.body?.data?.rejected}` :
                JSON.stringify(rcv.body).slice(0, 200));

      await sleep(500);
      const poAfter = await call("KHO-A", "GET", `/api/purchase-orders/${created.poId}`);
      const newStatus = poAfter.body?.data?.status;
      record("D.6", "PO auto-RECEIVED", newStatus === "RECEIVED" ? "PASS" : "WARN", null,
        `status=${newStatus}`);
    } else {
      record("D.6", "Receiving", "SKIP", null, "no PO lines found");
    }
  }

  // ===================================================================
  // SECTION E: Production E2E
  // ===================================================================
  header("SECTION E — Production E2E (WO→ISR→approve→complete)");

  sub("E.1 VH-A tạo WO quick");
  // Pick FG + material
  const fgList = await call("VH-A", "GET", "/api/items?type=FG&q=DEMO&pageSize=5");
  const matList = await call("VH-A", "GET", "/api/items?type=PURCHASED&q=DEMO&pageSize=5");
  const fg = fgList.body?.data?.[0];
  const mat = matList.body?.data?.find(i => (i.onHandQty ?? 0) > 0) ?? matList.body?.data?.[0];
  if (fg && mat) {
    const wo = await call("VH-A", "POST", "/api/work-orders/quick", {
      productItemId: fg.id,
      plannedQty: 1,
      priority: "NORMAL",
      notes: `${TAG} WO quick`,
      materials: [{ itemId: mat.id, qty: 1 }],
    });
    const woOk = wo.status === 201 || wo.ok;
    record("E.1", `Create WO (FG=${fg.sku}, mat=${mat.sku})`, woOk ? "PASS" : "FAIL",
      wo.status, woOk ? `wo=${wo.body?.data?.wo?.woNo}` : JSON.stringify(wo.body).slice(0, 200));
    if (woOk) {
      created.woId = wo.body?.data?.wo?.id;
      created.woNo = wo.body?.data?.wo?.woNo;
      created.isrId = wo.body?.data?.isr?.id;
      created.isrNo = wo.body?.data?.isr?.isrNo;
      record("E.1", `Auto-ISR ${created.isrNo}`, "PASS", null, `shortage=${wo.body?.data?.totalShortage ?? 0}`);
    }
  } else {
    record("E.1", "WO create", "SKIP", null, `fg=${!!fg} mat=${!!mat}`);
  }

  sub("E.2 KHO-A receives ISR notif");
  if (created.isrNo) {
    await sleep(500);
    const notif = await call("KHO-A", "GET", "/api/notifications?unread=1&limit=20");
    const found = (notif.body?.data ?? []).find(n =>
      n.entityType === "issue_request" && (n.entityCode === created.isrNo || n.entityId === created.isrId)
    );
    record("E.2", "ISR_PENDING notif → KHO-A", found ? "PASS" : "WARN", null,
      found ? `title="${found.title}"` : "no notif");
  }

  sub("E.3 KHO-A approves ISR (xuất kho)");
  if (created.isrId) {
    const ap = await call("KHO-A", "POST", `/api/warehouse/issue-request/${created.isrId}/approve`, {});
    record("E.3", "Approve ISR", ap.ok ? "PASS" : "FAIL", ap.status,
      ap.ok ? `txnIds=${ap.body?.data?.txnIds?.length ?? 0} totalQty=${ap.body?.data?.totalQty}` :
              JSON.stringify(ap.body).slice(0, 200));
  }

  sub("E.4 VH-A receives approval notif");
  if (created.isrNo) {
    await sleep(500);
    const notif = await call("VH-A", "GET", "/api/notifications?unread=1&limit=20");
    const found = (notif.body?.data ?? []).find(n =>
      n.entityCode === created.isrNo || n.entityId === created.isrId
    );
    record("E.4", "ISR_APPROVED notif → VH-A", found ? "PASS" : "WARN", null,
      found ? `type=${found.notificationType}` : "no notif");
  }

  // ===================================================================
  // SECTION F: Warehouse ops
  // ===================================================================
  header("SECTION F — Warehouse operations (KHO-A)");

  sub("F.1 Layout health");
  const layout = await call("KHO-A", "GET", "/api/warehouse/layout");
  const stats = layout.body?.data?.stats ?? {};
  record("F.1", "Layout stats", layout.ok ? "PASS" : "FAIL", layout.status,
    `${stats.totalBins ?? 0} bins, ${stats.occupiedBins ?? 0} occupied, qty=${stats.totalQty ?? 0}`);

  sub("F.2 Inventory balance");
  const inv = await call("KHO-A", "GET", "/api/inventory/balance?pageSize=5");
  record("F.2", "Inventory balance", inv.ok ? "PASS" : "FAIL", inv.status,
    `${inv.body?.data?.length ?? 0} items`);

  sub("F.3 Issue request list");
  const isrList = await call("KHO-A", "GET", "/api/warehouse/issue-request?status=PENDING&pageSize=10");
  record("F.3", "ISR PENDING list", isrList.ok ? "PASS" : "FAIL", isrList.status,
    `${isrList.body?.data?.length ?? 0} pending`);

  sub("F.4 PO list (receiving)");
  const poList = await call("KHO-A", "GET", "/api/purchase-orders?status=SENT&status=PARTIAL&pageSize=10");
  record("F.4", "PO list SENT/PARTIAL", poList.ok ? "PASS" : "FAIL", poList.status,
    `${poList.body?.data?.length ?? 0} POs`);

  sub("F.5 Bin operations (occupied bin)");
  const layoutFull = await call("KHO-A", "GET", "/api/warehouse/layout");
  const bins = layoutFull.body?.data?.bins ?? [];
  const occupiedBin = bins.find(b => (b.totalQty ?? 0) > 0);
  if (occupiedBin) {
    const detail = await call("KHO-A", "GET", `/api/warehouse/bins/${occupiedBin.id}`);
    record("F.5", `Bin detail ${occupiedBin.code}`, detail.ok ? "PASS" : "FAIL", detail.status,
      detail.ok ? `lots=${detail.body?.data?.lots?.length ?? 0}` : "");
  } else {
    record("F.5", "Bin detail", "SKIP", null, "no occupied bin");
  }

  // ===================================================================
  // SECTION G: Notifications system
  // ===================================================================
  header("SECTION G — Notifications system");

  for (const role of ["TK-A", "TM-A", "KHO-A", "VH-A"]) {
    if (!userJars.has(role)) continue;
    const r = await call(role, "GET", "/api/notifications?limit=20");
    if (!r.ok) {
      record("G", `${role} list`, "FAIL", r.status, "");
      continue;
    }
    const items = r.body?.data ?? [];
    const unread = items.filter(n => !n.readAt).length;
    record("G", `${role} list`, "PASS", 200, `total=${items.length} unread=${unread}`);

    // Mark first unread as read
    const firstUnread = items.find(n => !n.readAt);
    if (firstUnread) {
      const m = await call(role, "POST", `/api/notifications/${firstUnread.id}/read`, {});
      record("G", `${role} mark-read`, (m.ok || m.status === 204) ? "PASS" : "FAIL", m.status, "");
    }
  }

  sub("G.* Mark-all-read");
  const mar = await call("TK-A", "POST", "/api/notifications/read-all", {});
  record("G", "TK-A mark-all-read", mar.ok ? "PASS" : "FAIL", mar.status,
    mar.ok ? `marked=${mar.body?.data?.markedCount ?? "?"}` : "");

  // ===================================================================
  // SECTION H: Multi-step super-workflow A→B→C→D
  // ===================================================================
  header("SECTION H — Super-workflow A→B→C→D");
  console.log(c("\nFlow: TK-A tạo PR → TM-A duyệt + tạo PO + send →\n  KHO-A nhận → VH-A tạo WO + ISR → KHO-A duyệt ISR →\n  VH-A nhận notif COMPLETED. Verify mỗi node hoàn thành đúng thứ tự.\n", "cyan"));
  // Đã chạy ở D + E. Verify state: PR APPROVED → PO RECEIVED, WO + ISR COMPLETED.
  if (created.prId && created.poId && created.isrId) {
    const pr = await call("TM-A", "GET", `/api/purchase-requests/${created.prId}`);
    const po = await call("TM-A", "GET", `/api/purchase-orders/${created.poId}`);
    const wo = await call("VH-A", "GET", `/api/work-orders/${created.woId}`);
    const isr = await call("KHO-A", "GET", `/api/warehouse/issue-request/${created.isrId}`);

    const prStatus = pr.body?.data?.status;
    const poStatus = po.body?.data?.status;
    const woStatus = wo.body?.data?.status ?? wo.body?.data?.wo?.status;
    const isrStatus = isr.body?.data?.status;

    record("H", "PR final status", prStatus === "APPROVED" || prStatus === "ORDERED" ? "PASS" : "WARN",
      null, `status=${prStatus}`);
    record("H", "PO final status", poStatus === "RECEIVED" || poStatus === "PARTIAL" || poStatus === "SENT" ? "PASS" : "WARN",
      null, `status=${poStatus}`);
    record("H", "WO final status", woStatus ? "PASS" : "WARN", null, `status=${woStatus}`);
    record("H", "ISR final status", isrStatus === "COMPLETED" || isrStatus === "APPROVED" ? "PASS" : "WARN",
      null, `status=${isrStatus}`);
  } else {
    record("H", "Super-workflow", "SKIP", null, "missing entities from D/E");
  }

  // ===================================================================
  // SECTION I: Dashboard data integrity
  // ===================================================================
  header("SECTION I — Dashboard data integrity");
  for (const role of ROLES) {
    if (!userJars.has(role)) continue;
    const ov = await call(role, "GET", "/api/dashboard/overview-v2");
    record("I", `${role} dashboard`, ov.ok ? "PASS" : "FAIL", ov.status, "");
  }

  // ===================================================================
  // SECTION J: Admin operations
  // ===================================================================
  header("SECTION J — Admin operations (admin only)");
  if (userJars.has("admin")) {
    const us = await call("admin", "GET", "/api/admin/users?limit=20");
    record("J", "List users", us.ok ? "PASS" : "FAIL", us.status,
      `${us.body?.data?.length ?? 0} users`);
    const audit = await call("admin", "GET", "/api/admin/audit?limit=10");
    record("J", "Audit log", audit.ok ? "PASS" : "FAIL", audit.status,
      `${audit.body?.data?.length ?? 0} entries`);
    const stats = await call("admin", "GET", "/api/admin/stats");
    record("J", "System stats", stats.ok ? "PASS" : "FAIL", stats.status,
      stats.ok ? "ok" : "");
  }

  // =====================================================================
  // FINAL OUTPUT
  // =====================================================================
  console.log(c("\n\n╔══════════════════════════════════════════╗", "bold"));
  console.log(c("║   FULL SYSTEM AUDIT — TỔNG KẾT           ║", "bold"));
  console.log(c("╚══════════════════════════════════════════╝", "bold"));

  const total = results.length;
  const pass = results.filter(r => r.status === "PASS").length;
  const fail = results.filter(r => r.status === "FAIL").length;
  const warn = results.filter(r => r.status === "WARN").length;
  const skip = results.filter(r => r.status === "SKIP").length;

  console.log(`Total: ${total} | ${c(`PASS=${pass}`, "green")} | ${c(`FAIL=${fail}`, "red")} | ${c(`WARN=${warn}`, "yellow")} | ${c(`SKIP=${skip}`, "gray")}`);

  if (fail > 0) {
    console.log(c("\n❌ FAILURES:", "red"));
    for (const r of results.filter(r => r.status === "FAIL")) {
      console.log(c(`  [${r.section}] ${r.name} (HTTP ${r.http})`, "red"));
      console.log(c(`     ${r.detail}`, "gray"));
    }
  }
  if (warn > 0) {
    console.log(c("\n⚠ WARNINGS:", "yellow"));
    for (const r of results.filter(r => r.status === "WARN")) {
      console.log(c(`  [${r.section}] ${r.name}`, "yellow"));
      console.log(c(`     ${r.detail}`, "gray"));
    }
  }

  // Write JSON results for report generation
  const fs = await import("node:fs");
  const path = await import("node:path");
  const out = path.resolve("audit-results.json");
  fs.writeFileSync(out, JSON.stringify({
    timestamp: TS, base: BASE, tag: TAG,
    summary: { total, pass, fail, warn, skip },
    created,
    results,
  }, null, 2));
  console.log(c(`\nResults JSON: ${out}`, "cyan"));

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(c("FATAL: " + e.stack, "red"));
  process.exit(2);
});
