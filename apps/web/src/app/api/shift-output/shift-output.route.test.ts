/**
 * V4.10 (TASK-20261118-001) — route test Sản lượng ca với FakeDb in-memory ở
 * tầng repo (giữ nguyên route + luồng createEntryFlow + policy + scope THẬT).
 * Ràng buộc DB thật (unique client_uuid / slot, FK ghép site, CHECK) kiểm bằng
 * packages/db/migrations/0087b_shift_output_smoke.sql trên Postgres thật.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SITE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const SITE_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const CA1 = "11111111-0000-4000-8000-000000000001";
const CA2 = "11111111-0000-4000-8000-000000000002";
const M1 = "22222222-0000-4000-8000-000000000001";
const M_B = "22222222-0000-4000-8000-0000000000b1";
const P1 = "33333333-0000-4000-8000-000000000001";
const P2 = "33333333-0000-4000-8000-000000000002";
const D1 = "44444444-0000-4000-8000-000000000001";
const U = (n: number) => `99999999-0000-4000-8000-${String(n).padStart(12, "0")}`;

interface FakeEntry {
  id: string;
  siteId: string;
  clientUuid: string;
  prodDate: string;
  shiftId: string;
  machineId: string;
  partId: string;
  qtyOk: number;
  qtyNg: number;
  version: number;
  status: string;
  deletedAt: Date | null;
  [k: string]: unknown;
}

const SHIFTS: Record<string, { siteId: string; startTime: string; endTime: string; crossesMidnight: boolean }> = {
  [CA1]: { siteId: SITE_A, startTime: "08:00:00", endTime: "12:00:00", crossesMidnight: false },
  [CA2]: { siteId: SITE_A, startTime: "13:00:00", endTime: "17:00:00", crossesMidnight: false },
};
const MACHINES: Record<string, string> = { [M1]: SITE_A, [M_B]: SITE_B };
const PARTS: Record<string, string> = { [P1]: SITE_A, [P2]: SITE_A };
const SITES: Record<string, { id: string; code: string; name: string; timezone: string; lockAfterHours: number; backdateDays: number; ngWarnPct: number; isActive: boolean }> = {
  [SITE_A]: { id: SITE_A, code: "DONGAN", name: "Đông Anh", timezone: "Asia/Ho_Chi_Minh", lockAfterHours: 24, backdateDays: 2, ngWarnPct: 10, isActive: true },
  [SITE_B]: { id: SITE_B, code: "KHAC", name: "Xưởng khác", timezone: "Asia/Ho_Chi_Minh", lockAfterHours: 24, backdateDays: 2, ngWarnPct: 10, isActive: true },
};

async function setup(opts: { roles?: string[]; userSite?: string | null } = {}) {
  vi.resetModules();
  const { can } = await import("@iot/shared");
  const roles = (opts.roles ?? ["workshop"]) as never;
  const userSite = opts.userSite === undefined ? SITE_A : opts.userSite;
  const entries: FakeEntry[] = [];
  const audit = vi.fn(async () => undefined);
  let n = 0;

  const view = (e: FakeEntry) => {
    const sh = SHIFTS[e.shiftId]!;
    return {
      ...e,
      shiftCode: "CA",
      shiftName: "Ca",
      shiftStart: sh.startTime,
      shiftEnd: sh.endTime,
      crossesMidnight: false,
      machineCode: "CNC-01",
      machineName: "Máy 1",
      partCode: "P",
      partName: "Part",
      operatorId: null,
      operatorName: null,
      qtyPlanned: null,
      qtyRework: null,
      downtimeMin: e.downtimeMin ?? null,
      shiftMinutes: 240,
      materialLot: null,
      notes: null,
      lockedAt: null,
      createdAt: new Date(),
      createdByName: null,
      updatedAt: new Date(),
      deleteReason: null,
      defects: [],
      downtimes: [],
    };
  };
  const activeSlot = (siteId: string, s: { prodDate: string; shiftId: string; machineId: string; partId: string }, exclude?: string) =>
    entries.find(
      (e) =>
        !e.deletedAt &&
        e.id !== exclude &&
        e.siteId === siteId &&
        e.prodDate === s.prodDate &&
        e.shiftId === s.shiftId &&
        e.machineId === s.machineId &&
        e.partId === s.partId,
    )?.id ?? null;

  vi.doMock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
  vi.doMock("@/lib/db", () => ({ db: {} }));
  vi.doMock("@/server/services/audit", () => ({ writeAudit: audit, diffObjects: (a: unknown, b: unknown) => ({ before: a, after: b }) }));
  vi.doMock("@/server/repos/userPermissionOverrides", () => ({ findActiveOverride: vi.fn(async () => null) }));
  vi.doMock("@/server/session", () => ({
    requireCan: vi.fn(async (_req: unknown, action: string, entity: string) => {
      if (!can(roles, action as never, entity as never)) {
        const { NextResponse } = await import("next/server");
        return { response: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
      }
      return { session: { userId: "u-1", username: "xuong.dongan", fullName: "Xưởng", roles, sessionId: null } };
    }),
  }));
  vi.doMock("@/server/repos/shiftOutputSetup", () => ({
    getUserSiteId: vi.fn(async () => userSite),
    getSiteById: vi.fn(async (id: string) => SITES[id] ?? null),
    getDefaultSite: vi.fn(async () => SITES[SITE_A]),
    listSites: vi.fn(async () => Object.values(SITES)),
    checkEntryRefs: vi.fn(async (siteId: string, r: { shiftId: string; machineId: string; partId: string; defectReasonIds: string[] }) => {
      const invalid: string[] = [];
      if (SHIFTS[r.shiftId]?.siteId !== siteId) invalid.push("shiftId");
      if (MACHINES[r.machineId] !== siteId) invalid.push("machineId");
      if (PARTS[r.partId] !== siteId) invalid.push("partId");
      if (r.defectReasonIds.some((d) => d !== D1)) invalid.push("defects");
      return { invalid, shift: SHIFTS[r.shiftId] ?? null };
    }),
    getSetupById: vi.fn(async () => ({ id: CA1 })),
  }));
  vi.doMock("@/server/repos/shiftOutputEntries", () => ({
    loadRecentContext: vi.fn(async () => ({ recentPartIds: [], lastPartByMachine: {}, avgOk30: {} })),
    getEntry: vi.fn(async (id: string) => {
      const e = entries.find((x) => x.id === id);
      return e ? view(e) : null;
    }),
    findActiveSlot: vi.fn(async (siteId: string, s: never, ex?: string) => activeSlot(siteId, s, ex)),
    insertEntry: vi.fn(async (siteId: string, clientUuid: string, w: Record<string, unknown>) => {
      const prev = entries.find((e) => e.clientUuid === clientUuid);
      if (prev) return { kind: "replayed", id: prev.id, siteId: prev.siteId };
      const dup = activeSlot(siteId, w as never);
      if (dup) return { kind: "duplicate", existingId: dup };
      const id = U(++n);
      entries.push({ ...(w as object), id, siteId, clientUuid, version: 1, status: "SUBMITTED", deletedAt: null } as FakeEntry);
      return { kind: "created", id };
    }),
    updateEntry: vi.fn(async (id: string, version: number, w: Record<string, unknown>) => {
      const e = entries.find((x) => x.id === id);
      if (!e) return { kind: "not_found" };
      if (e.version !== version) return { kind: "stale", currentVersion: e.version };
      Object.assign(e, w, { version: e.version + 1 });
      return { kind: "updated" };
    }),
    softDeleteEntry: vi.fn(async (id: string) => {
      const e = entries.find((x) => x.id === id)!;
      e.deletedAt = new Date();
      e.version += 1;
      return { kind: "updated" };
    }),
    listEntries: vi.fn(async (siteId: string) => ({ rows: entries.filter((e) => e.siteId === siteId && !e.deletedAt).map(view), truncated: false })),
    lockEntries: vi.fn(async () => []),
  }));

  const list = await import("./entries/route");
  const bulk = await import("./entries/bulk/route");
  const detail = await import("./entries/[id]/route");
  const locks = await import("./locks/route");
  return { entries, audit, list, bulk, detail, locks };
}

function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

const body = (p: Record<string, unknown> = {}) => ({
  clientUuid: "aaaaaaaa-1111-4111-8111-111111111111",
  prodDate: todayVN(),
  shiftId: CA1,
  machineId: M1,
  partId: P1,
  qtyOk: 480,
  qtyNg: 0,
  ...p,
});
const req = (url: string, method = "GET", json?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { "content-type": "application/json" } } : {}),
  });
const post = (b: unknown) => req("/api/shift-output/entries", "POST", b);

afterEach(() => vi.resetModules());

describe("POST /api/shift-output/entries", () => {
  it("201 tạo dòng + ghi audit; gửi lại cùng client_uuid → 200 replayed (không nhân đôi)", async () => {
    const t = await setup();
    const r1 = await t.list.POST(post(body()));
    expect(r1.status).toBe(201);
    expect(t.audit).toHaveBeenCalledTimes(1);
    const r2 = await t.list.POST(post(body()));
    expect(r2.status).toBe(200);
    expect((await r2.json()).replayed).toBe(true);
    expect(t.entries).toHaveLength(1);
    expect(t.audit).toHaveBeenCalledTimes(1);
  });

  it("409 DUPLICATE_SLOT kèm existingId khi trùng (ngày, ca, máy, mã)", async () => {
    const t = await setup();
    await t.list.POST(post(body()));
    const r = await t.list.POST(post(body({ clientUuid: "bbbbbbbb-1111-4111-8111-111111111111" })));
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.error.code).toBe("DUPLICATE_SLOT");
    expect(j.error.details.existingId).toBe(t.entries[0]!.id);
  });

  it("422: ngày tương lai, Σ lỗi > NG, dòng rỗng; 422 máy của site khác (FK ghép ở app)", async () => {
    const t = await setup();
    const future = await t.list.POST(post(body({ prodDate: "2099-01-01" })));
    expect([future.status, (await future.json()).error.code]).toEqual([422, "FUTURE_DATE"]);
    const over = await t.list.POST(post(body({ qtyNg: 2, defects: [{ reasonId: D1, qty: 3 }] })));
    expect([over.status, (await over.json()).error.code]).toEqual([422, "DEFECT_OVER_NG"]);
    const empty = await t.list.POST(post(body({ qtyOk: 0 })));
    expect([empty.status, (await empty.json()).error.code]).toEqual([422, "NO_OUTPUT"]);
    const other = await t.list.POST(post(body({ machineId: M_B })));
    expect([other.status, (await other.json()).error.code]).toEqual([422, "INVALID_REFERENCE"]);
    expect(t.entries).toHaveLength(0);
  });

  it("cô lập site: workshop gửi siteId site khác → 404; workshop chưa gán site → 403 NO_SITE", async () => {
    const t = await setup();
    const r = await t.list.POST(post(body({ siteId: SITE_B })));
    expect(r.status).toBe(404);
    const t2 = await setup({ userSite: null });
    const r2 = await t2.list.POST(post(body()));
    expect(r2.status).toBe(403);
    expect((await r2.json()).error.code).toBe("NO_SITE");
  });

  it("vai khác (planner/operator) mặc định 403", async () => {
    for (const role of ["planner", "operator", "qc"]) {
      const t = await setup({ roles: [role], userSite: null });
      expect((await t.list.POST(post(body()))).status).toBe(403);
      expect((await t.list.GET(req(`/api/shift-output/entries?from=${todayVN()}&to=${todayVN()}`))).status).toBe(403);
    }
  });

  it("GET quá 31 ngày → 422", async () => {
    const t = await setup();
    const r = await t.list.GET(req("/api/shift-output/entries?from=2026-01-01&to=2026-03-01"));
    expect(r.status).toBe(422);
  });
});

describe("/entries/[id] — scope, version, khoá", () => {
  it("dòng của site khác → 404 với workshop; admin xem được", async () => {
    const t = await setup({ roles: ["admin"], userSite: null });
    t.entries.push({ id: U(50), siteId: SITE_B, clientUuid: U(51), prodDate: todayVN(), shiftId: CA1, machineId: M_B, partId: P1, qtyOk: 1, qtyNg: 0, version: 1, status: "SUBMITTED", deletedAt: null });
    expect((await t.detail.GET(req(`/api/shift-output/entries/${U(50)}`), { params: { id: U(50) } })).status).toBe(200);
    const w = await setup();
    w.entries.push({ id: U(50), siteId: SITE_B, clientUuid: U(51), prodDate: todayVN(), shiftId: CA1, machineId: M_B, partId: P1, qtyOk: 1, qtyNg: 0, version: 1, status: "SUBMITTED", deletedAt: null });
    expect((await w.detail.GET(req(`/api/shift-output/entries/${U(50)}`), { params: { id: U(50) } })).status).toBe(404);
    const patch = await w.detail.PATCH(req(`/api/shift-output/entries/${U(50)}`, "PATCH", { version: 1, qtyOk: 2 }), { params: { id: U(50) } });
    expect(patch.status).toBe(404);
  });

  it("PATCH version lệch → 409 STALE; đúng version → 200 + version tăng", async () => {
    const t = await setup();
    await t.list.POST(post(body()));
    const id = t.entries[0]!.id;
    const stale = await t.detail.PATCH(req(`/x/${id}`, "PATCH", { version: 9, qtyOk: 470 }), { params: { id } });
    expect([stale.status, (await stale.json()).error.code]).toEqual([409, "STALE"]);
    const ok = await t.detail.PATCH(req(`/x/${id}`, "PATCH", { version: 1, qtyOk: 470 }), { params: { id } });
    expect(ok.status).toBe(200);
    expect(t.entries[0]!.version).toBe(2);
    expect(t.entries[0]!.qtyOk).toBe(470);
  });

  it("dòng ĐÃ KHOÁ: workshop sửa/xoá → 403 LOCKED; admin thiếu lý do → 422; admin có lý do → 200", async () => {
    const t = await setup();
    t.entries.push({ id: U(60), siteId: SITE_A, clientUuid: U(61), prodDate: todayVN(), shiftId: CA1, machineId: M1, partId: P1, qtyOk: 5, qtyNg: 0, version: 1, status: "LOCKED", deletedAt: null });
    const p = { params: { id: U(60) } };
    const w1 = await t.detail.PATCH(req(`/x/${U(60)}`, "PATCH", { version: 1, qtyOk: 6, reason: "nhập nhầm số" }), p);
    expect([w1.status, (await w1.json()).error.code]).toEqual([403, "LOCKED"]);
    const w2 = await t.detail.DELETE(req(`/x/${U(60)}`, "DELETE", { reason: "nhập trùng ca" }), p);
    expect(w2.status).toBe(403);

    const a = await setup({ roles: ["admin"], userSite: null });
    a.entries.push({ id: U(60), siteId: SITE_A, clientUuid: U(61), prodDate: todayVN(), shiftId: CA1, machineId: M1, partId: P1, qtyOk: 5, qtyNg: 0, version: 1, status: "LOCKED", deletedAt: null });
    const a1 = await a.detail.PATCH(req(`/x/${U(60)}`, "PATCH", { version: 1, qtyOk: 6 }), p);
    expect([a1.status, (await a1.json()).error.code]).toEqual([422, "REASON_REQUIRED"]);
    const a2 = await a.detail.PATCH(req(`/x/${U(60)}`, "PATCH", { version: 1, qtyOk: 6, reason: "Thợ báo nhầm" }), p);
    expect(a2.status).toBe(200);
    expect(a.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", notes: "Sửa dòng đã khoá — Thợ báo nhầm" }));
  });

  it("xoá mềm cần lý do ≥ 5 ký tự", async () => {
    const t = await setup();
    await t.list.POST(post(body()));
    const id = t.entries[0]!.id;
    expect((await t.detail.DELETE(req(`/x/${id}`, "DELETE", { reason: "sai" }), { params: { id } })).status).toBe(422);
    expect((await t.detail.DELETE(req(`/x/${id}`, "DELETE", { reason: "Nhập trùng ca" }), { params: { id } })).status).toBe(200);
    expect(t.entries[0]!.deletedAt).not.toBeNull();
  });

  it("Chốt ca: workshop không có approve → 403; admin → 200", async () => {
    const t = await setup();
    expect((await t.locks.POST(req("/api/shift-output/locks", "POST", { prodDate: todayVN(), shiftId: CA1 }))).status).toBe(403);
    const a = await setup({ roles: ["admin"], userSite: null });
    expect((await a.locks.POST(req("/api/shift-output/locks", "POST", { prodDate: todayVN(), shiftId: CA1 }))).status).toBe(200);
  });
});

describe("POST /entries/bulk — xả hàng đợi offline", () => {
  it("kết quả từng dòng: 201 / 200 replayed / 409 / 422; 1 dòng hỏng không chặn dòng khác", async () => {
    const t = await setup();
    const a = body({ clientUuid: "aaaaaaaa-2222-4222-8222-222222222222" });
    const r = await t.bulk.POST(
      req("/api/shift-output/entries/bulk", "POST", {
        entries: [
          a,
          a, // gửi lại
          body({ clientUuid: "bbbbbbbb-2222-4222-8222-222222222222" }), // trùng slot
          body({ clientUuid: "cccccccc-2222-4222-8222-222222222222", partId: P2, prodDate: "2099-01-01" }),
          { clientUuid: "dddddddd-2222-4222-8222-222222222222", qtyOk: "abc" },
          body({ clientUuid: "eeeeeeee-2222-4222-8222-222222222222", shiftId: CA2 }),
        ],
      }),
    );
    expect(r.status).toBe(200);
    const { results } = await r.json();
    expect(results.map((x: { status: number }) => x.status)).toEqual([201, 200, 409, 422, 422, 201]);
    expect(results[2].existingId).toBe(results[0].id);
    expect(results[4].clientUuid).toBe("dddddddd-2222-4222-8222-222222222222");
    expect(t.entries).toHaveLength(2);
  });

  it("> 50 dòng → 422", async () => {
    const t = await setup();
    const r = await t.bulk.POST(req("/api/shift-output/entries/bulk", "POST", { entries: Array(51).fill(body()) }));
    expect(r.status).toBe(422);
  });
});

/* ── requireSession: tài khoản xưởng bị khoá khỏi API ngoài module ── */
describe("requireSession — khoá tài khoản xưởng", () => {
  async function loadSession(roles: string[]) {
    vi.resetModules();
    vi.doUnmock("@/server/session");
    vi.doMock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
    vi.doMock("@/lib/auth", () => ({
      AUTH_COOKIE_NAME: "iot_session",
      verifyAccessToken: vi.fn(async () => ({ sub: "u-1", usr: "xuong.dongan", roles, iat: 0, exp: 9e9 })),
    }));
    vi.doMock("@/server/middlewares/rateLimit", () => ({ apiBurstRateLimit: vi.fn(async () => ({ ok: true })) }));
    vi.doMock("@/server/repos/userPermissionOverrides", () => ({ findActiveOverride: vi.fn(async () => null) }));
    vi.doMock("@/server/repos/sessions", () => ({ isSessionValid: vi.fn(async () => true) }));
    return import("@/server/session");
  }
  const r = (path: string) => new NextRequest(`http://localhost${path}`, { headers: { cookie: "iot_session=t" } });

  it("workshop: /api/items, /api/me/productivity, /api/dashboard → 403; /api/me, /api/notifications, /api/push → OK", async () => {
    const s = await loadSession(["workshop"]);
    for (const p of ["/api/items", "/api/me/productivity", "/api/warehouse/today", "/api/orders"]) {
      const g = await s.requireSession(r(p));
      expect({ p, status: "response" in g ? g.response.status : 200 }).toEqual({ p, status: 403 });
    }
    for (const p of ["/api/me", "/api/notifications", "/api/notifications/stream", "/api/push/subscribe"]) {
      const g = await s.requireSession(r(p));
      expect({ p, ok: "session" in g }).toEqual({ p, ok: true });
    }
    expect(s.isModuleLockedAccount({ userId: "u", username: "x", fullName: "x", roles: ["workshop"], sessionId: null })).toBe(true);
  });

  it("requireCan: workshop chỉ qua được 3 entity Sản lượng ca", async () => {
    const s = await loadSession(["workshop"]);
    expect("session" in (await s.requireCan(r("/api/shift-output/entries"), "create", "shiftOutput"))).toBe(true);
    for (const e of ["item", "productionBoard", "finance", "pr", "wo"] as const) {
      const g = await s.requireCan(r("/api/x"), "read", e);
      expect({ e, status: "response" in g ? g.response.status : 200 }).toEqual({ e, status: 403 });
    }
  });

  it("admin kiêm workshop không bị khoá; vai thường không bị ảnh hưởng", async () => {
    const a = await loadSession(["admin", "workshop"]);
    expect("session" in (await a.requireSession(r("/api/items")))).toBe(true);
    const p = await loadSession(["planner"]);
    expect("session" in (await p.requireSession(r("/api/items")))).toBe(true);
  });
});
