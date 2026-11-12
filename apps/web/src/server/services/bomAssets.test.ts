import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tmp, rows, counter } = vi.hoisted(() => ({
  tmp: require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "bomassets-")) as string,
  rows: [] as Array<{ id: string; sha256: string }>,
  counter: { inserts: 0 },
}));
vi.mock("@/lib/env", () => ({ env: { UPLOAD_DIR: tmp } }));

vi.mock("@/lib/db", () => {
  const sel = () => ({
    from: () => ({ where: () => ({ limit: async () => (rows.length ? [rows[rows.length - 1]] : []) }) }),
  });
  return {
    db: {
      select: sel,
      insert: () => ({
        values: (v: { sha256: string }) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              counter.inserts++;
              const row = { id: `00000000-0000-4000-8000-00000000000${counter.inserts}`, sha256: v.sha256 };
              rows.push(row);
              return [row];
            },
          }),
        }),
      }),
    },
  };
});

import { saveImage } from "./bomAssets";

describe("bomAssets.saveImage", () => {
  beforeEach(() => {
    rows.length = 0;
    counter.inserts = 0;
  });

  it("ghi gốc + thumb webp, lần 2 cùng nội dung dedup (không ghi/insert lại)", async () => {
    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#336699" },
    })
      .png()
      .toBuffer();
    const a = await saveImage(png);
    expect(a.sha256).toHaveLength(64);
    expect(a.thumbUrl).toBe(`/api/bom/assets/${a.id}?size=thumb`);
    expect(a.fullUrl).toBe(`/api/bom/assets/${a.id}?size=full`);
    expect(existsSync(path.join(tmp, "bom", "full", `${a.sha256}.png`))).toBe(true);
    const thumbPath = path.join(tmp, "bom", "thumb", `${a.sha256}.webp`);
    expect(existsSync(thumbPath)).toBe(true);
    const tm = await sharp(thumbPath).metadata();
    expect(tm.format).toBe("webp");
    expect(Math.max(tm.width!, tm.height!)).toBeLessThanOrEqual(96);

    const b = await saveImage(png);
    expect(b.id).toBe(a.id);
    expect(counter.inserts).toBe(1);
    expect(readdirSync(path.join(tmp, "bom", "full"))).toHaveLength(1);
  });
});
