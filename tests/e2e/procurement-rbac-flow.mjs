#!/usr/bin/env node

/**
 * Focused E2E: PR staged approval, PO approval/send state machine,
 * Sales Order persistence and Supplier CRUD/RBAC.
 *
 * Required:
 *   E2E_PASSWORD
 * Optional:
 *   BASE=http://127.0.0.1:3001
 *   E2E_ADMIN_PASSWORD (falls back to E2E_PASSWORD)
 *   E2E_*_USER overrides
 *   E2E_ALLOW_PRODUCTION=1 for a non-local BASE
 */

const BASE = process.env.BASE ?? "http://127.0.0.1:3001";
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) throw new Error("E2E_PASSWORD is required");

const target = new URL(BASE);
const isLocal = ["127.0.0.1", "localhost"].includes(target.hostname);
if (!isLocal && process.env.E2E_ALLOW_PRODUCTION !== "1") {
  throw new Error("Refusing non-local E2E without E2E_ALLOW_PRODUCTION=1");
}

const USERS = {
  admin: process.env.E2E_ADMIN_USER ?? "admin",
  planner: process.env.E2E_PLANNER_USER ?? "bo.phan.thiet.ke",
  purchaser: process.env.E2E_PURCHASER_USER ?? "bo.phan.thu.mua",
  warehouse: process.env.E2E_WAREHOUSE_USER ?? "bo.phan.kho",
};
const PASSWORDS = {
  ...Object.fromEntries(Object.keys(USERS).map((role) => [role, PASSWORD])),
  admin: process.env.E2E_ADMIN_PASSWORD ?? PASSWORD,
};

const jars = new Map();
const stamp = Date.now().toString(36).toUpperCase();
let passed = 0;

function recordCookies(role, response) {
  const headers =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  if (!headers.length) return;
  const current = new Map(
    (jars.get(role) ?? "")
      .split("; ")
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), part.slice(index + 1)];
      }),
  );
  for (const header of headers) {
    const pair = header.split(";")[0];
    const index = pair.indexOf("=");
    current.set(pair.slice(0, index), pair.slice(index + 1));
  }
  jars.set(
    role,
    [...current.entries()].map(([key, value]) => `${key}=${value}`).join("; "),
  );
}

async function call(role, method, path, body) {
  const headers = { "content-type": "application/json" };
  const cookie = jars.get(role);
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  recordCookies(role, response);
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, ok: response.ok, body: parsed };
}

function check(condition, label, detail = "") {
  if (!condition) {
    throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  }
  passed += 1;
  console.log(`PASS ${String(passed).padStart(2, "0")} — ${label}`);
}

function expectStatus(result, status, label) {
  check(
    result.status === status,
    label,
    `expected HTTP ${status}, got ${result.status} ${JSON.stringify(result.body).slice(0, 240)}`,
  );
}

async function login(role) {
  const result = await call(role, "POST", "/api/auth/login", {
    username: USERS[role],
    password: PASSWORDS[role],
  });
  expectStatus(result, 200, `login ${role}`);
}

