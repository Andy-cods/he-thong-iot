#!/usr/bin/env node
// =====================================================================
// E2E Department Coverage Test — MES SongChau (V3.7.27)
// =====================================================================
// Bổ sung cross-role-flow.mjs — quét toàn diện 4 phòng ban:
//   - Hub page accessibility (HTTP 200, no redirect loop)
//   - Mỗi tab gọi đúng API + dữ liệu hiển thị
//   - RBAC negative tests (cross-role denied)
//   - Notification system (count, mark read, dismiss)
//   - V3.7.27 features (rename BOM, supplier auto-create)
// =====================================================================

const BASE = process.env.BASE || "https://mes.songchau.vn";
const PASSWORDS = ["Test@1234", "ChangeMe!234"];
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

const colors = {
  reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m",
  cyan: "\x1b[36m", gray: "\x1b[90m", bold: "\x1b[1m",
};
const c = (s, col) => `${colors[col] || ""}${s}${colors.reset}`;

const issues = [];
const passes = [];
const userJars = new Map();

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
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 500); }
  return { status: res.status, ok: res.ok, body: parsed, location: res.headers.get("location") };
}

async function callPage(role, path) {
  // GET HTML page — verify HTTP 200, capture redirect
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
      const wait = (r.body?.error?.details?.retryAfter ?? 60) + 2;
      console.log(c(`  · rate-limit ${username} → wait ${wait}s`, "yellow"));
      await new Promise(r => setTimeout(r, wait * 1000));
      r = await call(username, "POST", "/api/auth/login", { username, password });
    }
    if (r.ok) return { ok: true, password };
    if (r.status !== 401) return { ok: false, status: r.status, body: r.body };
  }
  return { ok: false, status: 401 };
}

const fail = (cat, name, detail) => issues.push({ kind: "FAIL", cat, name, detail });
const warn = (cat, name, detail) => issues.push({ kind: "WARN", cat, name, detail });
const pass = (cat, name, detail) => passes.push({ cat, name, detail });

function summary(label, ok, msg) {
  const tag = ok ? c("✓", "green") : c("✗", "red");
  console.log(`  ${tag} ${label} — ${msg}`);
}

