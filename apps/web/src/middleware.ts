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
const PROTECTED_PREFIXES = [
  "/app",
  "/items",
  "/suppliers",
  "/imports",
  "/pwa",
  "/admin",
  "/bom",
  "/orders",
  "/work-orders",
  "/eco",
  "/po",
  "/purchase-requests",
  "/purchase-orders",
  "/receiving",
  "/reservations",
  "/qc-checks",
  "/lot-serial",
  "/shortage",
  // V3.3 — Hub pages + module mới
  "/sales",
  "/warehouse",
  "/engineering",
  "/operations",
  "/notifications",
  "/material-requests",
  "/assembly",
  "/procurement",
];

function isProtected(pathname: string): boolean {
  if (pathname === "/") return true; // Dashboard root
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Forward pathname qua header để RSC layout đọc được (dùng cho
  // check must_change_password + sidebar active state).
  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.set("x-pathname", pathname);

  if (!isProtected(pathname)) {
    return NextResponse.next({ request: { headers: forwardHeaders } });
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

  return NextResponse.next({ request: { headers: forwardHeaders } });
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
    "/pwa/:path*",
    "/admin/:path*",
    "/bom/:path*",
    "/orders/:path*",
    "/work-orders/:path*",
    "/eco/:path*",
    "/po/:path*",
    "/purchase-requests/:path*",
    "/purchase-orders/:path*",
    "/receiving/:path*",
    "/reservations/:path*",
    "/qc-checks/:path*",
    "/lot-serial/:path*",
    "/shortage/:path*",
    // V3.3 — Hub pages + module mới
    "/sales/:path*",
    "/warehouse/:path*",
    "/engineering/:path*",
    "/operations/:path*",
    "/notifications/:path*",
    "/material-requests/:path*",
    "/assembly/:path*",
    "/procurement/:path*",
  ],
};