async function main() {
  console.log(`Focused procurement/RBAC E2E → ${BASE}`);
  for (const role of Object.keys(USERS)) await login(role);

  const items = await call("planner", "GET", "/api/items?pageSize=100");
  expectStatus(items, 200, "list items");
  const item = items.body?.data?.find((row) => row.isActive !== false);
  check(Boolean(item?.id), "active item fixture exists");

  const suppliers = await call(
    "purchaser",
    "GET",
    "/api/suppliers?isActive=true&pageSize=100",
  );
  expectStatus(suppliers, 200, "list active suppliers");
  const supplier = suppliers.body?.data?.find((row) => row.isActive !== false);
  check(Boolean(supplier?.id), "active supplier fixture exists");

  // Supplier: RBAC + inactive list semantics + unique-race handling.
  const supplierCode = `E2E-${stamp}`;
  const warehouseSupplier = await call(
    "warehouse",
    "POST",
    "/api/suppliers",
    { code: supplierCode, name: `Blocked ${stamp}` },
  );
  expectStatus(warehouseSupplier, 403, "warehouse cannot create supplier");

  const createdSupplier = await call(
    "purchaser",
    "POST",
    "/api/suppliers",
    { code: supplierCode, name: `E2E Supplier ${stamp}` },
  );
  expectStatus(createdSupplier, 201, "purchaser creates supplier");
  const supplierId = createdSupplier.body?.data?.id;
  check(Boolean(supplierId), "created supplier has id");

  const deactivate = await call(
    "purchaser",
    "PATCH",
    `/api/suppliers/${supplierId}`,
    { isActive: false },
  );
  expectStatus(deactivate, 200, "purchaser deactivates supplier");

  const allSupplierFilter = await call(
    "purchaser",
    "GET",
    `/api/suppliers?q=${encodeURIComponent(supplierCode)}&pageSize=20`,
  );
  expectStatus(allSupplierFilter, 200, "supplier all-status filter");
  check(
    allSupplierFilter.body?.data?.some(
      (row) => row.id === supplierId && row.isActive === false,
    ),
    "unfiltered supplier list includes inactive data",
  );

  const duplicateCode = `E2E-DUP-${stamp}`;
  const duplicates = await Promise.all([
    call("purchaser", "POST", "/api/suppliers", {
      code: duplicateCode,
      name: `Duplicate A ${stamp}`,
    }),
    call("purchaser", "POST", "/api/suppliers", {
      code: duplicateCode,
      name: `Duplicate B ${stamp}`,
    }),
  ]);
  check(
    duplicates.map((result) => result.status).sort().join(",") === "201,409",
    "concurrent duplicate supplier returns one 201 and one 409",
    duplicates.map((result) => result.status).join(","),
  );

  // Sales Order: RBAC, priority persistence and close state guard.
  const blockedOrder = await call("warehouse", "POST", "/api/orders", {
    customerName: `Blocked ${stamp}`,
    productItemId: item.id,
    orderQty: 1,
    priority: "NORMAL",
  });
  expectStatus(blockedOrder, 403, "warehouse cannot create Sales Order");

  const orderCreate = await call("planner", "POST", "/api/orders", {
    customerName: `E2E Customer ${stamp}`,
    productItemId: item.id,
    orderQty: 3,
    priority: "URGENT",
    notes: `[E2E] ${stamp}`,
  });
  expectStatus(orderCreate, 201, "planner creates Sales Order");
  const order = orderCreate.body?.data;
  check(order?.priority === "URGENT", "Sales Order create persists priority");

  const orderDetail = await call(
    "planner",
    "GET",
    `/api/orders/${encodeURIComponent(order.orderNo)}`,
  );
  expectStatus(orderDetail, 200, "read Sales Order detail");
  check(orderDetail.body?.data?.priority === "URGENT", "Sales Order detail returns priority");

  const closeDraft = await call(
    "planner",
    "POST",
    `/api/orders/${encodeURIComponent(order.orderNo)}/close`,
    { closeReason: "E2E invalid early close" },
  );
  expectStatus(closeDraft, 409, "cannot close a DRAFT Sales Order");

  // PR: two approval stages must be separated by role.
  const prCreate = await call("planner", "POST", "/api/purchase-requests", {
    title: `[E2E] RBAC PR ${stamp}`,
    source: "MANUAL",
    lines: [{ itemId: item.id, qty: 2 }],
  });
  expectStatus(prCreate, 201, "planner creates and submits PR");
  const pr = prCreate.body?.data;
  check(pr?.approvalStep === "SUBMITTED", "new PR enters SUBMITTED approval step");

  const wrongDept = await call(
    "purchaser",
    "POST",
    `/api/purchase-requests/${pr.id}/dept-approve`,
    { note: "wrong role" },
  );
  expectStatus(wrongDept, 403, "purchaser cannot department-approve PR");

  const deptApprove = await call(
    "planner",
    "POST",
    `/api/purchase-requests/${pr.id}/dept-approve`,
    { note: "E2E department approval" },
  );
  expectStatus(deptApprove, 200, "planner department-approves PR");
  check(
    deptApprove.body?.data?.approvalStep === "DEPT_APPROVED",
    "PR enters DEPT_APPROVED",
  );

  const wrongDirector = await call(
    "planner",
    "POST",
    `/api/purchase-requests/${pr.id}/director-approve`,
    { note: "wrong role" },
  );
  expectStatus(wrongDirector, 403, "planner cannot final-approve PR");

  const directorApprove = await call(
    "purchaser",
    "POST",
    `/api/purchase-requests/${pr.id}/director-approve`,
    { note: "E2E final approval" },
  );
  expectStatus(directorApprove, 200, "purchaser final-approves PR");
  check(
    directorApprove.body?.data?.status === "APPROVED",
    "PR final state is APPROVED",
  );

  // PO: generic status bypass denied, approval mandatory and admin-only.
  const draftPo = await call("purchaser", "POST", "/api/purchase-orders", {
    supplierId: supplier.id,
    autoApprove: false,
    submitForApproval: false,
    notes: `[E2E draft] ${stamp}`,
    lines: [{ itemId: item.id, orderedQty: 1, unitPrice: 1000, taxRate: 8 }],
  });
  expectStatus(draftPo, 201, "purchaser creates draft PO");

  const statusBypass = await call(
    "purchaser",
    "PATCH",
    `/api/purchase-orders/${draftPo.body.data.id}`,
    { status: "SENT" },
  );
  expectStatus(statusBypass, 422, "generic PO PATCH rejects status bypass");

  const poCreate = await call("purchaser", "POST", "/api/purchase-orders", {
    supplierId: supplier.id,
    autoApprove: false,
    submitForApproval: true,
    notes: `[E2E pending] ${stamp}`,
    lines: [{ itemId: item.id, orderedQty: 2, unitPrice: 1250, taxRate: 8 }],
  });
  expectStatus(poCreate, 201, "purchaser atomically creates pending PO");
  const po = poCreate.body?.data;
  check(po?.status === "DRAFT", "pending PO remains DRAFT");
  check(po?.metadata?.approvalStatus === "pending", "PO enters pending approval");

  const warehouseSend = await call(
    "warehouse",
    "POST",
    `/api/purchase-orders/${po.id}/send`,
  );
  expectStatus(warehouseSend, 403, "warehouse cannot mark PO as sent");

  const sendBeforeApprove = await call(
    "purchaser",
    "POST",
    `/api/purchase-orders/${po.id}/send`,
  );
  expectStatus(sendBeforeApprove, 409, "cannot send PO before approval");

  const purchaserApprove = await call(
    "purchaser",
    "POST",
    `/api/purchase-orders/${po.id}/approve`,
    { notes: "must be blocked" },
  );
  expectStatus(purchaserApprove, 403, "purchaser cannot approve PO");

  const adminApprove = await call(
    "admin",
    "POST",
    `/api/purchase-orders/${po.id}/approve`,
    { notes: "E2E approved" },
  );
  expectStatus(adminApprove, 200, "admin approves pending PO");
  check(
    adminApprove.body?.data?.metadata?.approvalStatus === "approved",
    "PO enters approved state",
  );

  const editApproved = await call(
    "purchaser",
    "PATCH",
    `/api/purchase-orders/${po.id}`,
    { notes: "must not edit after approval" },
  );
  expectStatus(editApproved, 409, "approved PO cannot be edited");

  const sendApproved = await call(
    "purchaser",
    "POST",
    `/api/purchase-orders/${po.id}/send`,
  );
  expectStatus(sendApproved, 200, "purchaser marks approved PO as sent");
  check(sendApproved.body?.data?.status === "SENT", "PO final status is SENT");

  const rejectedPoCreate = await call(
    "purchaser",
    "POST",
    "/api/purchase-orders",
    {
      supplierId: supplier.id,
      autoApprove: false,
      submitForApproval: true,
      notes: `[E2E rejection cycle] ${stamp}`,
      lines: [{ itemId: item.id, orderedQty: 1, unitPrice: 900, taxRate: 8 }],
    },
  );
  expectStatus(rejectedPoCreate, 201, "create second pending PO for rejection cycle");
  const rejectedPoId = rejectedPoCreate.body?.data?.id;

  const rejectPo = await call(
    "admin",
    "POST",
    `/api/purchase-orders/${rejectedPoId}/reject`,
    { reason: "E2E needs correction" },
  );
  expectStatus(rejectPo, 200, "admin rejects pending PO");
  check(
    rejectPo.body?.data?.metadata?.approvalStatus === "rejected",
    "PO enters rejected state",
  );

  const editRejected = await call(
    "purchaser",
    "PATCH",
    `/api/purchase-orders/${rejectedPoId}`,
    { notes: `[E2E corrected] ${stamp}` },
  );
  expectStatus(editRejected, 200, "rejected PO is editable");

  const resubmitPo = await call(
    "purchaser",
    "POST",
    `/api/purchase-orders/${rejectedPoId}/submit-approval`,
  );
  expectStatus(resubmitPo, 200, "purchaser resubmits rejected PO");
  check(
    resubmitPo.body?.data?.metadata?.approvalStatus === "pending" &&
      !resubmitPo.body?.data?.metadata?.rejectedReason,
    "resubmit clears rejection metadata and returns to pending",
  );

  const approveResubmitted = await call(
    "admin",
    "POST",
    `/api/purchase-orders/${rejectedPoId}/approve`,
    { notes: "E2E corrected approval" },
  );
  expectStatus(approveResubmitted, 200, "admin approves resubmitted PO");

  console.log(`\nRESULT: ${passed}/${passed} assertions passed`);
}

main().catch((error) => {
  console.error("\nE2E FAILED:", error.message);
  process.exitCode = 1;
});
