/**
 * P2 (0089) — route test Sản lượng ca: giờ chạy thực tế (POST / PATCH / bulk),
 * xưởng tự sửa Ca / Mã hàng / Người (máy, lý do, thiết lập xưởng vẫn admin),
 * ảnh mã hàng (loại file, dung lượng, phạm vi site). FakeDb in-memory ở tầng
 * repo — route + policy + scope THẬT. Ràng buộc DB kiểm ở 0089_shift_output_p2_smoke.sql.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SITE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const SITE_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const CA1 = "11111111-0000-4000-8000-000000000001";
const CA_DEM = "11111111-0000-4000-8000-000000000009";
const CA_B = "11111111-0000-4000-8000-0000000000b1";
const M1 = "22222222-0000-4000-8000-000000000001";
const P1 = "33333333-0000-4000-8000-000000000001";
const P_B = "33333333-0000-4000-8000-0000000000b1";
const ASSET = "55555555-0000-4000-8000-000000000001";
const U = (n: number) => `99999999-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Row = Record<string, unknown> & { id: string; siteId: string; isActive: boolean };

const SITES = {
  [SITE_A]: { id: SITE_A, code: "DONGAN", name: "Đông Anh", timezone: "Asia/Ho_Chi_Minh", lockAfterHours: 24, backdateDays: 2, ngWarnPct: 10, isActive: true },
  [SITE_B]: { id: SITE_B, code: "KHAC", name: "Khác", timezone: "Asia/Ho_Chi_Minh", lockAfterHours: 24, backdateDays: 2, ngWarnPct: 10, isActive: true },
} as const;

function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

async function setup(opts: { roles?: string[]; userSite?: string | null; saveImageFails?: boolean } = {}) {
  vi.resetModules();
  const { can } = await import("@iot/shared");
  const roles = (opts.roles ?? ["workshop"]) as never;
  const userSite = opts.userSite === undefined ? SITE_A : opts.userSite;
  const audit = vi.fn(async () => undefined);
  const entries: Array<Record<string, unknown> & { id: string; siteId: string; version: number }> = [];
  const catalog: Record<string, Row[]> = {
    shifts: [
      { id: CA1, siteId: SITE_A, code: "CA1", name: "Ca 1", startTime: "08:00:00", endTime: "12:00:00", crossesMidnight: false, isActive: true },
      { id: CA_DEM, siteId: SITE_A, code: "DEM", name: "Ca đêm", startTime: "19:00:00", endTime: "07:00:00", crossesMidnight: true, isActive: true },
      { id: CA_B, siteId: SITE_B, code: "CA1", name: "Ca B", startTime: "08:00:00", endTime: "12:00:00", crossesMidnight: false, isActive: true },
    ],
    machines: [{ id: M1, siteId: SITE_A, code: "CNC-01", name: "Máy 1", isActive: true }],
    parts: [
      { id: P1, siteId: SITE_A, code: "TRUC", name: "Trục", imageAssetId: null, isActive: true },
      { id: P_B, siteId: SITE_B, code: "BAC", name: "Bạc", imageAssetId: null, isActive: true },
    ],
    operators: [],
    "defect-reasons": [],
    "downtime-reasons": [],
  };
  let n = 0;
  const find = (kind: string, id: string) => catalog[kind]!.find((r) => r.id === id) ?? null;
  const saveImage = vi.fn(async () => {
    if (opts.saveImageFails) throw new Error("sharp missing");
    return { id: ASSET, sha256: "x", thumbUrl: "", fullUrl: "" };
  });

  vi.doMock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
  vi.doMock("@/lib/db", () => ({ db: {} }));
  vi.doMock("@/lib/env", () => ({ env: { UPLOAD_DIR: "./uploads-test" } }));
  vi.doMock("@/server/services/audit", () => ({ writeAudit: audit, diffObjects: (a: unknown, b: unknown) => ({ before: a, after: b }) }));
  vi.doMock("@/server/repos/userPermissionOverrides", () => ({ findActiveOverride: vi.fn(async () => null) }));
  vi.doMock("@/server/services/bomAssets", () => ({
    saveImage,
    readAsset: vi.fn(async (id: string) => (id === ASSET ? { data: Buffer.from("img"), mime: "image/webp" } : null)),
  }));
  vi.doMock("@/server/session", () => ({
    requireCan: vi.fn(async (_req: unknown, action: string, entity: string) => {
      if (!can(roles, action as never, entity as never)) {
        const { NextResponse } = await import("next/server");
        return { response: NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 }) };
      }
      return { session: { userId: "u-1", username: "xuong.dongan", fullName: "Xưởng", roles, sessionId: null } };
    }),
  }));
  vi.doMock("@/server/repos/shiftOutputSetup", async () => {
    const real = await vi.importActual<typeof import("@/server/repos/shiftOutputSetup")>("@/server/repos/shiftOutputSetup");
    return {
      parseSetupKind: real.parseSetupKind,
      SETUP_LABELS: real.SETUP_LABELS,
      SetupDuplicateError: real.SetupDuplicateError,
      getUserSiteId: vi.fn(async () => userSite),
      getSiteById: vi.fn(async (id: string) => (SITES as Record<string, unknown>)[id] ?? null),
      getDefaultSite: vi.fn(async () => SITES[SITE_A]),
      listSites: vi.fn(async () => Object.values(SITES)),
      getSetupAnySite: vi.fn(async (kind: string, id: string) => find(kind, id)),
      countActiveSetup: vi.fn(async (kind: string, siteId: string) => catalog[kind]!.filter((r) => r.siteId === siteId && r.isActive).length),
      createSetup: vi.fn(async (kind: string, siteId: string, data: Record<string, unknown>) => {
        const row = { ...data, id: U(++n), siteId, isActive: true } as Row;
        catalog[kind]!.push(row);
        return row;
      }),
      updateSetup: vi.fn(async (kind: string, siteId: string, id: string, patch: Record<string, unknown>) => {
        const r = find(kind, id);
        if (!r || r.siteId !== siteId) return null;
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) r[k] = v;
        return r;
      }),
      setPartImage: vi.fn(async (siteId: string, id: string, assetId: string | null) => {
        const r = find("parts", id);
        if (!r || r.siteId !== siteId) return null;
        r.imageAssetId = assetId;
        return r;
      }),
      updateSite: vi.fn(async (id: string) => (SITES as Record<string, unknown>)[id]),
      checkEntryRefs: vi.fn(async (siteId: string, r: { shiftId: string; machineId: string; partId: string }) => {
        const shift = find("shifts", r.shiftId);
        const invalid: string[] = [];
        if (shift?.siteId !== siteId) invalid.push("shiftId");
        if (find("machines", r.machineId)?.siteId !== siteId) invalid.push("machineId");
        if (find("parts", r.partId)?.siteId !== siteId) invalid.push("partId");
        return { invalid, shift };
      }),
    };
  });
  const view = (e: (typeof entries)[number]) => {
    const sh = find("shifts", e.shiftId as string)!;
    return {
      operatorId: null,
      operatorName: null,
      qtyPlanned: null,
      qtyRework: null,
      downtimeMin: null,
      materialLot: null,
      notes: null,
      workStart: null,
      workEnd: null,
      ...e,
      shiftStart: sh.startTime,
      shiftEnd: sh.endTime,
      crossesMidnight: sh.crossesMidnight,
      shiftCode: "CA",
      shiftName: "Ca",
      machineCode: "CNC-01",
      machineName: "Máy 1",
      partCode: "TRUC",
      partName: "Trục",
      status: "SUBMITTED",
      lockedAt: null,
      createdAt: new Date(),
      createdByName: null,
      updatedAt: new Date(),
      deletedAt: null,
      deleteReason: null,
      defects: [],
      downtimes: [],
    };
  };
  vi.doMock("@/server/repos/shiftOutputEntries", () => ({
    loadRecentContext: vi.fn(async () => ({ recentPartIds: [], lastPartByMachine: {}, avgOk30: {} })),
    getEntry: vi.fn(async (id: string) => {
      const e = entries.find((x) => x.id === id);
      return e ? view(e) : null;
    }),
    findActiveSlot: vi.fn(async () => null),
    insertEntry: vi.fn(async (siteId: string, clientUuid: string, w: Record<string, unknown>) => {
      const prev = entries.find((e) => e.clientUuid === clientUuid);
      if (prev) return { kind: "replayed", id: prev.id, siteId: prev.siteId };
      const id = U(100 + ++n);
      entries.push({ ...w, id, siteId, clientUuid, version: 1 });
      return { kind: "created", id };
    }),
    updateEntry: vi.fn(async (id: string, version: number, w: Record<string, unknown>) => {
      const e = entries.find((x) => x.id === id)!;
      if (e.version !== version) return { kind: "stale", currentVersion: e.version };
      Object.assign(e, w, { version: e.version + 1 });
      return { kind: "updated" };
    }),
  }));

  return {
    entries,
    catalog,
    audit,
    saveImage,
    list: await import("./entries/route"),
    bulk: await import("./entries/bulk/route"),
    detail: await import("./entries/[id]/route"),
    setupKind: await import("./setup/[kind]/route"),
    setupItem: await import("./setup/[kind]/[id]/route"),
    sites: await import("./sites/[id]/route"),
    image: await import("./parts/[id]/image/route"),
  };
}

const req = (url: string, method = "GET", json?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { "content-type": "application/json" } } : {}),
  });
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

afterEach(() => vi.resetModules());

describe("P2 — giờ chạy thực tế", () => {
  it("POST có giờ thực tế 07:00–19:00 → shift_minutes 720 + lưu workStart/workEnd; không gửi → phút theo giờ ca", async () => {
    const t = await setup();
    const r = await t.list.POST(req("/api/shift-output/entries", "POST", body({ workStart: "07:00", workEnd: "19:00", downtimeMin: 300 })));
    expect(r.status).toBe(201);
    expect(t.entries[0]).toMatchObject({ shiftMinutes: 720, workStart: "07:00", workEnd: "19:00", downtimeMin: 300 });
    const legacy = await t.list.POST(
      req("/api/shift-output/entries", "POST", body({ clientUuid: "bbbbbbbb-1111-4111-8111-111111111111", machineId: M1, shiftId: CA_DEM })),
    );
    expect(legacy.status).toBe(201);
    expect(t.entries[1]).toMatchObject({ shiftMinutes: 720, workStart: null, workEnd: null }); // ca đêm 19–07 = 720'
  });

  it("dừng > phút thực tế → 422 DOWNTIME_OVER_SHIFT; thiếu 1 giờ / giờ bằng nhau → 422", async () => {
    const t = await setup();
    const over = await t.list.POST(req("/x", "POST", body({ workStart: "07:00", workEnd: "07:30", downtimeMin: 60 })));
    expect([over.status, (await over.json()).error.code]).toEqual([422, "DOWNTIME_OVER_SHIFT"]);
    const half = await t.list.POST(req("/x", "POST", body({ workStart: "07:00" })));
    expect([half.status, (await half.json()).error.code]).toEqual([422, "VALIDATION_ERROR"]);
    const same = await t.list.POST(req("/x", "POST", body({ workStart: "07:00", workEnd: "07:00" })));
    expect(same.status).toBe(422);
    expect(t.entries).toHaveLength(0);
  });

  it("qua nửa đêm 23:00–01:30 = 150'", async () => {
    const t = await setup();
    const r = await t.list.POST(req("/x", "POST", body({ shiftId: CA_DEM, workStart: "23:00", workEnd: "01:30" })));
    expect(r.status).toBe(201);
    expect(t.entries[0]!.shiftMinutes).toBe(150);
  });

  it("PATCH đổi giờ → phút mới + audit; null,null → về giờ ca; không gửi → giữ", async () => {
    const t = await setup();
    await t.list.POST(req("/x", "POST", body()));
    const id = t.entries[0]!.id;
    const p = { params: { id } };
    const a = await t.detail.PATCH(req(`/x/${id}`, "PATCH", { version: 1, workStart: "06:00", workEnd: "18:00" }), p);
    expect(a.status).toBe(200);
    expect(t.entries[0]).toMatchObject({ shiftMinutes: 720, workStart: "06:00", workEnd: "18:00" });
    expect(t.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "UPDATE", after: expect.objectContaining({ workStart: "06:00", shiftMinutes: 720 }) }),
    );
    const keep = await t.detail.PATCH(req(`/x/${id}`, "PATCH", { version: 2, qtyOk: 470 }), p);
    expect(keep.status).toBe(200);
    expect(t.entries[0]!.shiftMinutes).toBe(720);
    const reset = await t.detail.PATCH(req(`/x/${id}`, "PATCH", { version: 3, workStart: null, workEnd: null }), p);
    expect(reset.status).toBe(200);
    expect(t.entries[0]).toMatchObject({ shiftMinutes: 240, workStart: null, workEnd: null });
  });

  it("bulk (hàng đợi offline) mang giờ thực tế; dòng bản cũ không có giờ vẫn nhận", async () => {
    const t = await setup();
    const r = await t.bulk.POST(
      req("/api/shift-output/entries/bulk", "POST", {
        entries: [
          body({ clientUuid: "aaaaaaaa-3333-4333-8333-333333333333", workStart: "07:00", workEnd: "19:00" }),
          body({ clientUuid: "bbbbbbbb-3333-4333-8333-333333333333", shiftId: CA_DEM }),
        ],
      }),
    );
    expect((await r.json()).results.map((x: { status: number }) => x.status)).toEqual([201, 201]);
    expect(t.entries.map((e) => e.shiftMinutes)).toEqual([720, 720]);
    expect(t.entries.map((e) => e.workStart)).toEqual(["07:00", null]);
  });
});

describe("P2 — xưởng tự sửa Ca / Mã hàng / Người", () => {
  it("workshop thêm ca 19:00–07:00 → crossesMidnight TỰ = true (bỏ qua cờ client)", async () => {
    const t = await setup();
    const r = await t.setupKind.POST(
      req("/api/shift-output/setup/shifts", "POST", { code: "dem2", name: "Ca đêm 2", startTime: "20:00", endTime: "08:00", crossesMidnight: false }),
      { params: { kind: "shifts" } },
    );
    expect(r.status).toBe(201);
    expect((await r.json()).data).toMatchObject({ code: "DEM2", crossesMidnight: true, siteId: SITE_A });
  });

  it("workshop sửa giờ ca → tự suy qua nửa đêm; sửa / ngừng dùng mã hàng OK; audit", async () => {
    const t = await setup();
    const r = await t.setupItem.PATCH(req(`/x`, "PATCH", { startTime: "07:00", endTime: "19:00" }), { params: { kind: "shifts", id: CA1 } });
    expect(r.status).toBe(200);
    expect(t.catalog.shifts![0]).toMatchObject({ startTime: "07:00", endTime: "19:00", crossesMidnight: false });
    const night = await t.setupItem.PATCH(req(`/x`, "PATCH", { endTime: "06:00" }), { params: { kind: "shifts", id: CA1 } });
    expect(night.status).toBe(200);
    expect(t.catalog.shifts![0]!.crossesMidnight).toBe(true);
    const part = await t.setupItem.PATCH(req(`/x`, "PATCH", { name: "Trục mới" }), { params: { kind: "parts", id: P1 } });
    expect(part.status).toBe(200);
    const off = await t.setupItem.DELETE(req(`/x`, "DELETE"), { params: { kind: "parts", id: P1 } });
    expect(off.status).toBe(200);
    expect(t.catalog.parts![0]!.isActive).toBe(false);
    expect(t.audit).toHaveBeenCalledTimes(4);
  });

  it("đổi giờ ca KHÔNG đụng dòng cũ (shift_minutes snapshot)", async () => {
    const t = await setup();
    await t.list.POST(req("/x", "POST", body()));
    await t.setupItem.PATCH(req(`/x`, "PATCH", { startTime: "07:00", endTime: "19:00" }), { params: { kind: "shifts", id: CA1 } });
    expect(t.entries[0]!.shiftMinutes).toBe(240);
  });

  it("giờ ca bằng nhau → 422; ngừng dùng ca cuối cùng → 422 LAST_ACTIVE_SHIFT", async () => {
    const t = await setup();
    const same = await t.setupItem.PATCH(req(`/x`, "PATCH", { endTime: "08:00" }), { params: { kind: "shifts", id: CA1 } });
    expect(same.status).toBe(422);
    expect((await t.setupItem.DELETE(req(`/x`, "DELETE"), { params: { kind: "shifts", id: CA_DEM } })).status).toBe(200);
    const last = await t.setupItem.PATCH(req(`/x`, "PATCH", { isActive: false }), { params: { kind: "shifts", id: CA1 } });
    expect([last.status, (await last.json()).error.code]).toEqual([422, "LAST_ACTIVE_SHIFT"]);
    const last2 = await t.setupItem.DELETE(req(`/x`, "DELETE"), { params: { kind: "shifts", id: CA1 } });
    expect(last2.status).toBe(422);
  });

  it("workshop: máy / lý do / thiết lập xưởng → 403; ca của site khác → 404", async () => {
    const t = await setup();
    expect((await t.setupItem.PATCH(req(`/x`, "PATCH", { name: "x" }), { params: { kind: "machines", id: M1 } })).status).toBe(403);
    expect((await t.setupItem.DELETE(req(`/x`, "DELETE"), { params: { kind: "machines", id: M1 } })).status).toBe(403);
    expect(
      (await t.setupKind.POST(req("/x", "POST", { code: "X", name: "x" }), { params: { kind: "defect-reasons" } })).status,
    ).toBe(403);
    expect((await t.sites.PATCH(req(`/x`, "PATCH", { lockAfterHours: 720 }), { params: { id: SITE_A } })).status).toBe(403);
    expect((await t.setupItem.PATCH(req(`/x`, "PATCH", { name: "x" }), { params: { kind: "shifts", id: CA_B } })).status).toBe(404);
  });

  it("admin vẫn sửa được máy + thiết lập xưởng", async () => {
    const t = await setup({ roles: ["admin"], userSite: null });
    expect((await t.setupItem.PATCH(req(`/x`, "PATCH", { name: "Máy A" }), { params: { kind: "machines", id: M1 } })).status).toBe(200);
    expect((await t.sites.PATCH(req(`/x`, "PATCH", { lockAfterHours: 48 }), { params: { id: SITE_A } })).status).toBe(200);
  });
});

describe("P2 — ảnh mã hàng", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const upload = (bytes: Uint8Array, type = "image/png") => {
    const fd = new FormData();
    fd.append("file", new File([bytes as unknown as BlobPart], "a.png", { type }));
    return new NextRequest("http://localhost/api/shift-output/parts/x/image", { method: "POST", body: fd });
  };

  it("workshop tải ảnh PNG → gắn vào mã + audit; GET trả ảnh (cache bất biến khi đúng v)", async () => {
    const t = await setup();
    const r = await t.image.POST(upload(PNG), { params: { id: P1 } });
    expect(r.status).toBe(201);
    expect(t.catalog.parts![0]!.imageAssetId).toBe(ASSET);
    expect(t.audit).toHaveBeenCalledWith(expect.objectContaining({ objectType: "shift_setup_parts", after: { imageAssetId: ASSET } }));
    const g = await t.image.GET(req(`/api/shift-output/parts/${P1}/image?size=thumb&v=${ASSET}`), { params: { id: P1 } });
    expect(g.status).toBe(200);
    expect(g.headers.get("content-type")).toBe("image/webp");
    expect(g.headers.get("cache-control")).toContain("immutable");
    const d = await t.image.DELETE(req(`/x`, "DELETE"), { params: { id: P1 } });
    expect(d.status).toBe(200);
    expect(t.catalog.parts![0]!.imageAssetId).toBeNull();
  });

  it("file không phải ảnh (đổi đuôi) → 422; quá 5MB → 413; xử lý ảnh lỗi → 422", async () => {
    const t = await setup();
    const html = new TextEncoder().encode("<html>hi</html>");
    expect((await t.image.POST(upload(html), { params: { id: P1 } })).status).toBe(422);
    const pdf = new TextEncoder().encode("%PDF-1.4 xxx");
    expect((await t.image.POST(upload(pdf, "application/pdf"), { params: { id: P1 } })).status).toBe(422);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await t.image.POST(upload(big), { params: { id: P1 } })).status).toBe(413);
    const f = await setup({ saveImageFails: true });
    const r = await f.image.POST(upload(PNG), { params: { id: P1 } });
    expect([r.status, (await r.json()).error.code]).toEqual([422, "IMAGE_PROCESS_FAILED"]);
  });

  it("mã hàng site khác → 404 (cả GET lẫn POST); vai không có quyền → 403", async () => {
    const t = await setup();
    expect((await t.image.POST(upload(PNG), { params: { id: P_B } })).status).toBe(404);
    expect((await t.image.GET(req(`/x`), { params: { id: P_B } })).status).toBe(404);
    expect(t.saveImage).not.toHaveBeenCalled();
    const p = await setup({ roles: ["planner"], userSite: null });
    expect((await p.image.GET(req(`/x`), { params: { id: P1 } })).status).toBe(403);
    expect((await p.image.POST(upload(PNG), { params: { id: P1 } })).status).toBe(403);
  });
});
