import { describe, expect, it } from "vitest";
import { daysUntil, deadlineCountdown, vnTodayYmd } from "./board-deadline";
import {
  compareOpenBoardRows,
  planBoardSyncFromBom,
  type BoardRowLite,
  type BomForBoard,
} from "./production-board-policy";
import { bomDeleteKind, summarizeBulkDelete } from "./bom-delete-plan";

describe("vnTodayYmd — 'hôm nay' theo giờ Việt Nam", () => {
  it("17:30 UTC = 00:30 hôm sau ở VN", () => {
    expect(vnTodayYmd(new Date("2026-11-20T17:30:00Z"))).toBe("2026-11-21");
    expect(vnTodayYmd(new Date("2026-11-20T16:59:00Z"))).toBe("2026-11-20");
  });
  it("daysUntil theo ngày lịch", () => {
    expect(daysUntil("2026-11-25", "2026-11-20")).toBe(5);
    expect(daysUntil("2026-11-18", "2026-11-20")).toBe(-2);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
    expect(daysUntil("xx", "2026-12-31")).toBeNull();
  });
});

describe("deadlineCountdown", () => {
  const T = "2026-11-20";
  it.each([
    ["2026-11-25", "QUEUED", "normal", "Còn 5 ngày"],
    ["2026-11-23", "IN_PROGRESS", "soon", "Còn 3 ngày"],
    ["2026-11-21", "QC", "soon", "Còn 1 ngày"],
    ["2026-11-20", "QUEUED", "soon", "Hôm nay"],
    ["2026-11-17", "IN_PROGRESS", "overdue", "Quá 3 ngày"],
  ])("%s %s → %s %s", (d, st, tone, label) => {
    const r = deadlineCountdown(d, st, T);
    expect(r.tone).toBe(tone);
    expect(r.label).toBe(label);
  });
  it("chưa có hạn & chưa giao → pill 'Chưa có ngày giao'", () => {
    expect(deadlineCountdown(null, "QUEUED", T)).toEqual({ tone: "missing", label: "Chưa có ngày giao", days: null });
  });
  it("đã hoàn thành / đã giao → không đếm ngược", () => {
    expect(deadlineCountdown("2026-11-01", "COMPLETED", T).tone).toBe("done");
    expect(deadlineCountdown(null, "DELIVERED", T).label).toBeNull();
  });
});

describe("compareOpenBoardRows — sắp dòng mở", () => {
  const r = (id: string, o: Partial<{ isPinned: boolean; deadline: string | null; status: string; seq: number }>) => ({
    id,
    isPinned: false,
    deadline: null as string | null,
    status: "QUEUED",
    seq: 0,
    ...o,
  });
  it("ghim → hạn gần nhất → chưa có hạn cuối → trạng thái → STT", () => {
    const rows = [
      r("noDl", {}),
      r("late", { deadline: "2026-12-10" }),
      r("overdue", { deadline: "2026-11-01" }),
      r("pinnedNoDl", { isPinned: true }),
      r("soon", { deadline: "2026-11-22", status: "IN_PROGRESS" }),
      r("soonQ", { deadline: "2026-11-22", status: "QUEUED" }),
      r("noDlRun", { status: "IN_PROGRESS", seq: 5 }),
    ];
    expect(rows.sort(compareOpenBoardRows).map((x) => x.id)).toEqual([
      "pinnedNoDl",
      "overdue",
      "soon",
      "soonQ",
      "late",
      "noDlRun",
      "noDl",
    ]);
  });
});

