import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyAccessTokenEdge } from "./lib/auth-edge";

/**
 * Protect UI routes có state auth: `/` (Dashboard), `/items`, `/suppliers`,
 * `/imports`, `/app` (legacy).
 *
 * API routes tự verify JWT bên trong handler (để trả JSON 401 thay vì redirect).
 *
 * Middleware chạy Edge runtime nên KHÔNG import argon2/fs. JWT secret đọc
 * trực tiếp từ process.env.JWT_SECRET (Next Edge expose biến non-secret OK,
 * và deployment compose set env inline cho container).
 */
const PROTECTED_PREFIXES = ["/app", "/items", "/suppliers", "/imports"];

function isProtected(pathname: string): boolean {
  if (pathname === "/") return true; // Dashboard root
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return redirectToLogin(req);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Fail-closed: không secret tức config sai; ép về login
    return redirectToLogin(req);
  }

  const payload = await verifyAccessTokenEdge(token, secret);
  if (!payload) {
    const res = redirectToLogin(req);
    res.cookies.delete(AUTH_COOKIE_NAME);
    return res;
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/",
    "/app/:path*",
    "/items/:path*",
    "/suppliers/:path*",
    "/imports/:path*",
  ],
};