// =====================================================================
// MAIN
// =====================================================================
async function main() {
  console.log(c(`\n=== E2E Department Coverage Test ===`, "bold"));
  console.log(c(`Base: ${BASE} | Run: ${TS}\n`, "cyan"));

  const ROLES = ["TK-A", "TM-A", "KHO-A", "VH-A"];
  for (const r of ROLES) {
    const lr = await login(r);
    if (!lr.ok) {
      fail("LOGIN", r, `status=${lr.status}`);
      console.log(c(`  · login ${r} FAIL`, "red"));
    } else {
      console.log(c(`  · login ${r} OK`, "gray"));
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // ===== A. HUB PAGE ACCESS =====
  console.log(c(`\n[A] Hub page accessibility (HTTP 200 no redirect)`, "bold"));
  // V3 redesign: /bom redirects to /engineering?tab=bom; /assembly to /operations?tab=assembly
  // 200 hoặc 307 đều OK (redirect intentional).
  const HUBS = {
    "TK-A": ["/", "/engineering", "/bom"],
    "TM-A": ["/", "/sales"],
    "KHO-A": ["/", "/warehouse"],
    "VH-A": ["/", "/operations", "/assembly"],
  };
  for (const [role, paths] of Object.entries(HUBS)) {
    if (!userJars.has(role)) continue;
    for (const path of paths) {
      const r = await callPage(role, path);
      const ok = r.status === 200 || r.status === 307;
      summary(`${role} GET ${path}`, ok, `HTTP ${r.status}${r.location ? ` → ${r.location}` : ""}`);
      if (ok) pass("A.HUB", `${role} ${path}`, `HTTP ${r.status}`);
      else fail("A.HUB", `${role} ${path}`, `HTTP ${r.status} location=${r.location}`);
    }
  }

  // ===== B. RBAC NEGATIVE TESTS =====
  console.log(c(`\n[B] RBAC negative — cross-role denied actions`, "bold"));
  // KHO-A không được tạo PR
  const kPR = await call("KHO-A", "POST", "/api/purchase-requests", {
    title: "RBAC test", source: "MANUAL",
    lines: [{ itemId: "00000000-0000-0000-0000-000000000001", qty: 1 }],
  });
  const kOK = kPR.status === 403 || kPR.status === 401;
  summary("KHO-A POST /purchase-requests", kOK, `HTTP ${kPR.status} (expect 403)`);
  kOK ? pass("B.RBAC", "KHO-A blocked from PR create", `HTTP ${kPR.status}`)
      : fail("B.RBAC", "KHO-A blocked from PR create", `HTTP ${kPR.status} — RBAC bug! warehouse được tạo PR.`);

  // VH-A không được tạo BOM
  const vBom = await call("VH-A", "POST", "/api/bom/templates", {
    code: "RBAC-TEST", name: "rbac", targetQty: 1,
  });
  const vOK = vBom.status === 403 || vBom.status === 401;
  summary("VH-A POST /bom/templates", vOK, `HTTP ${vBom.status} (expect 403)`);
  vOK ? pass("B.RBAC", "VH-A blocked from BOM create", `HTTP ${vBom.status}`)
      : fail("B.RBAC", "VH-A blocked from BOM create", `HTTP ${vBom.status} — RBAC bug.`);

  // TM-A không được tạo Work Order
  const tmWO = await call("TM-A", "POST", "/api/work-orders/quick", {
    productItemId: "00000000-0000-0000-0000-000000000001",
    productQty: 1,
  });
  const tmOK = tmWO.status === 403 || tmWO.status === 401 || tmWO.status === 400;
  summary("TM-A POST /work-orders/quick", tmOK, `HTTP ${tmWO.status} (expect 403/401)`);
  tmOK ? pass("B.RBAC", "TM-A blocked from WO create", `HTTP ${tmWO.status}`)
       : fail("B.RBAC", "TM-A blocked from WO create", `HTTP ${tmWO.status}`);

  // KHO-A không được duyệt PR
  const kApprove = await call("KHO-A", "POST",
    "/api/purchase-requests/00000000-0000-0000-0000-000000000001/approve", {});
  const kAOK = kApprove.status === 403 || kApprove.status === 404;
  summary("KHO-A approve PR", kAOK, `HTTP ${kApprove.status}`);
  kAOK ? pass("B.RBAC", "KHO-A blocked from PR approve", `HTTP ${kApprove.status}`)
       : fail("B.RBAC", "KHO-A blocked from PR approve", `HTTP ${kApprove.status}`);

  // ===== C. WAREHOUSE TABS COVERAGE (KHO-A) =====
  console.log(c(`\n[C] Warehouse tabs coverage (KHO-A)`, "bold"));
  if (userJars.has("KHO-A")) {
    const checks = [
      ["Layout tab", "/api/warehouse/layout"],
      ["Items tab", "/api/items?pageSize=10"],
      ["Receiving tab — PO list", "/api/purchase-orders?status=SENT&status=PARTIAL&pageSize=10"],
      ["Issue tab — ISR list", "/api/warehouse/issue-request?status=PENDING&pageSize=10"],
      ["Lot/Serial inquiry", "/api/inventory/balance?pageSize=10"],
      ["Notifications", "/api/notifications?limit=20"],
    ];
    for (const [name, path] of checks) {
      const r = await call("KHO-A", "GET", path);
      summary(name, r.ok, `HTTP ${r.status}`);
      r.ok ? pass("C.KHO", name, `HTTP 200`)
           : fail("C.KHO", name, `HTTP ${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);
    }

    // Layout health check
    const layout = await call("KHO-A", "GET", "/api/warehouse/layout");
    const stats = layout.body?.data?.stats ?? {};
    const occupied = stats.occupiedBins ?? 0;
    const totalQty = stats.totalQty ?? 0;
    summary(`Layout: ${stats.totalBins ?? 0} bins, ${occupied} occupied, totalQty=${totalQty}`,
      occupied > 0, `${occupied} bins có hàng`);
    if (occupied === 0) warn("C.KHO", "No occupied bins", "Layout không có bin nào có hàng — chưa có inventory hay receiving fail?");
    else pass("C.KHO", "Layout health", `${occupied}/${stats.totalBins} bins, qty=${totalQty}`);
  }

  // ===== D. SALES/PROCUREMENT TABS (TM-A) =====
  console.log(c(`\n[D] Sales/Procurement tabs (TM-A)`, "bold"));
  if (userJars.has("TM-A")) {
    const checks = [
      ["Suppliers list", "/api/suppliers?pageSize=20"],
      ["PO list (all)", "/api/purchase-orders?pageSize=20"],
      ["PR list", "/api/purchase-requests?pageSize=20"],
      ["Items read", "/api/items?pageSize=10"],
      ["BOM read", "/api/bom/templates?limit=10"],
    ];
    for (const [name, path] of checks) {
      const r = await call("TM-A", "GET", path);
      summary(name, r.ok, `HTTP ${r.status}`);
      r.ok ? pass("D.TM", name, `HTTP 200`)
           : fail("D.TM", name, `HTTP ${r.status}`);
    }

    // Test create supplier (TM-A có quyền)
    const supRes = await call("TM-A", "POST", "/api/suppliers", {
      code: `E2E-SUP-${TS.slice(-6)}`,
      name: `E2E Supplier ${TS}`,
      contactName: "Test contact",
    });
    const supOK = supRes.status === 201 || supRes.status === 200;
    summary("Create supplier (TM-A)", supOK, `HTTP ${supRes.status}`);
    supOK ? pass("D.TM", "Create supplier", `HTTP ${supRes.status}`)
          : fail("D.TM", "Create supplier", `HTTP ${supRes.status} ${JSON.stringify(supRes.body).slice(0,200)}`);
  }

  // ===== E. ENGINEERING TABS (TK-A) =====
  console.log(c(`\n[E] Engineering tabs (TK-A)`, "bold"));
  if (userJars.has("TK-A")) {
    const checks = [
      ["BOM list", "/api/bom/templates?limit=20"],
      ["Work Orders list", "/api/work-orders?pageSize=20"],
      ["PR list", "/api/purchase-requests?pageSize=20"],
      ["Items list", "/api/items?pageSize=20"],
    ];
    for (const [name, path] of checks) {
      const r = await call("TK-A", "GET", path);
      summary(name, r.ok, `HTTP ${r.status}`);
      r.ok ? pass("E.TK", name, `HTTP 200`)
           : fail("E.TK", name, `HTTP ${r.status}`);
    }

    // V3.7.27 — Test rename BOM
    const tplList = await call("TK-A", "GET", "/api/bom/templates?limit=5&hasComponents=true");
    const target = (tplList.body?.data ?? []).find(t => t.status === "DRAFT");
    if (target) {
      const oldName = target.name;
      const newName = `${oldName} [E2E rename ${TS.slice(-6)}]`;
      const rename = await call("TK-A", "PATCH", `/api/bom/templates/${target.id}`, {
        name: newName,
      });
      summary(`Rename BOM ${target.code}`, rename.ok, `HTTP ${rename.status}`);
      if (rename.ok) {
        pass("E.TK", "Rename BOM (V3.7.27)", `HTTP 200`);
        // Restore original name
        await call("TK-A", "PATCH", `/api/bom/templates/${target.id}`, { name: oldName });
      } else {
        fail("E.TK", "Rename BOM", `HTTP ${rename.status} ${JSON.stringify(rename.body).slice(0, 200)}`);
      }
    } else {
      warn("E.TK", "Rename BOM", "Không tìm được BOM DRAFT để test");
    }

    // V3.7.27 — Test BOM sheets (auto MATERIAL sheet)
    const tplWithSheets = await call("TK-A", "GET", "/api/bom/templates?limit=20&hasComponents=true&includeObsolete=false");
    const draft = (tplWithSheets.body?.data ?? []).find(t => t.status === "DRAFT" && t.componentCount > 0);
    if (draft) {
      const sheets = await call("TK-A", "GET", `/api/bom/templates/${draft.id}/sheets`);
      const list = sheets.body?.data ?? [];
      const hasMaterial = list.some(s => s.kind === "MATERIAL");
      const hasProject = list.some(s => s.kind === "PROJECT");
      summary(`BOM ${draft.code} sheets`, hasMaterial && hasProject,
        `${list.length} sheets — PROJECT=${hasProject} MATERIAL=${hasMaterial}`);
      hasMaterial && hasProject
        ? pass("E.TK", "Auto MATERIAL sheet (V3.7.27)", `${list.length} sheets`)
        : fail("E.TK", "Auto MATERIAL sheet", `Thiếu sheet — PROJECT=${hasProject} MATERIAL=${hasMaterial}`);
    }
  }

  // ===== F. OPERATIONS TABS (VH-A) =====
  console.log(c(`\n[F] Operations tabs (VH-A)`, "bold"));
  if (userJars.has("VH-A")) {
    const checks = [
      ["Work Orders list", "/api/work-orders?pageSize=20"],
      ["BOM read", "/api/bom/templates?limit=10"],
      ["Items read", "/api/items?pageSize=10"],
      ["Notifications", "/api/notifications?limit=20"],
      ["Material requests", "/api/material-requests?pageSize=10"],
    ];
    for (const [name, path] of checks) {
      const r = await call("VH-A", "GET", path);
      summary(name, r.ok || r.status === 404, `HTTP ${r.status}`);
      if (r.ok) pass("F.VH", name, `HTTP 200`);
      else if (r.status === 404) warn("F.VH", name, `Endpoint 404 — chưa implement?`);
      else fail("F.VH", name, `HTTP ${r.status}`);
    }
  }

  // ===== G. NOTIFICATION SYSTEM =====
  console.log(c(`\n[G] Notification system`, "bold"));
  for (const role of ROLES) {
    if (!userJars.has(role)) continue;
    const r = await call(role, "GET", "/api/notifications?limit=20");
    if (!r.ok) {
      fail("G.NOTIF", `${role} list`, `HTTP ${r.status}`);
      continue;
    }
    const items = r.body?.data ?? [];
    const unread = items.filter(n => !n.readAt).length;
    summary(`${role} notifications`, true, `total=${items.length} unread=${unread}`);
    pass("G.NOTIF", `${role} list`, `total=${items.length} unread=${unread}`);

    // Mark first as read (if any unread)
    const firstUnread = items.find(n => !n.readAt);
    if (firstUnread) {
      const mark = await call(role, "POST", `/api/notifications/${firstUnread.id}/read`, {});
      const ok = mark.ok || mark.status === 204;
      summary(`${role} mark-read ${firstUnread.id.slice(0,8)}…`, ok, `HTTP ${mark.status}`);
      ok ? pass("G.NOTIF", `${role} mark-read`, `HTTP ${mark.status}`)
         : fail("G.NOTIF", `${role} mark-read`, `HTTP ${mark.status}`);
    }
  }

  // ===== H. DASHBOARD (mọi role) =====
  console.log(c(`\n[H] Dashboard endpoints (mọi role)`, "bold"));
  for (const role of ROLES) {
    if (!userJars.has(role)) continue;
    const r = await call(role, "GET", "/api/dashboard/overview-v2");
    summary(`${role} dashboard`, r.ok, `HTTP ${r.status}`);
    r.ok ? pass("H.DASH", `${role} overview`, `HTTP 200`)
         : fail("H.DASH", `${role} overview`, `HTTP ${r.status}`);
  }

  // =====================================================================
  // FINAL REPORT
  // =====================================================================
  console.log(c(`\n=== TỔNG KẾT ===`, "bold"));
  const fails = issues.filter(i => i.kind === "FAIL");
  const warns = issues.filter(i => i.kind === "WARN");
  console.log(`Pass: ${c(passes.length, "green")} | Fail: ${c(fails.length, "red")} | Warn: ${c(warns.length, "yellow")}`);

  if (fails.length > 0) {
    console.log(c(`\n❌ FAILURES (${fails.length}):`, "red"));
    for (const f of fails) {
      console.log(c(`  [${f.cat}] ${f.name}`, "red"));
      console.log(c(`     ${f.detail}`, "gray"));
    }
  }
  if (warns.length > 0) {
    console.log(c(`\n⚠ WARNINGS (${warns.length}):`, "yellow"));
    for (const w of warns) {
      console.log(c(`  [${w.cat}] ${w.name}`, "yellow"));
      console.log(c(`     ${w.detail}`, "gray"));
    }
  }
  if (fails.length === 0 && warns.length === 0) {
    console.log(c("\n✅ All tests passed", "green"));
  }
  console.log("");
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(c("FATAL: " + e.stack, "red"));
  process.exit(2);
});
