import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { state, updateTemplate } = vi.hoisted(() => {
  const state = { roles: ["planner"] as string[], status: "ACTIVE" as string };
  const updateTemplate = vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
    id: "t1",
    code: "Z9999999-990001",
    status: (patch.status as string) ?? state.status,
  }));
  return { state, updateTemplate };
});

vi.mock("@/server/session", () => ({
  requireCan: vi.fn(async () => ({ session: { userId: "u1", username: "u", fullName: "U", roles: state.roles } })),
}));
vi.mock("@/server/repos/bomTemplates", () => ({
  BomHardDeleteBlockedError: class extends Error {},
  getTemplateById: vi.fn(async () => ({ id: "t1", code: "Z9999999-990001", status: state.status })),
  hardDeleteTemplate: vi.fn(),
  loadTree: vi.fn(),
  softDeleteTemplate: vi.fn(),
  updateTemplate,
}));
vi.mock("@/server/services/audit", () => ({
  writeAudit: vi.fn(async () => undefined),
  diffObjects: () => ({ before: {}, after: {} }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { PATCH } from "./route";

const call = (status: string) =>
  PATCH(
    new NextRequest("http://x/api/bom/templates/t1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }),
    { params: { id: "t1" } },
  );

describe("PATCH /api/bom/templates/[id] — luật trạng thái (B5, Q1)", () => {
  beforeEach(() => {
    updateTemplate.mockClear();
  });

  it("B5: planner ACTIVE → DRAFT bị 403", async () => {
    state.roles = ["planner"];
    state.status = "ACTIVE";
    const res = await call("DRAFT");
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toBe("Chỉ admin được đưa BOM đang dùng về Nháp.");
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("B5: admin ACTIVE → DRAFT được 200", async () => {
    state.roles = ["admin"];
    state.status = "ACTIVE";
    expect((await call("DRAFT")).status).toBe(200);
    expect(updateTemplate).toHaveBeenCalled();
  });

  it("Q1: DRAFT → ACTIVE qua PATCH bị 409 USE_RELEASE (kể cả admin)", async () => {
    for (const role of ["planner", "admin"]) {
      state.roles = [role];
      state.status = "DRAFT";
      const res = await call("ACTIVE");
      expect(res.status).toBe(409);
      const j = await res.json();
      expect(j.error.code).toBe("USE_RELEASE");
      expect(j.error.message).toContain("Kích hoạt");
    }
    expect(updateTemplate).not.toHaveBeenCalled();
  });

  it("OBSOLETE → DRAFT (khôi phục) vẫn được cho planner", async () => {
    state.roles = ["planner"];
    state.status = "OBSOLETE";
    expect((await call("DRAFT")).status).toBe(200);
  });
});
