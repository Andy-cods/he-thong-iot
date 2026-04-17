#!/usr/bin/env node
/**
 * Generate PWA icon PNG set (+ favicon + apple-touch-icon) from a single SVG.
 *
 * Input : apps/web/public/icons/icon-source.svg
 * Output: apps/web/public/icons/icon-{192,256,384,512}.png
 *         apps/web/public/icons/icon-maskable-512.png (15% safe-zone padding)
 *         apps/web/public/apple-touch-icon.png (180x180)
 *         apps/web/public/favicon.ico (single 32x32 PNG inside ICO container)
 *
 * Requires: sharp (installed at repo root as devDependency).
 * Usage   : node scripts/generate-icons.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const srcSvg = resolve(repoRoot, "apps/web/public/icons/icon-source.svg");
const iconsDir = resolve(repoRoot, "apps/web/public/icons");
const publicDir = resolve(repoRoot, "apps/web/public");

if (!existsSync(srcSvg)) {
  console.error(`[generate-icons] Missing source SVG: ${srcSvg}`);
  process.exit(1);
}
if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

const svgBuffer = readFileSync(srcSvg);

const sizes = [192, 256, 384, 512];

async function renderPng(size, outPath, options = {}) {
  const { padPct = 0, bg = { r: 15, g: 23, b: 42, alpha: 1 } } = options;
  if (padPct > 0) {
    const inner = Math.round(size * (1 - padPct * 2));
    const offset = Math.round((size - inner) / 2);
    const innerBuf = await sharp(svgBuffer, { density: 384 })
      .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: bg },
    })
      .composite([{ input: innerBuf, left: offset, top: offset }])
      .png({ compressionLevel: 9 })
      .toFile(outPath);
  } else {
    await sharp(svgBuffer, { density: 384 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
  }
  return outPath;
}

(async () => {
  const results = [];

  for (const s of sizes) {
    const out = resolve(iconsDir, `icon-${s}.png`);
    await renderPng(s, out);
    results.push(out);
  }

  // Maskable icon (safe-zone ~15% padding, opaque slate-900 background)
  const maskableOut = resolve(iconsDir, "icon-maskable-512.png");
  await renderPng(512, maskableOut, { padPct: 0.15 });
  results.push(maskableOut);

  // Apple touch icon 180x180
  const appleOut = resolve(publicDir, "apple-touch-icon.png");
  await renderPng(180, appleOut);
  results.push(appleOut);

  // Favicon.ico (single 32x32 PNG wrapped in ICO header — browsers accept this)
  const fav32 = await sharp(svgBuffer, { density: 256 })
    .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const icoBuf = wrapPngAsIco(fav32, 32);
  const favOut = resolve(publicDir, "favicon.ico");
  writeFileSync(favOut, icoBuf);
  results.push(favOut);

  console.log("[generate-icons] Done:");
  for (const f of results) console.log("  -", f);
})().catch((err) => {
  console.error("[generate-icons] Failed:", err);
  process.exit(1);
});

/**
 * Wrap a PNG buffer (square, size<=256) into a minimal ICO container.
 * ICO header (6 bytes) + 1 ICONDIRENTRY (16 bytes) + PNG data.
 */
function wrapPngAsIco(pngBuf, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type=1 (ICO)
  header.writeUInt16LE(1, 4);      // count=1

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2);          // color palette
  entry.writeUInt8(0, 3);          // reserved
  entry.writeUInt16LE(1, 4);       // color planes
  entry.writeUInt16LE(32, 6);      // bpp
  entry.writeUInt32LE(pngBuf.length, 8);   // size of image data
  entry.writeUInt32LE(6 + 16, 12); // offset to image data

  return Buffer.concat([header, entry, pngBuf]);
}
