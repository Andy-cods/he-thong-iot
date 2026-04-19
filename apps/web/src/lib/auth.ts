import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import type { JwtPayload, Role } from "@iot/shared";
import { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@iot/shared";
import { env } from "./env";

// Re-export để callers hiện tại (`@/lib/auth`) không phải đổi import path.
// Nguồn duy nhất sống trong `@iot/shared/constants.ts`.
export { AUTH_COOKIE_NAME, REFRESH_COOKIE_NAME };

const encoder = new TextEncoder();
const jwtKey = () => encoder.encode(env.JWT_SECRET);

export async function hashPassword(raw: string): Promise<string> {
  return argon2.hash(raw, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  raw: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, raw);
  } catch {
    return false;
  }
}

export interface SignAccessTokenInput {
  sub: string;
  username: string;
  roles: Role[];
  /** V1.4: session row id để revoke / list active sessions. */
  sid?: string;
}

export async function signAccessToken(
  input: SignAccessTokenInput,
): Promise<string> {
  return await new SignJWT({
    usr: input.username,
    roles: input.roles,
    ...(input.sid ? { sid: input.sid } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL}s`)
    .setIssuer("he-thong-iot")
    .setAudience("iot-web")
    .sign(jwtKey());
}

export async function verifyAccessToken(
  token: string,
): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), {
      issuer: "he-thong-iot",
      audience: "iot-web",
      algorithms: ["HS256"],
    });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

/** Cookie options dùng chung cho session cookie. */
export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true as const,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});
