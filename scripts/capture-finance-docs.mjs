// scripts/capture-finance-docs.mjs
//
// Chụp ảnh màn hình tự động cho tài liệu hướng dẫn phân hệ Tài chính
// (docs/huong-dan-tai-chinh.md). Chạy lại script này khi UI đổi để cập nhật
// ảnh mà không cần chụp tay.
//
// Cách chạy:
//   node scripts/capture-finance-docs.mjs
//
// Yêu cầu: đã cài `playwright` (devDependency của apps/web) +
// `npx playwright install chromium` đã tải trình duyệt.
//
// Output: docs/images/finance/*.png (1440x900, full-page trừ khi ghi chú).

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../docs/images/finance");
const BASE_URL = process.env.MES_BASE_URL || "https://mes.songchau.vn";
const USERNAME = process.env.MES_USERNAME || "admin";
const PASSWORD = process.env.MES_PASSWORD || "ChangeMe!234";

fs.mkdirSync(OUT_DIR, { recursive: true });

async function shot(page, name, { fullPage = true } = {}) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage });
  console.log(`  -> ${name}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  console.log("1) Đăng nhập...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // chờ animation login card
  await shot(page, "01-dang-nhap.png");

  await page.fill("#username", USERNAME);
  await page.fill("#password", PASSWORD);
  await shot(page, "02-dien-tai-khoan.png");

  await Promise.all([
    page.waitForURL(/\/(?!login)/, { timeout: 20000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);

  console.log("2) Vào Bộ phận Thu mua > Tài chính...");
  await page.goto(`${BASE_URL}/sales?tab=fin-overview`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "03-vao-tai-chinh-tong-quan.png");

  // Zoom vào thanh tab cấp 1 để minh hoạ 5 tab
  const tabNav = page.locator("nav[aria-label='Purchasing sections'], [aria-label='Purchasing sections']").first();
  if (await tabNav.count()) {
    await shot(page, "04-thanh-tab-cap-1.png", { fullPage: false });
  } else {
    await shot(page, "04-thanh-tab-cap-1.png");
  }

  console.log("3) Sổ quỹ > Thu chi...");
  await page.goto(`${BASE_URL}/sales?tab=fin-cashbook&sub=transactions`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "05-so-quy-thu-chi.png");

  // Mở form "Phiếu chi" (ghi khoản chi không hoá đơn)
  const btnPhieuChi = page.getByRole("button", { name: /Phiếu chi/i });
  if (await btnPhieuChi.count()) {
    await btnPhieuChi.first().click();
    await page.waitForTimeout(500);
    await shot(page, "06-form-phieu-chi.png", { fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // Click 1 dòng giao dịch để mở drawer chi tiết
  const firstTxRow = page.locator("table tbody tr").first();
  if (await firstTxRow.count()) {
    await firstTxRow.click();
    await page.waitForTimeout(600);
    await shot(page, "07-chi-tiet-giao-dich-drawer.png", { fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // Wizard nhập Excel
  const btnImport = page.getByRole("button", { name: /Nhập từ Excel/i });
  if (await btnImport.count()) {
    await btnImport.first().click();
    await page.waitForTimeout(500);
    await shot(page, "08-nhap-excel-wizard.png", { fullPage: false });
    await btnImport.first().click(); // đóng lại
    await page.waitForTimeout(300);
  }

  console.log("4) Sổ quỹ > Hoá đơn...");
  await page.goto(`${BASE_URL}/sales?tab=fin-cashbook&sub=invoices`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "09-so-quy-hoa-don.png");

  const btnHDVao = page.getByRole("button", { name: /HĐ đầu vào/i });
  if (await btnHDVao.count()) {
    await btnHDVao.first().click();
    await page.waitForTimeout(500);
    await shot(page, "10-form-tao-hoa-don.png", { fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  const firstInvRow = page.locator("table tbody tr").first();
  if (await firstInvRow.count()) {
    await firstInvRow.click();
    await page.waitForTimeout(600);
    await shot(page, "11-chi-tiet-hoa-don-drawer.png", { fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  console.log("5) Sổ quỹ > Thanh toán...");
  await page.goto(`${BASE_URL}/sales?tab=fin-cashbook&sub=payments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "12-so-quy-thanh-toan.png");

  const btnGhiNhanTT = page.getByRole("button", { name: /Ghi nhận thanh toán/i });
  if (await btnGhiNhanTT.count()) {
    await btnGhiNhanTT.first().click();
    await page.waitForTimeout(500);
    await shot(page, "13-form-ghi-nhan-thanh-toan.png", { fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // Mở rộng 1 dòng thanh toán để xem phân bổ
  const firstPaymentCard = page.locator("button:has-text('·')").first();
  if (await firstPaymentCard.count()) {
    await firstPaymentCard.click();
    await page.waitForTimeout(500);
    await shot(page, "14-thanh-toan-xem-phan-bo.png", { fullPage: false });
  }

  console.log("6) Công nợ & Thiết lập > Công nợ (Phải trả)...");
  await page.goto(`${BASE_URL}/sales?tab=fin-settle&sub=receivables`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "15-cong-no-phai-tra.png");

  const btnPhaiThu = page.getByRole("button", { name: /Phải thu/i });
  if (await btnPhaiThu.count()) {
    await btnPhaiThu.first().click();
    await page.waitForTimeout(700);
    await shot(page, "16-cong-no-phai-thu.png");
  }

  console.log("7) Công nợ & Thiết lập > Tài khoản...");
  await page.goto(`${BASE_URL}/sales?tab=fin-settle&sub=accounts`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "17-tai-khoan-giao-dich.png");

  const btnThemTK = page.getByRole("button", { name: /Thêm tài khoản/i });
  if (await btnThemTK.count()) {
    await btnThemTK.first().click();
    await page.waitForTimeout(500);
    await shot(page, "18-form-them-tai-khoan.png", { fullPage: false });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  console.log("8) Công nợ & Thiết lập > Danh mục...");
  await page.goto(`${BASE_URL}/sales?tab=fin-settle&sub=categories`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shot(page, "19-danh-muc-thu-chi.png");

  console.log("9) Tổng quan Tài chính (biểu đồ)...");
  await page.goto(`${BASE_URL}/sales?tab=fin-overview`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await shot(page, "20-tong-quan-bieu-do.png");

  await browser.close();
  console.log("\nXong. Ảnh lưu tại:", OUT_DIR);
}

main().catch((err) => {
  console.error("LỖI khi chụp ảnh:", err);
  process.exit(1);
});
