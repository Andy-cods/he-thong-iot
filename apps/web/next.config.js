/** @type {import('next').NextConfig} */
const { execSync } = require("child_process");

// ---------------------------------------------------------------------------
// Build info injection (design-spec §7.3 / impl-plan §6.4)
// ---------------------------------------------------------------------------
// NEXT_PUBLIC_BUILD_SHA   — short commit hash (7-char), fallback "dev"
// NEXT_PUBLIC_BUILD_DATE  — ISO 2026-04-17 date (YYYY-MM-DD), fallback today
// NEXT_PUBLIC_BUILD_VERSION — semver from package.json
//
// Nguồn ưu tiên: env (Docker/CI đã set) → git CLI → static fallback.
// Wrap trong try/catch vì build container có thể không có git.

function resolveBuildSha() {
  if (process.env.NEXT_PUBLIC_BUILD_SHA) return process.env.NEXT_PUBLIC_BUILD_SHA;
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

function resolveBuildDate() {
  if (process.env.NEXT_PUBLIC_BUILD_DATE) return process.env.NEXT_PUBLIC_BUILD_DATE;
  return new Date().toISOString().slice(0, 10);
}

const buildSha = resolveBuildSha();
const buildDate = resolveBuildDate();
const buildVersion = require("./package.json").version;

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https?.*\/api\/(health|ready)$/,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /^https?.*\/_next\/static\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif|ico)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
  ],
});

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_DATE: buildDate,
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
  // standalone output cần symlink (Windows chưa-admin không tạo được).
  // Dockerfile set BUILD_STANDALONE=1 để bật cho production image.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" } : {}),
  transpilePackages: ["@iot/db", "@iot/shared"],
  experimental: {
    serverComponentsExternalPackages: ["postgres", "argon2"],
  },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    // Allow ESM ".js" imports inside workspace TS sources to resolve to .ts/.tsx
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // V1.8 Batch 1 — backward-compat redirects:
  // - /eco + /shortage gộp vào BOM workspace BottomPanel → redirect về /bom.
  // - /product-lines gộp vào /items (Danh mục vật tư).
  // Các sub-route deep-link trong BOM workspace (/bom/[id]/eco, /shortage)
  // giữ nguyên — KHÔNG match ở đây (chỉ match top-level prefix).
  async redirects() {
    return [
      { source: "/eco", destination: "/bom", permanent: false },
      { source: "/eco/:path*", destination: "/bom", permanent: false },
      { source: "/shortage", destination: "/bom", permanent: false },
      { source: "/shortage/:path*", destination: "/bom", permanent: false },
      { source: "/product-lines", destination: "/items", permanent: false },
      { source: "/product-lines/:path*", destination: "/items", permanent: false },
    ];
  },
};

module.exports = withPWA(nextConfig);
