"use client";

/**
 * V4.1 UI-04 — Lưới an toàn cuối cùng: lỗi ngay trong root layout.
 *
 * Next thay THẾ toàn bộ <html> bằng component này nên không dùng được Tailwind
 * config/theme của app — viết style inline tối giản, không phụ thuộc gì.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fafafa",
          color: "#18181b",
          padding: 16,
        }}
      >
        <div role="alert" style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            Hệ thống đang gặp lỗi
          </h1>
          <p style={{ fontSize: 14, color: "#52525b", lineHeight: 1.5, margin: "0 0 16px" }}>
            Không tải được giao diện. Hãy thử tải lại trang; nếu lỗi vẫn còn, báo
            cho quản trị viên.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#71717a", fontFamily: "monospace", margin: "0 0 16px" }}>
              Mã lỗi: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              height: 40,
              padding: "0 16px",
              border: 0,
              borderRadius: 6,
              background: "#4f46e5",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
