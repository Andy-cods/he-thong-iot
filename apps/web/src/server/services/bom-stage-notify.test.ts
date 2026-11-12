import { describe, expect, it } from "vitest";
import {
  assignRecipients,
  type CandidateUser,
  type NotifyPlan,
} from "@/server/services/notification-plans";
import {
  planSlipAssemblyCreated,
  planSlipSurfaceCreated,
  planSlipSurfaceReceived,
  planStageMoved,
  summarizeCodes,
  type StageMoveItem,
} from "@/server/services/bom-stage-notify";

const actor = { actorUserId: "u-actor", actorUsername: "An" };
const base = { templateId: "t1", templateCode: "BOM-01", ...actor };
const mv = (n: number, toStage: string, qty = 1): StageMoveItem[] =>
  Array.from({ length: n }, (_, i) => ({ lineId: `${toStage}${i}`, label: `BL${i + 1}`, qty, toStage }));
const rolesOf = (p: NotifyPlan | null) => (p?.targets ?? []).map((t) => (t.kind === "role" ? t.role : "?"));

describe("planStageMoved — bước đích → vai trò", () => {
  const cases: Array<[string, string[], string]> = [
    ["PO", ["purchaser"], "3 dòng cần đặt hàng"],
    ["ORDER", ["purchaser"], "3 dòng cần đặt hàng"],
    ["VENDOR", ["purchaser"], "3 dòng đang gia công tại NCC"],
    ["RECEIVED", ["warehouse", "qc"], "3 dòng hàng về, chờ QC"],
    ["STOCK", ["warehouse", "qc"], "3 dòng hàng về, chờ QC"],
    ["MACHINING", ["operator"], "3 dòng có phôi, sẵn sàng gia công"],
    ["SURFACE", ["warehouse"], "3 dòng chuyển sang bề mặt"],
    ["QC", ["qc"], "3 dòng chờ QC"],
    ["ASSEMBLY", ["operator", "planner"], "3 dòng sẵn sàng lắp ráp"],
  ];
  for (const [stage, roles, text] of cases) {
    it(`${stage} → ${roles.join("+")}`, () => {
      const p = planStageMoved({ ...base, moves: mv(3, stage) })!;
      expect(rolesOf(p)).toEqual(roles);
      expect(p.eventType).toBe("BOM_STAGE_HANDOFF");
      for (const t of p.targets) {
        expect(t.title).toContain("BOM-01");
        expect(t.title).toContain(text);
        expect(t.message).toBe("BL1, BL2, BL3");
        expect(t.category).toBe("action");
        expect(t.links[0]).toBe("/bom/t1/grid");
      }
    });
  }

  it("bước không có bộ phận phụ trách (BLANK/PROPOSE) → null", () => {
    expect(planStageMoved({ ...base, moves: mv(2, "BLANK") })).toBeNull();
    expect(planStageMoved({ ...base, moves: mv(2, "PROPOSE") })).toBeNull();
    expect(planStageMoved({ ...base, moves: [] })).toBeNull();
  });

  it("rút gọn mã: BL1, BL2, BL3, +k", () => {
    const p = planStageMoved({ ...base, moves: mv(7, "PO") })!;
    expect(p.targets[0]!.message).toBe("BL1, BL2, BL3, +4");
    expect(p.targets[0]!.title).toContain("7 dòng");
    expect(summarizeCodes(["A", "A", "B"])).toBe("A, B");
  });

  it("gộp: bulk 10 dòng cùng đích = 1 target / vai trò (không theo dòng)", () => {
    const p = planStageMoved({ ...base, moves: mv(10, "RECEIVED") })!;
    expect(p.targets).toHaveLength(2);
  });

  it("đích hỗn hợp: mỗi vai trò chỉ 1 target, nội dung gộp", () => {
    const p = planStageMoved({
      ...base,
      moves: [...mv(2, "RECEIVED"), ...mv(1, "QC"), ...mv(2, "MACHINING")],
    })!;
    // warehouse (RECEIVED), qc (RECEIVED + QC), operator (MACHINING) — không trùng vai trò
    expect(rolesOf(p).sort()).toEqual(["operator", "qc", "warehouse"]);
    const qc = p.targets.find((t) => t.kind === "role" && t.role === "qc")!;
    expect(qc.title).toContain("3 dòng chuyển bước");
    expect(qc.message).toContain("2 dòng hàng về, chờ QC");
    expect(qc.message).toContain("1 dòng chờ QC");
  });

  it("PO + ORDER cùng câu → gộp tổng dòng cho purchaser", () => {
    const p = planStageMoved({ ...base, moves: [...mv(2, "PO"), ...mv(1, "ORDER")] })!;
    expect(p.targets).toHaveLength(1);
    expect(p.targets[0]!.title).toContain("3 dòng cần đặt hàng");
  });

  it("1 dòng: tiêu đề '1 dòng …'", () => {
    const p = planStageMoved({ ...base, moves: mv(1, "PO") })!;
    expect(p.targets[0]!.title).toBe("BOM BOM-01: 1 dòng cần đặt hàng");
  });
});

