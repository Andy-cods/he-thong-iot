import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { bomAsset } from "@iot/db/schema";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * BOM V5 WP3 — kho ảnh dedup theo sha256 (content-addressed).
 * Chạy ở APP (worker không mount uploads). Gốc: UPLOAD_DIR/bom/full/{sha}.{ext},
 * thumbnail webp 96px: UPLOAD_DIR/bom/thumb/{sha}.webp. Đường dẫn lưu DB là
 * tương đối UPLOAD_DIR.
 */

export const THUMB_PX = 96;
export const FULL_MAX_PX = 1600;
const FULL_MAX_BYTES = 2 * 1024 * 1024;

export interface SavedBomAsset {
  id: string;
  sha256: string;
  thumbUrl: string;
  fullUrl: string;
}

export const bomAssetUrl = (id: string, size: "thumb" | "full") =>
  `/api/bom/assets/${id}?size=${size}`;

export function bomUploadRoot(): string {
  return path.resolve(process.cwd(), env.UPLOAD_DIR);
}

const toResult = (id: string, sha256: string): SavedBomAsset => ({
  id,
  sha256,
  thumbUrl: bomAssetUrl(id, "thumb"),
  fullUrl: bomAssetUrl(id, "full"),
});

export async function saveImage(buffer: Buffer): Promise<SavedBomAsset> {
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  const [existing] = await db
    .select({ id: bomAsset.id })
    .from(bomAsset)
    .where(eq(bomAsset.sha256, sha256))
    .limit(1);
  if (existing) return toResult(existing.id, sha256);

  const { default: sharp } = await import("sharp");
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? null;
  const h = meta.height ?? null;
  const tooBig =
    buffer.length > FULL_MAX_BYTES || (w ?? 0) > FULL_MAX_PX || (h ?? 0) > FULL_MAX_PX;

  const fullBuf = tooBig
    ? await sharp(buffer)
        .resize({ width: FULL_MAX_PX, height: FULL_MAX_PX, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer()
    : buffer;
  const fullExt = tooBig ? "png" : meta.format === "jpeg" ? "jpg" : meta.format === "webp" ? "webp" : "png";
  const mime = fullExt === "jpg" ? "image/jpeg" : `image/${fullExt}`;
  const thumbBuf = await sharp(buffer)
    .resize({ width: THUMB_PX, height: THUMB_PX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();

  const relFull = `bom/full/${sha256}.${fullExt}`;
  const relThumb = `bom/thumb/${sha256}.webp`;
  const root = bomUploadRoot();
  await mkdir(path.join(root, "bom", "full"), { recursive: true });
  await mkdir(path.join(root, "bom", "thumb"), { recursive: true });
  await writeFile(path.join(root, relFull), fullBuf);
  await writeFile(path.join(root, relThumb), thumbBuf);

  const [inserted] = await db
    .insert(bomAsset)
    .values({ sha256, mime, width: w, height: h, pathFull: relFull, pathThumb: relThumb })
    .onConflictDoNothing({ target: bomAsset.sha256 })
    .returning({ id: bomAsset.id });
  if (inserted) return toResult(inserted.id, sha256);
  // race: request khác vừa chèn cùng sha
  const [again] = await db
    .select({ id: bomAsset.id })
    .from(bomAsset)
    .where(eq(bomAsset.sha256, sha256))
    .limit(1);
  if (!again) throw new Error("bom_asset insert race: không tìm thấy bản ghi");
  return toResult(again.id, sha256);
}

/** Đọc file asset (đường dẫn trong DB do server tự sinh; vẫn chặn thoát khỏi root). */
export async function readAsset(
  id: string,
  size: "thumb" | "full",
): Promise<{ data: Buffer; mime: string } | null> {
  const [row] = await db.select().from(bomAsset).where(eq(bomAsset.id, id)).limit(1);
  if (!row) return null;
  const root = bomUploadRoot();
  const rel = size === "thumb" ? row.pathThumb : row.pathFull;
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return null;
  try {
    return { data: await readFile(abs), mime: size === "thumb" ? "image/webp" : row.mime };
  } catch {
    return null;
  }
}
