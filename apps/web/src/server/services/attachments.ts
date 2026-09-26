import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * TASK-20260922 — Lưu file chứng từ tài chính (ảnh/PDF hoá đơn) trên đĩa VPS.
 * R2 CHƯA cấu hình thật trên prod (endpoint vẫn là placeholder — xem
 * `apps/web/src/lib/env.ts`), nên KHÔNG dùng R2. Đơn giản, không phụ thuộc
 * dịch vụ ngoài — YAGNI cho V1.
 *
 * An toàn:
 *   - Tên file lưu LUÔN là uuid random + đuôi gốc — KHÔNG dùng tên người dùng
 *     đặt (chống path traversal + chống ghi đè/đoán tên).
 *   - `resolveAttachmentPath` validate filename khớp regex uuid+ext tuyệt đối
 *     trước khi join path — chặn `..`, `/`, null byte.
 */

const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const MAX_BYTES = 10 * 1024 * 1024; // 10MB/file theo yêu cầu

// uuid v4 (36 ký tự) + "." + đuôi 3-4 ký tự chữ thường — KHÔNG cho ký tự khác.
const SAFE_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|pdf)$/;

export class AttachmentValidationError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

function uploadRoot(): string {
  return path.resolve(process.cwd(), env.UPLOAD_DIR, "finance");
}

/**
 * V4.1 TC-27 — Nhận diện loại file bằng "magic bytes" (không tin `file.type`
 * trình duyệt gửi lên — đổi đuôi .html thành .png là qua). Trả MIME thật hoặc
 * null nếu không phải ảnh/PDF được phép.
 */
export function sniffAttachmentMime(buf: Uint8Array): string | null {
  const b = (i: number) => buf[i] ?? -1;
  const ascii = (from: number, len: number) =>
    String.fromCharCode(...Array.from(buf.subarray(from, from + len)));
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && ascii(1, 3) === "PNG" && b(4) === 0x0d && b(5) === 0x0a) return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4);
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

/** Validate MIME + size. Ném `AttachmentValidationError` nếu không hợp lệ. */
export function assertAttachmentFile(file: File): void {
  if (!(file.type in ALLOWED_MIME)) {
    throw new AttachmentValidationError(
      "Chỉ chấp nhận ảnh (JPEG/PNG/WEBP/HEIC) hoặc PDF.",
      "INVALID_FILE_TYPE",
    );
  }
  if (file.size > MAX_BYTES) {
    throw new AttachmentValidationError(
      `File vượt quá ${MAX_BYTES / 1024 / 1024}MB.`,
      "FILE_TOO_LARGE",
    );
  }
}

/**
 * Lưu file lên đĩa với tên random (uuid + đuôi gốc theo MIME thật, KHÔNG tin
 * đuôi người dùng gửi).
 *
 * LƯU Ý resize/nén ảnh (sharp): ĐÃ CÂN NHẮC nhưng BỎ QUA cho V1 — `sharp` chỉ
 * khai báo ở `devDependencies` gốc (dùng cho `scripts/generate-icons.mjs`
 * build-time), KHÔNG có trong `apps/web` runtime deps. `apps/web` chạy
 * Next.js standalone output trên VPS (chỉ bundle dependencies, không có
 * devDependencies) → import "sharp" ở đây sẽ crash lúc runtime trên prod.
 * Muốn bật resize phải thêm "sharp" vào `apps/web/package.json` dependencies
 * thật + rebuild image — để lại làm sau nếu dung lượng đĩa (46GB trống)
 * trở thành vấn đề thật (YAGNI).
 *
 * @returns URL tương đối để serve qua `GET /api/finance/attachments/[filename]`.
 */
export async function saveFinanceAttachment(file: File): Promise<{ url: string; filename: string }> {
  assertAttachmentFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  // V4.1 TC-27 — loại file theo NỘI DUNG thật, đuôi lưu theo loại thật.
  const realMime = sniffAttachmentMime(buffer);
  if (!realMime || !(realMime in ALLOWED_MIME)) {
    throw new AttachmentValidationError(
      "Nội dung file không phải ảnh (JPEG/PNG/WEBP/HEIC) hoặc PDF hợp lệ.",
      "INVALID_FILE_CONTENT",
    );
  }
  const ext = ALLOWED_MIME[realMime]!;
  const filename = `${randomUUID()}.${ext}`;
  const dir = uploadRoot();
  await mkdir(dir, { recursive: true });
  const destPath = path.join(dir, filename);

  await writeFile(destPath, buffer);
  return { url: `/api/finance/attachments/${filename}`, filename };
}

/**
 * Resolve + validate filename trước khi đọc từ đĩa. Trả `null` nếu filename
 * không khớp pattern an toàn (chặn path traversal) hoặc file không tồn tại.
 */
export async function resolveAttachmentPath(filename: string): Promise<string | null> {
  if (!SAFE_FILENAME_RE.test(filename)) return null;
  const dir = uploadRoot();
  const fullPath = path.join(dir, filename);
  // Double-check: path resolve xong vẫn phải nằm trong uploadRoot (phòng hờ
  // dù regex trên đã chặn hết `..`/`/`).
  if (!fullPath.startsWith(dir + path.sep) && fullPath !== dir) return null;
  try {
    const s = await stat(fullPath);
    if (!s.isFile()) return null;
  } catch {
    return null;
  }
  return fullPath;
}

export async function readAttachmentFile(fullPath: string): Promise<Buffer> {
  return readFile(fullPath);
}

export function contentTypeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}
