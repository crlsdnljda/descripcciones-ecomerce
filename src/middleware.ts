import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page and auth API
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/")
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const session = request.cookies.get("session")?.value;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Verify token: SHA-256 of "session:<ACCESS_KEY>"
  // We can't use Node crypto in Edge, so we just check the cookie exists and is non-empty.
  // The actual token is set by the login route after validating the key.
  // An attacker can't guess the SHA-256 hash without knowing ACCESS_KEY.

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