describe("planBoardSyncFromBom — BOM kích hoạt → Bảng sản xuất", () => {
  const bom: BomForBoard = {
    id: "bom-1",
    code: "Z0000002-622582-BOM-TRI-N-KHAI",
    name: "BOM TRIỂN KHAI — Bàn gá hàn",
    targetQty: "4.000000",
    metadata: { template: "TRIEN_KHAI" },
  };
  const row = (o: Partial<BoardRowLite>): BoardRowLite => ({
    id: "r1",
    productCode: "Z0000002-622582",
    rfqNo: null,
    productName: "Bàn gá hàn",
    customer: null,
    qtyPlanned: "4.00",
    status: "QUEUED",
    deadline: null,
    bomTemplateId: null,
    ...o,
  });

  it("chưa có dòng → tạo Chờ GC với mã chuẩn hoá, tên bỏ tiền tố, SL, ĐVT Bộ", () => {
    const p = planBoardSyncFromBom(bom, [], { deadline: "2026-12-01", rfqNo: " QT26 ", customer: "" });
    expect(p).toEqual({
      action: "create",
      values: {
        productCode: "Z0000002-622582",
        productName: "Bàn gá hàn",
        qtyPlanned: 4,
        uom: "Bộ",
        deadline: "2026-12-01",
        rfqNo: "QT26",
        customer: null,
        bomTemplateId: "bom-1",
      },
    });
  });

  it("đã có dòng chưa giao cùng mã → chỉ gắn liên kết (không tạo thêm)", () => {
    const p = planBoardSyncFromBom(bom, [row({})]);
    expect(p.action).toBe("update");
    if (p.action !== "update") return;
    expect(p.itemId).toBe("r1");
    expect(p.patch).toEqual({ bomTemplateId: "bom-1" });
    expect(p.history.map((h) => h.field)).toEqual(["bom_link"]);
  });

  it("kích hoạt lại (đã liên kết, không đổi gì) → none — idempotent", () => {
    expect(planBoardSyncFromBom(bom, [row({ bomTemplateId: "bom-1" })])).toEqual({ action: "none", itemId: "r1" });
  });

  it("dòng QUEUED → cập nhật tên/SL theo BOM mới; dòng đang chạy thì không", () => {
    const q = planBoardSyncFromBom({ ...bom, targetQty: 6 }, [row({ bomTemplateId: "bom-1", productName: "cũ" })]);
    expect(q.action === "update" && q.patch).toEqual({ productName: "Bàn gá hàn", qtyPlanned: 6 });
    const run = planBoardSyncFromBom({ ...bom, targetQty: 6 }, [row({ bomTemplateId: "bom-1", productName: "cũ", status: "IN_PROGRESS" })]);
    expect(run).toEqual({ action: "none", itemId: "r1" });
  });

  it("dòng đã giao không tính → tạo dòng mới", () => {
    expect(planBoardSyncFromBom(bom, [row({ status: "DELIVERED" })]).action).toBe("create");
  });

  it("ưu tiên dòng đã gắn đúng BOM; thông tin nhập lúc kích hoạt ghi đè", () => {
    const p = planBoardSyncFromBom(
      bom,
      [row({ id: "other" }), row({ id: "mine", bomTemplateId: "bom-1" })],
      { deadline: "2026-12-05", customer: "SEVT" },
    );
    expect(p.action === "update" && p.itemId).toBe("mine");
    expect(p.action === "update" && p.patch).toEqual({ deadline: "2026-12-05", customer: "SEVT" });
  });

  it("BOM thường (không phải mẫu triển khai) → ĐVT Pcs; SL bị chặn trần", () => {
    const p = planBoardSyncFromBom({ ...bom, code: "ABC", name: "Khung", metadata: {}, targetQty: 1e12 }, []);
    expect(p.action === "create" && p.values.uom).toBe("Pcs");
    expect(p.action === "create" && p.values.qtyPlanned).toBe(10_000_000);
  });
});

describe("xoá BOM từ danh sách", () => {
  it("Nháp/Đang dùng → ngừng dùng; Ngừng dùng → xoá vĩnh viễn (admin) / không được", () => {
    expect(bomDeleteKind("ACTIVE", false)).toBe("soft");
    expect(bomDeleteKind("DRAFT", true)).toBe("soft");
    expect(bomDeleteKind("OBSOLETE", true)).toBe("hard");
    expect(bomDeleteKind("OBSOLETE", false)).toBe("forbidden");
  });
  it("toast liệt kê từng BOM lỗi kèm lý do", () => {
    const s = summarizeBulkDelete([
      { code: "A", kind: "soft", ok: true },
      { code: "B", kind: "hard", ok: true },
      { code: "C", kind: "hard", ok: false, reason: "Không xoá vĩnh viễn được BOM C: đang được dùng bởi 2 đơn hàng." },
    ]);
    expect(s.ok).toBe(false);
    expect(s.title).toBe("Đã chuyển Ngừng dùng 1 BOM, đã xoá vĩnh viễn 1 BOM · 1 BOM không xoá được");
    expect(s.failureLines).toEqual(["C: Không xoá vĩnh viễn được BOM C: đang được dùng bởi 2 đơn hàng."]);
  });
  it("cắt danh sách dài", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ code: `X${i}`, kind: "hard" as const, ok: false, reason: "r" }));
    const s = summarizeBulkDelete(many, 8);
    expect(s.title).toBe("Không BOM nào được xoá · 11 BOM không xoá được");
    expect(s.failureLines).toHaveLength(9);
    expect(s.failureLines.at(-1)).toBe("… và 3 BOM khác");
  });
});
