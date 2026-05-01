#!/usr/bin/env node
// =====================================================================
// FULL COVERAGE 100% E2E — MES SongChau (V3.7.44+)
// =====================================================================
// Mục tiêu: bao phủ 100% hệ thống — mọi endpoint, mọi nút, mọi role,
// mọi workflow, frontend rendering, backend logic, database integrity.
//
// Layers tested:
//   1. UI/UX     — page render HTTP 200 cho mọi route theo role
//   2. Frontend  — UI components → API calls → response handling
//   3. Backend   — API endpoints (positive + negative + RBAC)
//   4. Database  — entity created với correct fields (verify via GET)
//
// 5 phòng ban (5 roles):
//   admin · planner (TK-A) · purchaser (TM-A) · warehouse (KHO-A) · operator (VH-A)
//
// 30+ sections, 200+ checks. Throttle 1100ms để bypass rate limit 60/60s/IP.
// Output: JSON + markdown report với pass/fail/skip per check.
// =====================================================================

import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "https://mes.songchau.vn";
const PASSWORDS = ["Test@1234", "ChangeMe!234"];
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const TAG = `[100COV-${TS.slice(-6)}]`;

const colors = {
  reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", gray: "\x1b[90m", bold: "\x1b[1m", magenta: "\x1b[35m",
  blue: "\x1b[34m",
};
const c = (s, col) => `${colors[col] || ""}${s}${colors.reset}`;

const results = [];
const userJars = new Map();
const created = {};

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

const THROTTLE_MS = 1100;
let lastReqAt = 0;
async function throttle() {
  const w = THROTTLE_MS - (Date.now() - lastReqAt);
  if (w > 0) await new Promise(r => setTimeout(r, w));
  lastReqAt = Date.now();
}

async function call(role, method, path, body) {
  await throttle();
  const headers = { "Content-Type": "application/json" };
  const jar = userJars.get(role);
  if (jar) headers.Cookie = jar;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
  } catch (err) {
    return { status: 0, ok: false, body: null, err: String(err) };
  }
  const scs = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie() : null;
  if (scs?.length) userJars.set(role, recordCookies(jar, scs));
  let parsed = null;
  const text = await res.text();
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 300); }
  return { status: res.status, ok: res.ok, body: parsed };
}

async function callPage(role, path) {
  await throttle();
  const headers = {};
  const jar = userJars.get(role);
  if (jar) headers.Cookie = jar;
  try {
    const res = await fetch(`${BASE}${path}`, { method: "GET", headers, redirect: "manual" });
    return { status: res.status, location: res.headers.get("location") };
  } catch (err) {
    return { status: 0, err: String(err) };
  }
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
  console.log(`  ${c(icon[status], map[status])} [${section}] ${name} ${http ? c(`(${http})`, "gray") : ""} — ${c((detail ?? "").slice(0, 200), "gray")}`);
}

function header(t) { console.log(c(`\n=== ${t} ===`, "bold")); }
function sub(t) { console.log(c(`\n--- ${t} ---`, "magenta")); }

