/**
 * V4.1 TC-27 — nhận diện loại chứng từ bằng magic bytes (không tin MIME client).
 */
import { describe, expect, it, vi } from "vitest";
import { sniffAttachmentMime } from "./attachments";

vi.mock("@/lib/env", () => ({ env: { UPLOAD_DIR: "./uploads-test" } }));

const bytes = (...xs: Array<number | string>) =>
  Uint8Array.from(
    xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])),
  );

describe("sniffAttachmentMime", () => {
  it("nhận đúng JPEG / PNG / WEBP / PDF / HEIC", () => {
    expect(sniffAttachmentMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(sniffAttachmentMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffAttachmentMime(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffAttachmentMime(bytes("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffAttachmentMime(bytes(0, 0, 0, 0x18, "ftypheic", 0, 0))).toBe("image/heic");
  });
  it("HTML/SVG giả đuôi ảnh → null (bị từ chối)", () => {
    expect(sniffAttachmentMime(bytes("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffAttachmentMime(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffAttachmentMime(new Uint8Array())).toBeNull();
  });
});
