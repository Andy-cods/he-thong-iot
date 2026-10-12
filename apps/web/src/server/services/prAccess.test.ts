import { describe, expect, it } from "vitest";
import {
  canAccessPR,
  canEditPRDraft,
  canExportPrExcel,
  canRecreatePR,
  canViewAllPRs,
} from "./prAccess";

describe("TASK-6VIEC Việc 1 — canExportPrExcel", () => {
  it("cho phép admin/purchaser/accountant xuất Excel", () => {
    expect(canExportPrExcel(["admin"])).toBe(true);
    expect(canExportPrExcel(["purchaser"])).toBe(true);
    expect(canExportPrExcel(["accountant"])).toBe(true);
  });

  it("chặn các vai khác (planner/warehouse/operator/qc)", () => {
    expect(canExportPrExcel(["planner"])).toBe(false);
    expect(canExportPrExcel(["warehouse"])).toBe(false);
    expect(canExportPrExcel(["operator"])).toBe(false);
    expect(canExportPrExcel(["qc"])).toBe(false);
    expect(canExportPrExcel([])).toBe(false);
  });

  it("multi-role (OR) — chỉ cần 1 role đủ quyền trong danh sách role của user", () => {
    expect(canExportPrExcel(["operator", "accountant"])).toBe(true);
    expect(canExportPrExcel(["operator", "qc"])).toBe(false);
  });
});

describe("canViewAllPRs — không bị ảnh hưởng bởi thay đổi quyền xuất Excel", () => {
  it("vẫn giữ nguyên danh sách role xem tất cả phiếu", () => {
    expect(canViewAllPRs(["warehouse"])).toBe(true);
    expect(canViewAllPRs(["operator"])).toBe(false);
  });
});

describe("L5/L7/L6 — quyền với phiếu nháp / tạo lại", () => {
  const owner = { userId: "u-owner", roles: ["operator"] as never[] };
  const planner = { userId: "u-plan", roles: ["planner"] as never[] };
  const accountant = { userId: "u-acc", roles: ["accountant"] as never[] };
  const admin = { userId: "u-admin", roles: ["admin"] as never[] };
  const draft = { status: "DRAFT", requestedBy: "u-owner" };
  const sent = { status: "SUBMITTED", requestedBy: "u-owner" };

  it("DRAFT: chỉ chủ phiếu và admin xem được (planner/accountant xem-tất-cả vẫn KHÔNG)", () => {
    expect(canAccessPR(owner, draft)).toBe(true);
    expect(canAccessPR(admin, draft)).toBe(true);
    expect(canAccessPR(planner, draft)).toBe(false);
    expect(canAccessPR(accountant, draft)).toBe(false);
  });

  it("phiếu đã gửi: role xem-tất-cả xem được, operator khác chủ thì không", () => {
    expect(canAccessPR(planner, sent)).toBe(true);
    expect(canAccessPR({ userId: "x", roles: ["operator"] as never[] }, sent)).toBe(false);
    expect(canAccessPR(owner, sent)).toBe(true);
  });

  it("sửa/gửi/xoá nháp: chủ + admin; phiếu đã gửi không ai sửa được (kể cả admin)", () => {
    expect(canEditPRDraft(owner, draft)).toBe(true);
    expect(canEditPRDraft(admin, draft)).toBe(true);
    expect(canEditPRDraft(planner, draft)).toBe(false);
    expect(canEditPRDraft(accountant, draft)).toBe(false);
    expect(canEditPRDraft(owner, sent)).toBe(false);
    expect(canEditPRDraft(admin, sent)).toBe(false);
  });

  it("tạo lại: chỉ REJECTED/CANCELLED, bởi chủ phiếu hoặc admin", () => {
    const rejected = { status: "REJECTED", requestedBy: "u-owner" };
    const cancelled = { status: "CANCELLED", requestedBy: "u-owner" };
    expect(canRecreatePR(owner, rejected)).toBe(true);
    expect(canRecreatePR(owner, cancelled)).toBe(true);
    expect(canRecreatePR(admin, rejected)).toBe(true);
    expect(canRecreatePR(planner, rejected)).toBe(false);
    expect(canRecreatePR(owner, sent)).toBe(false);
    expect(canRecreatePR(owner, draft)).toBe(false);
  });
});