describe("planSlip*", () => {
  const slip = {
    ...base,
    slipId: "s1",
    slipNo: "GT-PG261112-01",
    supplierName: "NTP Mạ Kẽm",
    lines: [
      { lineId: "a", label: "BL1", qty: 10 },
      { lineId: "b", label: "BL2", qty: 5.5 },
    ],
  };
  it("SURFACE tạo → warehouse: chuẩn bị xuất N món (SL) gửi NCC — phiếu", () => {
    const p = planSlipSurfaceCreated(slip);
    expect(rolesOf(p)).toEqual(["warehouse"]);
    expect(p.entityType).toBe("delivery_slip");
    expect(p.entityId).toBe("s1");
    expect(p.targets[0]!.message).toBe(
      "Chuẩn bị xuất 2 món (15,5 cái) gửi NTP Mạ Kẽm — phiếu GT-PG261112-01. BL1, BL2",
    );
    expect(p.targets[0]!.title).toContain("BOM-01");
  });
  it("SURFACE nhận về → qc: SL về từ NCC (phiếu) — chờ QC", () => {
    const p = planSlipSurfaceReceived(slip);
    expect(rolesOf(p)).toEqual(["qc"]);
    expect(p.targets[0]!.message).toBe(
      "15,5 cái về từ NTP Mạ Kẽm (phiếu GT-PG261112-01) — chờ QC. BL1, BL2",
    );
  });
  it("ASSEMBLY tạo → operator + planner", () => {
    const p = planSlipAssemblyCreated(slip);
    expect(rolesOf(p)).toEqual(["operator", "planner"]);
    expect(p.targets[0]!.message).toBe(
      "2 món (15,5 cái) sẵn sàng lắp ráp — phiếu GT-PG261112-01. BL1, BL2",
    );
  });
  it("thiếu tên NCC → 'nhà thầu phụ'", () => {
    const p = planSlipSurfaceCreated({ ...slip, supplierName: null });
    expect(p.targets[0]!.message).toContain("gửi nhà thầu phụ");
  });
});

describe("assignRecipients với plan bàn giao", () => {
  const users: CandidateUser[] = [
    { id: "u-actor", roles: ["warehouse"] },
    { id: "w2", roles: ["warehouse"] },
    { id: "q1", roles: ["qc"] },
    { id: "wq", roles: ["warehouse", "qc"] },
    { id: "o1", roles: ["operator"] },
  ];
  it("loại actor; user nhiều vai trò chỉ nhận 1 dòng; link qc fallback /engineering", () => {
    const p = planStageMoved({ ...base, moves: mv(2, "RECEIVED") })!;
    const d = assignRecipients(p, users);
    expect(d.map((x) => x.userId).sort()).toEqual(["q1", "w2", "wq"]);
    expect(d.find((x) => x.userId === "q1")!.link).toBe("/engineering");
    expect(d.find((x) => x.userId === "w2")!.link).toBe("/bom/t1/grid");
  });
  it("actor là người duy nhất của vai trò → không ai nhận", () => {
    const p = planStageMoved({ ...base, moves: mv(1, "SURFACE") })!;
    const d = assignRecipients(p, [{ id: "u-actor", roles: ["warehouse"] }]);
    expect(d).toHaveLength(0);
  });
});

describe("đảo bút toán không gửi thông báo", () => {
  it("route reverse không gọi bom-stage-notify", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/app/api/bom/templates/[id]/stage-moves/[moveId]/reverse/route.ts",
      "utf8",
    );
    expect(src).not.toMatch(/bom-stage-notify|notifyBom/);
  });
});