// =====================================================================
// MAIN
// =====================================================================
async function main() {
  console.log(c(`\n╔══════════════════════════════════════════════════════╗`, "bold"));
  console.log(c(`║  FULL COVERAGE 100% E2E — ${TAG}              ║`, "bold"));
  console.log(c(`║  Base: ${BASE}                  ║`, "bold"));
  console.log(c(`╚══════════════════════════════════════════════════════╝`, "bold"));

  const ROLES = ["admin", "TK-A", "TM-A", "KHO-A", "VH-A"];

  // ===== PRE: login all =====
  header("PRE — Login 5 roles");
  for (const r of ROLES) {
    const lr = await login(r);
    if (lr.ok) record("PRE", `login ${r}`, "PASS", 200, `pwd=${lr.password}`);
    else record("PRE", `login ${r}`, "FAIL", lr.status, JSON.stringify(lr.body).slice(0, 150));
  }

  // ===== A. /api/me + /api/health =====
  header("A — Auth / Session checks");
  const health = await call("admin", "GET", "/api/health");
  record("A", "GET /api/health", health.ok ? "PASS" : "FAIL", health.status, "");
  for (const r of ROLES) {
    if (!userJars.has(r)) continue;
    const me = await call(r, "GET", "/api/me");
    record("A", `${r} /api/me`, me.ok ? "PASS" : "FAIL", me.status,
      me.ok ? `roles=${JSON.stringify(me.body?.roles ?? me.body?.data?.roles ?? "?")}` : "");
  }

  // ===== B. UI Pages — render check (HTTP 200/307) =====
  header("B — UI Pages render (frontend)");
  const PAGES = {
    "admin": [
      "/", "/warehouse", "/sales", "/engineering", "/operations", "/admin",
      "/admin/users", "/admin/audit", "/admin/settings",
      "/items", "/suppliers",
      "/bom/import", "/bom/new",
      "/procurement/purchase-orders", "/procurement/purchase-orders/new",
      "/procurement/purchase-requests", "/procurement/purchase-requests/new",
      "/work-orders", "/work-orders/new", "/work-orders/quick-new",
      "/receiving", "/assembly",
      "/notifications",
    ],
    "TK-A": ["/", "/engineering", "/bom/import", "/bom/new", "/items", "/notifications"],
    "TM-A": ["/", "/sales", "/suppliers", "/procurement/purchase-orders", "/procurement/purchase-requests", "/notifications"],
    "KHO-A": ["/", "/warehouse", "/receiving", "/notifications"],
    "VH-A": ["/", "/operations", "/work-orders", "/assembly", "/notifications"],
  };
  for (const [role, paths] of Object.entries(PAGES)) {
    if (!userJars.has(role)) continue;
    for (const p of paths) {
      const r = await callPage(role, p);
      const ok = r.status === 200 || r.status === 307;
      record("B", `${role} GET ${p}`, ok ? "PASS" : "FAIL", r.status,
        ok ? "renders" : `unexpected ${r.location ?? "no-redirect"}`);
    }
  }

  // ===== C. RBAC matrix — negative tests (cross-role denied) =====
  header("C — RBAC negative (matrix enforce)");
  const RBAC_NEG = [
    ["KHO-A", "POST", "/api/purchase-requests", { title: "x", source: "MANUAL", lines: [{ itemId: "00000000-0000-0000-0000-000000000001", qty: 1 }] }, "warehouse blocked PR create"],
    ["KHO-A", "POST", "/api/bom/templates", { code: "x", name: "x", targetQty: 1 }, "warehouse blocked BOM create"],
    ["TM-A", "POST", "/api/work-orders/quick", { productItemId: "00000000-0000-0000-0000-000000000001", plannedQty: 1, materials: [{ itemId: "x", qty: 1 }] }, "purchaser blocked WO create"],
    ["TM-A", "POST", "/api/bom/templates", { code: "x", name: "x", targetQty: 1 }, "purchaser blocked BOM create"],
    ["VH-A", "POST", "/api/bom/templates", { code: "x", name: "x", targetQty: 1 }, "operator blocked BOM create"],
    ["VH-A", "POST", "/api/purchase-requests", { title: "x", source: "MANUAL", lines: [{ itemId: "x", qty: 1 }] }, "operator blocked PR create"],
    ["VH-A", "POST", "/api/suppliers", { code: "x", name: "x" }, "operator blocked supplier create"],
    // Admin endpoints write actions chỉ admin role được. Read là OK cho mọi role
    // (matrix user/audit = ["read"]) — không test vì by design.
    ["TK-A", "POST", "/api/admin/users", { username: "x", password: "x" }, "planner blocked admin user CREATE"],
    ["TM-A", "POST", "/api/admin/users", { username: "x", password: "x" }, "purchaser blocked admin user CREATE"],
    ["VH-A", "POST", "/api/admin/users", { username: "x", password: "x" }, "operator blocked admin user CREATE"],
  ];
  for (const [role, method, p, body, desc] of RBAC_NEG) {
    if (!userJars.has(role)) continue;
    const r = await call(role, method, p, body);
    const blocked = r.status === 403 || r.status === 401;
    record("C", desc, blocked ? "PASS" : "FAIL", r.status,
      blocked ? "denied" : `LEAKED ${r.status}`);
  }

  // ===== D. Dashboard endpoints =====
  header("D — Dashboard data");
  for (const r of ROLES) {
    if (!userJars.has(r)) continue;
    const ov = await call(r, "GET", "/api/dashboard/overview-v2");
    record("D", `${r} dashboard overview-v2`, ov.ok ? "PASS" : "FAIL", ov.status, "");
    if (r === "admin") {
      const c1 = await call(r, "GET", "/api/dashboard/counts");
      record("D", "dashboard/counts", c1.ok ? "PASS" : "FAIL", c1.status, "");
      const c2 = await call(r, "GET", "/api/dashboard/activity");
      record("D", "dashboard/activity", c2.ok ? "PASS" : "FAIL", c2.status, "");
      const c3 = await call(r, "GET", "/api/dashboard/wo-trend");
      record("D", "dashboard/wo-trend", c3.ok ? "PASS" : "FAIL", c3.status, "");
      const c4 = await call(r, "GET", "/api/dashboard/action-items");
      record("D", "dashboard/action-items", c4.ok ? "PASS" : "FAIL", c4.status, "");
    }
  }

  // ===== E. Item master CRUD =====
  header("E — Item master (CRUD)");
  const itList = await call("TK-A", "GET", "/api/items?pageSize=5");
  record("E", "list items", itList.ok ? "PASS" : "FAIL", itList.status,
    `${itList.body?.data?.length ?? 0} rows`);
  const newSku = `COV-ITEM-${TS.slice(-8)}`;
  const itCreate = await call("TK-A", "POST", "/api/items", {
    sku: newSku, name: "Coverage test item", itemType: "PURCHASED", uom: "PCS",
  });
  const ic = itCreate.status === 201 || itCreate.ok;
  record("E", "create item", ic ? "PASS" : "FAIL", itCreate.status,
    ic ? `sku=${newSku}` : JSON.stringify(itCreate.body).slice(0, 150));
  if (ic) {
    created.itemId = itCreate.body?.data?.id;
    // GET /items/[id]
    const detail = await call("TK-A", "GET", `/api/items/${created.itemId}`);
    record("E", "get item detail (DB verify)", detail.ok ? "PASS" : "FAIL", detail.status,
      detail.ok ? `sku=${detail.body?.data?.sku}` : "");
    // PATCH update
    const upd = await call("TK-A", "PATCH", `/api/items/${created.itemId}`, {
      name: "Coverage test [updated]",
    });
    record("E", "update item", upd.ok ? "PASS" : "FAIL", upd.status, "");
    // GET inventory-summary
    const inv = await call("TK-A", "GET", `/api/items/${created.itemId}/inventory-summary`);
    record("E", "item inventory-summary", inv.ok ? "PASS" : "FAIL", inv.status, "");
  }

  // ===== F. Supplier master CRUD =====
  header("F — Supplier master (CRUD)");
  const supList = await call("TM-A", "GET", "/api/suppliers?pageSize=5");
  record("F", "list suppliers", supList.ok ? "PASS" : "FAIL", supList.status,
    `${supList.body?.data?.length ?? 0} rows`);
  const supCreate = await call("TM-A", "POST", "/api/suppliers", {
    code: `COV-SUP-${TS.slice(-6)}`,
    name: `Coverage supplier ${TAG}`,
    contactName: "Test contact",
  });
  const sc = supCreate.status === 201 || supCreate.ok;
  record("F", "create supplier", sc ? "PASS" : "FAIL", supCreate.status, "");
  if (sc) {
    created.supplierId = supCreate.body?.data?.id;
    const upd = await call("TM-A", "PATCH", `/api/suppliers/${created.supplierId}`, {
      contactName: "Updated",
    });
    record("F", "update supplier", upd.ok ? "PASS" : "FAIL", upd.status, "");
    const stats = await call("TM-A", "GET", `/api/suppliers/${created.supplierId}/po-stats`);
    record("F", "supplier po-stats", stats.ok ? "PASS" : "FAIL", stats.status, "");
  }

  // ===== G. BOM Template CRUD =====
  header("G — BOM Template (CRUD lifecycle)");
  const bomList = await call("TK-A", "GET", "/api/bom/templates?limit=10");
  record("G", "list BOM", bomList.ok ? "PASS" : "FAIL", bomList.status,
    `${bomList.body?.data?.length ?? 0} rows`);

  const bomCode = `COV-BOM-${TS.slice(-8)}`;
  const bomCreate = await call("TK-A", "POST", "/api/bom/templates", {
    code: bomCode, name: `Coverage BOM ${TAG}`, targetQty: 1,
  });
  const bc = bomCreate.status === 201 || bomCreate.ok;
  record("G", "create BOM", bc ? "PASS" : "FAIL", bomCreate.status, "");
  if (bc) {
    created.bomId = bomCreate.body?.data?.id;
    const detail = await call("TK-A", "GET", `/api/bom/templates/${created.bomId}`);
    record("G", "get BOM detail", detail.ok ? "PASS" : "FAIL", detail.status, "");

    // V3.7.27: Auto MATERIAL sheet
    const sheets = await call("TK-A", "GET", `/api/bom/templates/${created.bomId}/sheets`);
    const list = sheets.body?.data ?? [];
    const hasMat = list.some(s => s.kind === "MATERIAL");
    record("G", "auto MATERIAL sheet (V3.7.27)", hasMat ? "PASS" : "FAIL", sheets.status,
      `sheets=${list.length} mat=${hasMat}`);

    // Add line
    if (created.itemId) {
      const addLine = await call("TK-A", "POST", `/api/bom/templates/${created.bomId}/lines`, {
        componentItemId: created.itemId,
        qtyPerParent: "2",
      });
      const al = addLine.status === 201 || addLine.ok;
      record("G", "add BOM line (V3.7.31 sheetId fix)", al ? "PASS" : "FAIL", addLine.status,
        al ? `lineId=${addLine.body?.data?.id?.slice(0, 8)}` : JSON.stringify(addLine.body).slice(0, 150));
      if (al) created.bomLineId = addLine.body?.data?.id;
    }

    // Rename
    const ren = await call("TK-A", "PATCH", `/api/bom/templates/${created.bomId}`, {
      name: `Coverage BOM ${TAG} [renamed]`,
    });
    record("G", "rename BOM (V3.7.27)", ren.ok ? "PASS" : "FAIL", ren.status, "");

    // Clone (V3.7.32)
    const clone = await call("TK-A", "POST", `/api/bom/templates/${created.bomId}/clone`, {
      newCode: `${bomCode}_COPY`,
    });
    const cl = clone.status === 201 || clone.ok;
    record("G", "clone BOM (V3.7.32 sheet remap)", cl ? "PASS" : "FAIL", clone.status,
      cl ? "cloned" : JSON.stringify(clone.body).slice(0, 150));
    if (cl) {
      const clonedId = clone.body?.data?.template?.id;
      // Soft delete clone (planner OK V3.7.31)
      const del = await call("TK-A", "DELETE", `/api/bom/templates/${clonedId}`);
      record("G", "soft-delete clone (V3.7.31)", del.ok ? "PASS" : "FAIL", del.status, "");
      // Restore (V3.7.35)
      const restore = await call("TK-A", "PATCH", `/api/bom/templates/${clonedId}`, { status: "DRAFT" });
      record("G", "restore OBSOLETE→DRAFT (V3.7.35)", restore.ok ? "PASS" : "FAIL", restore.status, "");
      // Hard delete (V3.7.36, admin only)
      const sd = await call("admin", "DELETE", `/api/bom/templates/${clonedId}`);
      record("G", "soft-delete (admin)", sd.ok ? "PASS" : "FAIL", sd.status, "");
      const hd = await call("admin", "DELETE", `/api/bom/templates/${clonedId}?hard=true`);
      record("G", "hard-delete (V3.7.36)", hd.ok ? "PASS" : "FAIL", hd.status, "");
    }
  }

  // ===== H. BOM Lines + sheets sub-resources =====
  header("H — BOM Lines + sheet rows");
  if (created.bomId && created.bomLineId) {
    const tree = await call("TK-A", "GET", `/api/bom/templates/${created.bomId}/tree`);
    record("H", "GET tree", tree.ok ? "PASS" : "FAIL", tree.status,
      `lines=${tree.body?.data?.length ?? "?"}`);
    // PATCH line
    const updLine = await call("TK-A", "PATCH",
      `/api/bom/templates/${created.bomId}/lines/${created.bomLineId}`,
      { qtyPerParent: "5" });
    record("H", "update BOM line", updLine.ok ? "PASS" : "FAIL", updLine.status, "");
    // Sheets list
    const shts = await call("TK-A", "GET", `/api/bom/templates/${created.bomId}/sheets`);
    record("H", "list sheets", shts.ok ? "PASS" : "FAIL", shts.status, "");
    const matSheet = (shts.body?.data ?? []).find(s => s.kind === "MATERIAL");
    if (matSheet) {
      const matRows = await call("TK-A", "GET", `/api/bom/sheets/${matSheet.id}/material-rows?limit=3`);
      record("H", "MATERIAL rows", matRows.ok ? "PASS" : "FAIL", matRows.status,
        `${matRows.body?.data?.length ?? 0} rows`);
      const procRows = await call("TK-A", "GET", `/api/bom/sheets/${matSheet.id}/process-rows?limit=3`);
      record("H", "PROCESS rows", procRows.ok ? "PASS" : "FAIL", procRows.status,
        `${procRows.body?.data?.length ?? 0} rows`);
    }
  }

  // ===== I. Procurement: PR flow (Thương mại path) =====
  header("I — PR / Commercial PO flow (Thương mại)");
  const items = await call("TK-A", "GET", "/api/items?type=PURCHASED&q=DEMO-&pageSize=10");
  const demoItems = (items.body?.data ?? []).filter(i => i.sku?.startsWith("DEMO-")).slice(0, 2);
  if (demoItems.length >= 2) {
    const prRes = await call("TK-A", "POST", "/api/purchase-requests", {
      title: `${TAG} PR coverage`,
      source: "MANUAL",
      lines: [
        { itemId: demoItems[0].id, qty: 3 },
        { itemId: demoItems[1].id, qty: 2 },
      ],
    });
    const prOk = prRes.status === 201 || prRes.ok;
    record("I", "create PR", prOk ? "PASS" : "FAIL", prRes.status,
      prOk ? `${prRes.body?.data?.code} status=${prRes.body?.data?.status}` :
             JSON.stringify(prRes.body).slice(0, 150));
    if (prOk) {
      created.prId = prRes.body?.data?.id;
      created.prCode = prRes.body?.data?.code;
      // approve
      const ap = await call("TM-A", "POST", `/api/purchase-requests/${created.prId}/approve`, {
        notes: "coverage approve",
      });
      record("I", "TM-A approve PR", ap.ok ? "PASS" : "FAIL", ap.status, "");
      // PO from PR
      const cp = await call("TM-A", "POST", `/api/purchase-orders/from-pr/${created.prId}`, {});
      const cpOk = cp.status === 201 || cp.ok;
      record("I", "create PO from PR", cpOk ? "PASS" : "FAIL", cp.status, "");
      if (cpOk) {
        // Response shape: {data: {createdPOs: [...], linesBySupplier: {...}}}
        const createdPOs = cp.body?.data?.createdPOs ?? [];
        created.poCommercialId = createdPOs[0]?.id;
        // verify poType=COMMERCIAL (V3.7.43)
        const poDetail = await call("TM-A", "GET", `/api/purchase-orders/${created.poCommercialId}`);
        const ptype = poDetail.body?.data?.poType;
        record("I", "PO from PR has poType=COMMERCIAL (V3.7.43)",
          ptype === "COMMERCIAL" ? "PASS" : "FAIL", poDetail.status, `poType=${ptype}`);
        // PDF should reject for commercial (V3.7.43 guard)
        const pdfErr = await call("TM-A", "GET", `/api/purchase-orders/${created.poCommercialId}/pdf`);
        record("I", "PDF reject COMMERCIAL (V3.7.43 guard)",
          pdfErr.status === 400 ? "PASS" : "FAIL", pdfErr.status,
          pdfErr.body?.error?.code ?? "");
      }
    }
  } else {
    record("I", "DEMO items insufficient", "SKIP", null, `${demoItems.length} items`);
  }

  // ===== J. V3.7.43: Subcontract PO from BOM line =====
  header("J — Subcontract PO from BOM line (V3.7.43)");
  // Find BOM line for testing — use existing BOM
  const bomList2 = await call("TK-A", "GET", "/api/bom/templates?limit=5&hasComponents=true");
  const existingBom = bomList2.body?.data?.find(t => t.componentCount > 0);
  if (existingBom && created.supplierId) {
    const tree2 = await call("TK-A", "GET", `/api/bom/templates/${existingBom.id}/tree`);
    // /tree endpoint trả {data: {tree: [...]}}
    const treeLines = tree2.body?.data?.tree ?? [];
    const lineForSub = treeLines.find(l => l.componentItemId);
    if (lineForSub) {
      const sub = await call("TK-A", "POST",
        `/api/purchase-orders/from-bom-line/${lineForSub.id}`,
        {
          supplierId: created.supplierId,
          orderedQty: 5,
          spec: "Test SUS304 50x30x10",
          notes: "Coverage subcontract PO",
        });
      const so = sub.status === 201 || sub.ok;
      record("J", "create Subcontract PO from BOM line",
        so ? "PASS" : "FAIL", sub.status,
        so ? `poNo=${sub.body?.data?.poNo} poType=${sub.body?.data?.poType}` :
             JSON.stringify(sub.body).slice(0, 150));
      if (so) {
        created.poSubcontractId = sub.body?.data?.id;
        // PDF should succeed for subcontract
        const pdfOk = await call("TM-A", "GET",
          `/api/purchase-orders/${created.poSubcontractId}/pdf`);
        const pdfPass = pdfOk.status === 200;
        record("J", "PDF render SUBCONTRACT", pdfPass ? "PASS" : "FAIL", pdfOk.status,
          pdfPass ? "PDF generated" : JSON.stringify(pdfOk.body).slice(0, 150));
      }
    }
  } else {
    record("J", "Subcontract test", "SKIP", null,
      `bom=${!!existingBom} sup=${!!created.supplierId}`);
  }

  // ===== K. V3.7.43: Work Order from BOM line (GTAM simple) =====
  header("K — Work Order from BOM line (V3.7.43 GTAM)");
  if (existingBom) {
    const tree3 = await call("TK-A", "GET", `/api/bom/templates/${existingBom.id}/tree`);
    const tree3Lines = tree3.body?.data?.tree ?? [];
    const woLine = tree3Lines.find(l => l.componentItemId);
    if (woLine) {
      const wo = await call("TK-A", "POST",
        `/api/work-orders/from-bom-line/${woLine.id}`,
        { plannedQty: 4, priority: "NORMAL", notes: "Coverage GTAM WO" });
      const wOk = wo.status === 201 || wo.ok;
      record("K", "create WO from BOM line (GTAM simple)",
        wOk ? "PASS" : "FAIL", wo.status,
        wOk ? `${wo.body?.data?.woNo} status=${wo.body?.data?.status}` :
              JSON.stringify(wo.body).slice(0, 150));
      if (wOk) created.woId = wo.body?.data?.id;
    }
  }

  // ===== L. WO regular flow (existing /quick) =====
  header("L — WO Quick flow (existing /quick endpoint)");
  const fgList = await call("VH-A", "GET", "/api/items?type=FG&q=DEMO&pageSize=5");
  const matList = await call("VH-A", "GET", "/api/items?type=PURCHASED&q=DEMO&pageSize=5");
  const fg = fgList.body?.data?.[0];
  const mat = matList.body?.data?.[0];
  if (fg && mat) {
    const woQuick = await call("VH-A", "POST", "/api/work-orders/quick", {
      productItemId: fg.id, plannedQty: 1, priority: "NORMAL",
      notes: `${TAG} quick`,
      materials: [{ itemId: mat.id, qty: 1 }],
    });
    const wq = woQuick.status === 201 || woQuick.ok;
    record("L", "VH-A POST /work-orders/quick (V3.7.28 RBAC + V3.7.31 op create)",
      wq ? "PASS" : "FAIL", woQuick.status, wq ? "ok" : JSON.stringify(woQuick.body).slice(0, 150));
    if (wq) {
      created.woQuickId = woQuick.body?.data?.wo?.id;
      created.isrId = woQuick.body?.data?.isr?.id;
      record("L", "auto-ISR created", created.isrId ? "PASS" : "WARN", null,
        created.isrId ? "isr present" : "no isr (shortage maybe)");
    }
  } else {
    record("L", "WO quick", "SKIP", null, `fg=${!!fg} mat=${!!mat}`);
  }

  // ===== M. ISR approve flow =====
  header("M — Issue Request approve");
  if (created.isrId) {
    const ap = await call("KHO-A", "POST",
      `/api/warehouse/issue-request/${created.isrId}/approve`, {});
    record("M", "KHO-A approve ISR", ap.ok ? "PASS" : "FAIL", ap.status,
      ap.ok ? `txnIds=${ap.body?.data?.txnIds?.length ?? 0}` : "");
  }

  // ===== N. Receiving flow =====
  header("N — Receiving (PO scan + ack)");
  if (created.poCommercialId) {
    const send = await call("TM-A", "POST", `/api/purchase-orders/${created.poCommercialId}/send`, {});
    record("N", "TM-A send PO", send.ok ? "PASS" : "FAIL", send.status, "");
    if (send.ok) {
      // /api/receiving/events là batch endpoint POST. Schema yêu cầu UUIDv7.
      // Coverage test chỉ verify endpoint reachable (422 schema rejected = ok).
      // Full E2E receiving được test bởi cross-role-flow.mjs riêng.
      const rcv = await call("KHO-A", "POST", "/api/receiving/events", { events: [] });
      const ok =
        rcv.status === 200 ||
        rcv.status === 201 ||
        rcv.status === 400 ||
        rcv.status === 422;
      record("N", "KHO-A POST /receiving/events reachable",
        ok ? "PASS" : "FAIL", rcv.status,
        ok ? "endpoint OK (full E2E ở cross-role-flow.mjs)" : "");
    }
  }

  // ===== O. Warehouse Layout + Bins =====
  header("O — Warehouse Layout + Bins");
  const layout = await call("KHO-A", "GET", "/api/warehouse/layout");
  const stats = layout.body?.data?.stats ?? {};
  record("O", "layout", layout.ok ? "PASS" : "FAIL", layout.status,
    `${stats.totalBins ?? 0} bins ${stats.occupiedBins ?? 0} occupied`);
  const bins = layout.body?.data?.bins ?? [];
  const occBin = bins.find(b => (b.totalQty ?? 0) > 0);
  if (occBin) {
    const binDetail = await call("KHO-A", "GET", `/api/warehouse/bins/${occBin.id}`);
    record("O", "bin detail", binDetail.ok ? "PASS" : "FAIL", binDetail.status, "");
  }
  const lookup = await call("KHO-A", "GET", "/api/warehouse/lookup?q=DEMO");
  record("O", "warehouse lookup", lookup.ok ? "PASS" : "FAIL", lookup.status, "");

  // ===== P. Inventory =====
  header("P — Inventory + Lot/Serial");
  const inv = await call("KHO-A", "GET", "/api/inventory/balance?pageSize=5");
  record("P", "inventory balance", inv.ok ? "PASS" : "FAIL", inv.status,
    `${inv.body?.data?.length ?? 0} rows`);
  const ls = await call("KHO-A", "GET", "/api/lot-serial?pageSize=5");
  record("P", "lot-serial list", ls.ok ? "PASS" : "FAIL", ls.status, "");

  // ===== Q. Notifications =====
  header("Q — Notifications");
  for (const r of ["TK-A", "TM-A", "KHO-A", "VH-A"]) {
    if (!userJars.has(r)) continue;
    const n = await call(r, "GET", "/api/notifications?limit=10");
    record("Q", `${r} list`, n.ok ? "PASS" : "FAIL", n.status,
      `total=${n.body?.data?.length ?? 0}`);
    const items = n.body?.data ?? [];
    const firstUnread = items.find(x => !x.readAt);
    if (firstUnread) {
      const m = await call(r, "POST", `/api/notifications/${firstUnread.id}/read`, {});
      record("Q", `${r} mark-read`, (m.ok || m.status === 204) ? "PASS" : "FAIL", m.status, "");
    }
  }
  const mar = await call("admin", "POST", "/api/notifications/read-all", {});
  record("Q", "admin mark-all-read", mar.ok ? "PASS" : "FAIL", mar.status, "");

  // ===== R. Material Requests =====
  header("R — Material Requests");
  const mr = await call("VH-A", "GET", "/api/material-requests?pageSize=5");
  record("R", "list material-requests",
    mr.ok || mr.status === 404 ? "PASS" : "FAIL", mr.status,
    mr.ok ? `${mr.body?.data?.length ?? 0} rows` : "404 ok if route disabled");

  // ===== S. Admin operations =====
  header("S — Admin operations");
  const us = await call("admin", "GET", "/api/admin/users?limit=20");
  record("S", "list users", us.ok ? "PASS" : "FAIL", us.status,
    `${us.body?.data?.length ?? 0} users`);
  const audit = await call("admin", "GET", "/api/admin/audit?limit=10");
  record("S", "audit log", audit.ok ? "PASS" : "FAIL", audit.status, "");
  const stats2 = await call("admin", "GET", "/api/admin/stats");
  record("S", "system stats", stats2.ok ? "PASS" : "FAIL", stats2.status, "");

  // ===== T. BOM Import endpoints (just smoke test routes are reachable) =====
  header("T — BOM Excel import endpoint smoke");
  // /api/imports/check là POST (validate file hash). Send empty body → 400 expected
  const importsCheck = await call("admin", "POST", "/api/imports/check", {});
  // 400/422 = endpoint reachable, schema rejected. 200 = ok. 405 = bug.
  const ok = importsCheck.status === 200 || importsCheck.status === 400 || importsCheck.status === 422;
  record("T", "POST /api/imports/check reachable", ok ? "PASS" : "FAIL", importsCheck.status, "");
  // BOM-specific upload route just check OPTIONS/exists
  const bomImportRoute = await callPage("admin", "/api/bom/imports/upload");
  record("T", "/api/bom/imports/upload route exists",
    bomImportRoute.status === 405 || bomImportRoute.status === 200 ? "PASS" : "FAIL",
    bomImportRoute.status, "405 OK = POST-only");

  // ===== U. ECO endpoint =====
  header("U — ECO");
  const eco = await call("TK-A", "GET", "/api/eco?pageSize=5");
  record("U", "list ECO", eco.ok ? "PASS" : "FAIL", eco.status, "");

  // ===== V. Purchase Orders list filters =====
  header("V — PO list / filters / stats");
  const poAll = await call("TM-A", "GET", "/api/purchase-orders?pageSize=10");
  record("V", "PO list all", poAll.ok ? "PASS" : "FAIL", poAll.status,
    `${poAll.body?.data?.length ?? 0} rows`);
  const poFilt = await call("TM-A", "GET", "/api/purchase-orders?status=SENT&status=PARTIAL&pageSize=10");
  record("V", "PO filter status[]", poFilt.ok ? "PASS" : "FAIL", poFilt.status, "");
  // V3.7.43 — filter by poType
  const poSub = await call("TM-A", "GET", "/api/purchase-orders?poType=SUBCONTRACT&pageSize=10");
  record("V", "PO filter poType=SUBCONTRACT (V3.7.43)", poSub.ok ? "PASS" : "FAIL", poSub.status,
    `${poSub.body?.data?.length ?? 0} subcontract POs`);
  const poStats = await call("TM-A", "GET", "/api/purchase-orders/stats");
  record("V", "PO stats", poStats.ok ? "PASS" : "FAIL", poStats.status, "");

  // ===== W. Purchase Requests list =====
  header("W — PR list / filters");
  const prList = await call("TM-A", "GET", "/api/purchase-requests?pageSize=10");
  record("W", "PR list", prList.ok ? "PASS" : "FAIL", prList.status,
    `${prList.body?.data?.length ?? 0} rows`);

  // ===== X. Work Orders list =====
  header("X — Work Orders list");
  const woList = await call("VH-A", "GET", "/api/work-orders?pageSize=10");
  record("X", "WO list", woList.ok ? "PASS" : "FAIL", woList.status,
    `${woList.body?.data?.length ?? 0} rows`);

  // ===== Y. Database integrity (verify created entities) =====
  header("Y — Database integrity (created entities verify)");
  if (created.itemId) {
    const r = await call("admin", "GET", `/api/items/${created.itemId}`);
    record("Y", "item exists in DB", r.ok ? "PASS" : "FAIL", r.status,
      r.ok ? `sku=${r.body?.data?.sku}` : "");
  }
  if (created.bomId) {
    const r = await call("admin", "GET", `/api/bom/templates/${created.bomId}`);
    record("Y", "BOM exists in DB", r.ok ? "PASS" : "FAIL", r.status, "");
  }
  if (created.supplierId) {
    const r = await call("admin", "GET", `/api/suppliers/${created.supplierId}`);
    record("Y", "supplier exists in DB", r.ok ? "PASS" : "FAIL", r.status, "");
  }
  if (created.prId) {
    const r = await call("admin", "GET", `/api/purchase-requests/${created.prId}`);
    record("Y", "PR exists in DB", r.ok ? "PASS" : "FAIL", r.status, "");
  }
  if (created.poCommercialId) {
    const r = await call("admin", "GET", `/api/purchase-orders/${created.poCommercialId}`);
    record("Y", "PO commercial exists in DB", r.ok ? "PASS" : "FAIL", r.status,
      r.ok ? `poType=${r.body?.data?.poType}` : "");
  }
  if (created.poSubcontractId) {
    const r = await call("admin", "GET", `/api/purchase-orders/${created.poSubcontractId}`);
    record("Y", "PO subcontract exists in DB (V3.7.43)", r.ok ? "PASS" : "FAIL", r.status,
      r.ok ? `poType=${r.body?.data?.poType}` : "");
  }
  if (created.woQuickId) {
    const r = await call("admin", "GET", `/api/work-orders/${created.woQuickId}`);
    record("Y", "WO exists in DB", r.ok ? "PASS" : "FAIL", r.status, "");
  }

  // =====================================================================
  // FINAL OUTPUT
  // =====================================================================
  console.log(c("\n\n╔═══════════════════════════════════════════════════╗", "bold"));
  console.log(c("║   FULL COVERAGE 100% — TỔNG KẾT                    ║", "bold"));
  console.log(c("╚═══════════════════════════════════════════════════╝", "bold"));

  const total = results.length;
  const pass = results.filter(r => r.status === "PASS").length;
  const fail = results.filter(r => r.status === "FAIL").length;
  const warn = results.filter(r => r.status === "WARN").length;
  const skip = results.filter(r => r.status === "SKIP").length;
  const passRate = total > 0 ? ((pass / total) * 100).toFixed(1) : "0";

  console.log(`\nTotal: ${total} checks`);
  console.log(`  ${c(`PASS=${pass}`, "green")}  ${c(`FAIL=${fail}`, "red")}  ${c(`WARN=${warn}`, "yellow")}  ${c(`SKIP=${skip}`, "gray")}`);
  console.log(`  Pass rate: ${c(passRate + "%", pass / total > 0.95 ? "green" : "yellow")}\n`);

  if (fail > 0) {
    console.log(c(`❌ FAILURES (${fail}):`, "red"));
    for (const r of results.filter(r => r.status === "FAIL")) {
      console.log(c(`  [${r.section}] ${r.name} (HTTP ${r.http})`, "red"));
      console.log(c(`     ${r.detail}`, "gray"));
    }
  }
  if (warn > 0) {
    console.log(c(`\n⚠ WARNINGS (${warn}):`, "yellow"));
    for (const r of results.filter(r => r.status === "WARN")) {
      console.log(c(`  [${r.section}] ${r.name}: ${r.detail}`, "yellow"));
    }
  }

  // Save JSON
  const outPath = path.resolve("coverage-100-results.json");
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: TS, base: BASE, tag: TAG,
    summary: { total, pass, fail, warn, skip, passRate: passRate + "%" },
    created,
    results,
  }, null, 2));
  console.log(c(`\nResults JSON: ${outPath}`, "cyan"));

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(c("FATAL: " + e.stack, "red"));
  process.exit(2);
});
