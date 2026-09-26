import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * V4.1 Đợt 3 — vitest cho apps/web. Trước đây KHÔNG có file config nên alias
 * `@/` (tsconfig paths) không resolve được trong test → mọi import `@/…` phải
 * mock. Nay alias `@` → `src` để module thuần dùng chung (VD `@/lib/finance`)
 * chạy thật trong test; các test cũ vẫn `vi.mock("@/lib/db")` như trước.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
