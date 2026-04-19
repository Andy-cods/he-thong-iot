/**
 * Generate temp password 12 ký tự — mix lower/upper/digit + 1 special.
 *
 * Dùng crypto.getRandomValues (Node 18+) để bảo đảm entropy.
 * Output luôn bao gồm: ≥1 chữ thường, ≥1 chữ hoa, ≥1 số, 1 ký tự đặc biệt.
 */

import crypto from "node:crypto";

const LOWER = "abcdefghijkmnpqrstuvwxyz"; // bỏ l/o để tránh nhầm
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // bỏ I/O
const DIGIT = "23456789"; // bỏ 0/1 để tránh nhầm với O/l
const SPECIAL = "!@#$%&*";

function pick(pool: string): string {
  const idx = crypto.randomInt(0, pool.length);
  return pool.charAt(idx);
}

function shuffle(str: string): string {
  const chars = str.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join("");
}

export function generateTempPassword(length = 12): string {
  if (length < 8) throw new Error("Password length phải ≥ 8");

  // Đảm bảo có đủ 4 nhóm
  const mandatory = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SPECIAL)];

  const pool = LOWER + UPPER + DIGIT;
  const rest: string[] = [];
  for (let i = 0; i < length - mandatory.length; i++) {
    rest.push(pick(pool));
  }

  return shuffle([...mandatory, ...rest].join(""));
}
