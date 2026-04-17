/**
 * UUID v7 generator — timestamp-prefixed để sort FIFO theo thời gian tạo.
 *
 * Reference: draft-ietf-uuidrev-rfc4122bis-14 §5.7.
 * Cần cho offline scan queue (brainstorm-deep §2.5 D19/D20): idempotent event_id
 * + client-generated + sort khớp thứ tự quét.
 *
 * Cấu trúc 128-bit:
 *   unix_ts_ms[48] | ver=0x7[4] | rand_a[12] | var=0b10[2] | rand_b[62]
 */

function rng(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(buf);
  } else {
    // Fallback Math.random (không cryptographic) — chỉ dùng khi SSR build.
    for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

function toHex(n: number, len: number): string {
  return n.toString(16).padStart(len, "0");
}

/**
 * Sinh 1 UUID v7 dưới dạng chuỗi hex có dấu `-`:
 *   "0190b5d6-c2e7-7xxx-yxxx-xxxxxxxxxxxx"
 */
export function uuidv7(now: number = Date.now()): string {
  const rand = rng(10);
  // 48 bit timestamp
  const timeHigh = Math.floor(now / 0x100000000) & 0xffff;
  const timeLow = now >>> 0;

  // 4 bit version (0x7) + 12 bit random
  const randA = ((rand[0]! << 8) | rand[1]!) & 0x0fff;
  const versionAndRandA = 0x7000 | randA;

  // 2 bit variant (0b10) + 14 bit random
  const randB0 = ((rand[2]! << 8) | rand[3]!) & 0x3fff;
  const variantAndRandB0 = 0x8000 | randB0;

  // 48 bit random còn lại
  const tail = Array.from(rand.slice(4))
    .map((b) => toHex(b, 2))
    .join("");

  const s1 = toHex(Math.floor(timeHigh * 0x10000 + (timeLow >>> 16)), 8);
  const s2 = toHex(timeLow & 0xffff, 4);
  const s3 = toHex(versionAndRandA, 4);
  const s4 = toHex(variantAndRandB0, 4);
  return `${s1}-${s2}-${s3}-${s4}-${tail}`;
}
