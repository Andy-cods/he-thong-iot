import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Cell } from "./TodayBoard";
import type { BoardCell } from "@/lib/shift-output/board";

const cell: BoardCell = {
  machineId: "m1",
  shiftId: "s1",
  state: "done",
  ok: 120,
  ng: 3,
  entries: 1,
  locked: false,
  partCodes: ["A-1"],
  workRanges: [],
  images: [{ partId: "p1", partCode: "A-1", assetId: "a1" }],
};

describe("TodayBoard Cell (ô đã nhập) — ảnh ngoài <a>", () => {
  it("nút ảnh KHÔNG nằm trong thẻ <a>; <a> vẫn trỏ sang Lịch sử", () => {
    const html = renderToStaticMarkup(<Cell cell={cell} date="2026-11-20" />);
    const a = /<a [^>]*href="\/san-luong\/lich-su[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(html);
    expect(a).not.toBeNull();
    expect(a![1]).not.toContain("<button");
    expect(html).toContain('aria-label="Xem ảnh lớn A-1"');
    expect(html).toContain("120");
  });
});
