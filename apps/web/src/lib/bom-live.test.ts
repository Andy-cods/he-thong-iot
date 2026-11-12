import { describe, expect, it } from "vitest";
import { bomPollMs, patchTreeLines, setBomLiveHealthy, type PatchableLine } from "./bom-live";

const n = (
  id: string,
  parent: string | null,
  level: number,
  position: number,
  extra: Record<string, unknown> = {},
): PatchableLine & Record<string, unknown> => ({
  id,
  parentLineId: parent,
  level,
  position,
  ...extra,
});

describe("patchTreeLines", () => {
  const tree = [
    n("a", null, 1, 1, { v: 1 }),
    n("b", "a", 2, 1, { v: 1 }),
    n("c", "a", 2, 2, { v: 1 }),
  ];

  it("thay đúng dòng, giữ thứ tự, không mutate input", () => {
    const r = patchTreeLines(tree, [n("b", "a", 2, 1, { v: 2 })], ["b"]);
    expect(r.needsRefetch).toBe(false);
    expect(r.patched).toBe(1);
    expect(r.tree.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect((r.tree[1] as Record<string, unknown>).v).toBe(2);
    expect((tree[1] as Record<string, unknown>).v).toBe(1);
    expect(r.tree[0]).toBe(tree[0]);
  });

  it("không có gì đổi thì trả nguyên tham chiếu tree", () => {
    expect(patchTreeLines(tree, [], []).tree).toBe(tree);
  });

  it("dòng bị xoá (yêu cầu nhưng không trả về) thì needsRefetch", () => {
    expect(patchTreeLines(tree, [], ["c"]).needsRefetch).toBe(true);
  });

  it("dòng mới thuộc nhánh trong tree thì needsRefetch; nhánh ngoài (sheet khác) thì bỏ qua", () => {
    expect(patchTreeLines(tree, [n("d", "a", 2, 3)], ["d"]).needsRefetch).toBe(true);
    expect(patchTreeLines(tree, [n("z", "zz", 2, 1)], ["z"]).needsRefetch).toBe(false);
  });

  it("đổi cha/level/position thì vá nhưng đánh dấu needsRefetch", () => {
    const r = patchTreeLines(tree, [n("c", "b", 3, 1)], ["c"]);
    expect(r.needsRefetch).toBe(true);
    expect(r.patched).toBe(1);
  });
});

describe("bomPollMs", () => {
  it("5 phút khi SSE khoẻ, 60s khi không", () => {
    setBomLiveHealthy(false);
    expect(bomPollMs()).toBe(60_000);
    setBomLiveHealthy(true);
    expect(bomPollMs()).toBe(300_000);
    setBomLiveHealthy(false);
  });
});
