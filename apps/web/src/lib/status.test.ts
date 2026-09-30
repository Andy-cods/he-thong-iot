import { describe, expect, it } from "vitest";
import {
  ACTION_LABELS,
  NOTIF_TYPE_LABELS,
  STATUS_DEFS,
  STATUS_TONES,
  TONE_CLASSES,
  actionLabel,
  activeStatusCode,
  getStatus,
  notifTypeLabel,
  prettifyUnknownCode,
  statusLabel,
  statusOptions,
  type StatusDomain,
} from "./status";

// V4.1 UI-07/08 (Đợt 6B) — nguồn nhãn/tông trạng thái duy nhất.

/** Từ tiếng Anh từng lọt giao diện (Active/Disabled, PASS/FAIL, SENT…). */
const ENGLISH_WORDS =
  /\b(active|inactive|disabled|enabled|draft|pending|approved|rejected|cancel(l)?ed|completed|pass|fail(ed)?|sent|received|closed|done|snapshot|commit)\b/i;

type Def = { label: string; tone: string; short?: string; void?: boolean };
const domains = Object.keys(STATUS_DEFS) as StatusDomain[];
const table = (domain: StatusDomain) => STATUS_DEFS[domain] as Record<string, Def>;

describe("STATUS_DEFS", () => {
  it.each(domains)("domain %s: mọi trạng thái có nhãn tiếng Việt + tông hợp lệ", (domain) => {
    const entries = Object.entries(table(domain));
    expect(entries.length).toBeGreaterThan(0);
    for (const [code, def] of entries) {
      expect(def.label.trim().length, `${domain}.${code}`).toBeGreaterThan(0);
      expect(STATUS_TONES, `${domain}.${code}`).toContain(def.tone);
      expect(def.label, `${domain}.${code} lọt tiếng Anh`).not.toMatch(ENGLISH_WORDS);
      if (def.short) expect(def.short).not.toMatch(ENGLISH_WORDS);
    }
  });

  it("'Đã huỷ' luôn neutral (không đỏ) và gạch ngang; không viết 'hủy'", () => {
    for (const domain of domains) {
      for (const [code, def] of Object.entries(table(domain))) {
        if (def.label === "Đã huỷ") {
          expect(def.tone, `${domain}.${code}`).toBe("neutral");
          expect(def.void, `${domain}.${code}`).toBe(true);
        }
        expect(def.label, `${domain}.${code}`).not.toMatch(/hủy/);
      }
    }
  });

  it("Vật tư / BOM / NCC cùng 1 cách gọi: Đang dùng / Ngừng dùng", () => {
    expect(statusLabel("bom", "ACTIVE")).toBe("Đang dùng");
    expect(statusLabel("bom", "OBSOLETE")).toBe("Ngừng dùng");
    expect(statusLabel("item", activeStatusCode(true))).toBe("Đang dùng");
    expect(statusLabel("item", activeStatusCode(false))).toBe("Ngừng dùng");
    expect(statusLabel("supplier", "ACTIVE")).toBe("Đang dùng");
    expect(statusLabel("supplier", "INACTIVE")).toBe("Ngừng dùng");
  });

  it("người dùng: không còn Active/Disabled", () => {
    expect(statusLabel("user", "ACTIVE")).toBe("Hoạt động");
    expect(statusLabel("user", "INACTIVE")).toBe("Vô hiệu hoá");
  });

  it("mọi tông có đủ lớp pill/dot/text/bar", () => {
    for (const tone of STATUS_TONES) {
      const c = TONE_CLASSES[tone];
      expect(c.pill).toMatch(/bg-/);
      expect(c.dot).toMatch(/bg-/);
      expect(c.text).toMatch(/text-/);
      expect(c.bar).toMatch(/bg-/);
    }
  });
});

describe("getStatus", () => {
  it("tra đúng nhãn + tông", () => {
    expect(getStatus("po", "RECEIVED")).toMatchObject({ label: "Đã nhận đủ", tone: "success" });
    expect(getStatus("wo", "IN_PROGRESS")).toMatchObject({ tone: "progress", short: "Đang SX" });
    expect(getStatus("invoice", "OVERDUE").tone).toBe("warning");
    expect(getStatus("pr", "REJECTED").tone).toBe("danger");
  });

  it("mã lạ không vỡ UI: trả chính mã, tông neutral", () => {
    expect(getStatus("po", "WEIRD")).toEqual({ label: "WEIRD", tone: "neutral" });
    expect(getStatus("po", null)).toEqual({ label: "—", tone: "neutral" });
  });

  it("statusOptions giữ thứ tự khai báo", () => {
    expect(statusOptions("bom").map((o) => o.code)).toEqual(["DRAFT", "ACTIVE", "OBSOLETE"]);
  });
});

describe("ACTION_LABELS / NOTIF_TYPE_LABELS", () => {
  it("không nhãn nào là mã thô", () => {
    for (const [code, label] of Object.entries({ ...ACTION_LABELS, ...NOTIF_TYPE_LABELS })) {
      expect(label, code).not.toBe(code);
      expect(label, code).not.toMatch(/^[A-Z_]{4,}$/);
    }
  });

  it("thông báo lạ → 'Thông báo', không lộ mã", () => {
    expect(notifTypeLabel("PR_PENDING_REMINDER")).toBe("Nhắc duyệt");
    expect(notifTypeLabel("FIN_INVOICE_OVERDUE")).toBe("Hoá đơn quá hạn");
    expect(notifTypeLabel("SOMETHING_NEW")).toBe("Thông báo");
  });
});

// V4.4 A14 — bảng nhãn thiếu entry KHÔNG được render thẳng key thô
// (VD "PRODUCTION_QTY_SCRAP") — prettify tối thiểu thay vì ALL CAPS khó hiểu.
describe("prettifyUnknownCode", () => {
  it("SCREAMING_SNAKE_CASE → 'Câu thường, viết hoa chữ đầu'", () => {
    expect(prettifyUnknownCode("PRODUCTION_QTY_SCRAP")).toBe("Production qty scrap");
    expect(prettifyUnknownCode("session")).toBe("Session");
  });
  it("rỗng → giữ nguyên (không có gì để prettify)", () => {
    expect(prettifyUnknownCode("")).toBe("");
  });
});

describe("actionLabel — mã lạ dùng prettify thay vì trả thô", () => {
  it("mã đã biết → nhãn tiếng Việt như cũ", () => {
    expect(actionLabel("LOGIN")).toBe("Đăng nhập");
  });
  it("mã lạ → prettify, không phải ALL CAPS", () => {
    expect(actionLabel("SOME_NEW_ACTION")).toBe("Some new action");
  });
});
