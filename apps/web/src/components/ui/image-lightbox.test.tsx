import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImageLightbox, ZoomableThumb, nextLightboxStage } from "./image-lightbox";

describe("nextLightboxStage — thứ tự fallback", () => {
  it("full lỗi → thumb (nếu có) → failed", () => {
    expect(nextLightboxStage("full", true)).toBe("thumb");
    expect(nextLightboxStage("thumb", true)).toBe("failed");
  });
  it("không có thumb: full lỗi → failed ngay", () => {
    expect(nextLightboxStage("full", false)).toBe("failed");
  });
  it("failed giữ nguyên", () => {
    expect(nextLightboxStage("failed", true)).toBe("failed");
  });
});

describe("ZoomableThumb", () => {
  it("render nút (type=button, có aria-label) và chưa mở dialog", () => {
    const out = renderToStaticMarkup(<ZoomableThumb thumbSrc="/t.webp" fullSrc="/f.png" alt="Mã A" size={44} />);
    expect(out).toContain('type="button"');
    expect(out).toContain('aria-label="Xem ảnh lớn Mã A"');
    expect(out).toContain('src="/t.webp"');
    expect(out).not.toContain('role="dialog"');
  });
  it("ImageLightbox đóng thì không render nội dung ảnh", () => {
    const out = renderToStaticMarkup(<ImageLightbox open={false} onOpenChange={() => {}} src="/f.png" alt="A" />);
    expect(out).not.toContain("/f.png");
  });
});
