import { describe, expect, it } from "vitest";
import {
  createConfirmController,
  isTypeToConfirmSatisfied,
  validatePromptValue,
} from "./confirm-controller";

// V4.1 UX-01 (Đợt 6B) — lõi useConfirm/usePrompt thay hộp thoại gốc của trình duyệt.

describe("createConfirmController", () => {
  it("confirm resolve true/false theo nút bấm", async () => {
    const c = createConfirmController();
    const p1 = c.requestConfirm({ title: "Xoá?" });
    expect(c.current()).toMatchObject({ kind: "confirm", options: { title: "Xoá?" } });
    c.settle(true);
    await expect(p1).resolves.toBe(true);

    const p2 = c.requestConfirm({ title: "Huỷ?" });
    c.settle(false);
    await expect(p2).resolves.toBe(false);
    expect(c.current()).toBeNull();
  });

  it("prompt trả chuỗi đã trim, huỷ → null", async () => {
    const c = createConfirmController();
    const p = c.requestPrompt({ title: "Lý do", minLength: 5 });
    c.settle("  thiếu vật tư  ");
    await expect(p).resolves.toBe("thiếu vật tư");
    const q = c.requestPrompt({ title: "Lý do" });
    c.settle(null);
    await expect(q).resolves.toBeNull();
  });

  it("hàng đợi: hộp thứ 2 chỉ hiện sau khi hộp 1 đóng; listener được báo", async () => {
    const c = createConfirmController();
    const seen: Array<string | null> = [];
    const off = c.subscribe((r) => seen.push(r ? r.options.title : null));
    const a = c.requestConfirm({ title: "A" });
    const b = c.requestConfirm({ title: "B" });
    expect(c.current()?.options.title).toBe("A");
    c.settle(true);
    expect(c.current()?.options.title).toBe("B");
    c.settle(false);
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(false);
    expect(seen).toEqual(["A", "B", null]);
    off();
  });

  it("settle khi không có hộp nào → không lỗi", () => {
    const c = createConfirmController();
    expect(() => c.settle(true)).not.toThrow();
  });
});

describe("validatePromptValue", () => {
  it("bắt buộc + tối thiểu ký tự (sau trim)", () => {
    expect(validatePromptValue("", { minLength: 5 })).toMatch(/Vui lòng/);
    expect(validatePromptValue("  abc ", { minLength: 5 })).toMatch(/Tối thiểu 5/);
    expect(validatePromptValue("đủ năm", { minLength: 5 })).toBeNull();
    expect(validatePromptValue("", { required: true })).toMatch(/Vui lòng/);
    expect(validatePromptValue("", {})).toBeNull();
    expect(validatePromptValue("abcdef", { maxLength: 3 })).toMatch(/Tối đa 3/);
  });
});

describe("isTypeToConfirmSatisfied", () => {
  it("chỉ đúng khi gõ khớp", () => {
    expect(isTypeToConfirmSatisfied("", undefined)).toBe(true);
    expect(isTypeToConfirmSatisfied("XOA", "XOA")).toBe(true);
    expect(isTypeToConfirmSatisfied("xoa", "XOA")).toBe(false);
  });
});
