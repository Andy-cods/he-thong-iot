import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, verifyAccessTokenEdge } from "./lib/auth-edge";

/**
 * Protect mọi UI route (trừ /login).
 *
 * API routes tự verify JWT bên trong handler (để trả JSON 401 thay vì redirect).
 *
 * Middleware chạy Edge runtime nên KHÔNG import argon2/fs. JWT secret đọc
 * trực tiếp từ process.env.JWT_SECRET (Next Edge expose biến non-secret OK,
 * và deployment compose set env inline cho container).
 */
/**
 * Trang public (không cần đăng nhập). Mọi trang UI khác đều bắt buộc có JWT.
 * Trước đây dùng whitelist PROTECTED_PREFIXES + matcher liệt kê tay → thiếu
 * /production-board, /board, /me, /finance, /import… khiến header x-pathname
 * không được set → route guard theo role trong (app)/layout bị bỏ qua.
 */
const PUBLIC_PREFIXES = ["/login"];

function isProtected(pathname: string): boolean {
  return !PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
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
  // Chạy cho MỌI trang UI (trừ API, asset tĩnh, file có đuôi mở rộng) để
  // x-pathname luôn được set bởi server — client không thể tự gửi header giả.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
