import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// V2 — chỉ Inter + JetBrains Mono (bỏ Be Vietnam Pro).
// Inter features: cv11 (alt i/l), ss01 (open digits), cv02 (alt single-story a).
const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mes.songchau.vn";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "IoT Xưởng cơ khí — BOM MES",
    template: "%s · IoT Xưởng",
  },
  description:
    "Hệ thống MES/ERP nhẹ, BOM-centric cho xưởng cơ khí Việt Nam. V1 thay thế Excel.",
  applicationName: "IoT Xưởng cơ khí",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: siteUrl,
    siteName: "IoT Xưởng cơ khí",
    title: "IoT Xưởng cơ khí — BOM MES",
    description:
      "Hệ thống quản lý BOM, đơn hàng và kho cho xưởng cơ khí Việt Nam.",
  },
  twitter: {
    card: "summary_large_image",
    title: "IoT Xưởng cơ khí — BOM MES",
    description: "Quản lý xưởng cơ khí BOM-centric.",
  },
  appleWebApp: {
    capable: true,
    title: "IoT Xưởng",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#18181B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <a href="#main" className="skip-link">
          Bỏ qua, đến nội dung chính
        </a>
        <Providers>
          <main id="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
