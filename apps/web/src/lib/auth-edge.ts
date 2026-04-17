/**
 * Edge-safe subset của auth: chỉ dùng `jose` (Web Crypto), không đụng argon2
 * hay fs. Dùng riêng cho middleware.ts chạy Edge runtime.
 */
import { jwtVerify } from "jose";
import type { JwtPayload } from "@iot/shared";

export const AUTH_COOKIE_NAME = "iot_session";

const encoder = new TextEncoder();

export async function verifyAccessTokenEdge(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      issuer: "he-thong-iot",
      audience: "iot-web",
      algorithms: ["HS256"],
    });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}
