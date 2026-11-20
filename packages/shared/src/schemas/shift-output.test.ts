import { describe, expect, it } from "vitest";
import {
  SHIFT_BULK_MAX,
  shiftEntryBulkSchema,
  shiftEntryCreateSchema,
  shiftEntryDeleteSchema,
  shiftEntryPatchSchema,
  shiftSetupSchemas,
} from "./shift-output";
import { userCreateSchema, workshopRoleIssue } from "./user";

const U = (n: number) => `0000000${n}-0000-4000-8000-000000000000`.slice(-36);
const base = {
  clientUuid: "11111111-1111-4111-8111-111111111111",
  prodDate: "2026-11-18",
  shiftId: U(1),
  machineId: U(2),
  partId: U(3),
  qtyOk: 480,
  qtyNg: 12,
};

describe("shiftEntryCreateSchema", () => {
  it("dòng tối thiểu hợp lệ; text rỗng → null; defects/downtimes mặc định []", () => {
    const r = shiftEntryCreateSchema.parse({ ...base, notes: "  ", materialLot: "" });
    expect(r.notes).toBeNull();
    expect(r.materialLot).toBeNull();
    expect(r.defects).toEqual([]);
    expect(r.downtimes).toEqual([]);
  });

  it("V1 — số âm, số lẻ, vượt 100.000 bị chặn", () => {
    expect(shiftEntryCreateSchema.safeParse({ ...base, qtyOk: -1 }).success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, qtyOk: 1.5 }).success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, qtyNg: 100_001 }).success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, qtyOk: 100_000 }).success).toBe(true);
  });

  it("thiếu client_uuid / ngày sai định dạng → lỗi", () => {
    const { clientUuid: _c, ...noUuid } = base;
    expect(shiftEntryCreateSchema.safeParse(noUuid).success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, prodDate: "18/11/2026" }).success).toBe(false);
  });

  it("lý do lỗi lặp → lỗi; qty lỗi phải > 0", () => {
    const dup = shiftEntryCreateSchema.safeParse({
      ...base,
      defects: [
        { reasonId: U(9), qty: 2 },
        { reasonId: U(9), qty: 3 },
      ],
    });
    expect(dup.success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, defects: [{ reasonId: U(9), qty: 0 }] }).success).toBe(false);
  });
});

describe("P2 — giờ chạy thực tế", () => {
  it("không gửi (bản cũ) / gửi đủ 2 giờ / qua nửa đêm đều hợp lệ", () => {
    expect(shiftEntryCreateSchema.safeParse(base).success).toBe(true);
    expect(shiftEntryCreateSchema.safeParse({ ...base, workStart: "07:00", workEnd: "19:00" }).success).toBe(true);
    expect(shiftEntryCreateSchema.safeParse({ ...base, workStart: "19:00", workEnd: "07:00" }).success).toBe(true);
    expect(shiftEntryCreateSchema.safeParse({ ...base, workStart: null, workEnd: null }).success).toBe(true);
  });
  it("thiếu 1 trong 2 giờ, giờ bằng nhau, sai định dạng → lỗi", () => {
    expect(shiftEntryCreateSchema.safeParse({ ...base, workStart: "07:00" }).success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, workEnd: "19:00", workStart: null }).success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, workStart: "07:00", workEnd: "07:00" }).success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, workStart: "7:00", workEnd: "19:00" }).success).toBe(false);
    expect(shiftEntryCreateSchema.safeParse({ ...base, workStart: "24:00", workEnd: "19:00" }).success).toBe(false);
  });
  it("PATCH: cả 2 hoặc không; null + null = về giờ ca", () => {
    expect(shiftEntryPatchSchema.safeParse({ version: 1, workStart: "06:30", workEnd: "18:30" }).success).toBe(true);
    expect(shiftEntryPatchSchema.safeParse({ version: 1, workStart: null, workEnd: null }).success).toBe(true);
    expect(shiftEntryPatchSchema.safeParse({ version: 1, workStart: "06:30" }).success).toBe(false);
  });
});

describe("bulk / patch / delete", () => {
  it(`bulk tối đa ${SHIFT_BULK_MAX} dòng`, () => {
    expect(shiftEntryBulkSchema.safeParse({ entries: Array(SHIFT_BULK_MAX).fill({}) }).success).toBe(true);
    expect(shiftEntryBulkSchema.safeParse({ entries: Array(SHIFT_BULK_MAX + 1).fill({}) }).success).toBe(false);
    expect(shiftEntryBulkSchema.safeParse({ entries: [] }).success).toBe(false);
  });
  it("patch bắt buộc version; trường vắng giữ undefined", () => {
    expect(shiftEntryPatchSchema.safeParse({ qtyOk: 1 }).success).toBe(false);
    const r = shiftEntryPatchSchema.parse({ version: 2, qtyOk: 5 });
    expect(r.qtyNg).toBeUndefined();
    expect(r.operatorName).toBeUndefined();
  });
  it("xoá mềm cần lý do ≥ 5 ký tự", () => {
    expect(shiftEntryDeleteSchema.safeParse({ reason: "sai" }).success).toBe(false);
    expect(shiftEntryDeleteSchema.safeParse({ reason: "Nhập trùng ca" }).success).toBe(true);
  });
});

describe("danh mục", () => {
  it("mã viết HOA, cấm ký tự lạ", () => {
    expect(shiftSetupSchemas.parts.parse({ code: "truc-d20", name: "Trục D20" }).code).toBe("TRUC-D20");
    expect(shiftSetupSchemas.parts.safeParse({ code: "trục 20", name: "x" }).success).toBe(false);
  });
  it("ca (P2): 'qua nửa đêm' TỰ SUY từ giờ; bắt đầu = kết thúc → lỗi", () => {
    const day = shiftSetupSchemas.shifts.parse({ code: "CA1", name: "Ca ngày", startTime: "07:00", endTime: "19:00" });
    expect(day.crossesMidnight).toBe(false);
    const night = shiftSetupSchemas.shifts.parse({ code: "CA2", name: "Ca đêm", startTime: "19:00", endTime: "07:00" });
    expect(night.crossesMidnight).toBe(true);
    // client gửi sai cờ → server ghi đè theo giờ
    expect(
      shiftSetupSchemas.shifts.parse({ code: "CA3", name: "Ca 3", startTime: "08:00", endTime: "12:00", crossesMidnight: true })
        .crossesMidnight,
    ).toBe(false);
    expect(shiftSetupSchemas.shifts.safeParse({ code: "CA4", name: "Ca 4", startTime: "07:00", endTime: "07:00" }).success).toBe(false);
  });
});

describe("user — tài khoản workshop", () => {
  const user = { username: "xuong.dongan", fullName: "Xưởng Đông Anh", password: "Abcdefg1" };
  it("workshop phải có site và không kiêm vai khác", () => {
    expect(userCreateSchema.safeParse({ ...user, roles: ["workshop"] }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...user, roles: ["workshop", "operator"], siteId: U(5) }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...user, roles: ["workshop"], siteId: U(5) }).success).toBe(true);
    expect(userCreateSchema.safeParse({ ...user, roles: ["operator"] }).success).toBe(true);
  });
  it("workshopRoleIssue trả đúng trường lỗi", () => {
    expect(workshopRoleIssue(["workshop"], null)?.path).toBe("siteId");
    expect(workshopRoleIssue(["workshop", "admin"], U(5))?.path).toBe("roles");
    expect(workshopRoleIssue(["planner"], null)).toBeNull();
  });
});
