import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The deployed site is home-page-only for now, except for the path sandbox
// mode needs end to end: log in, an agent's own page, and its run console.
// Everything else (general marketplace browsing, settings, contribute,
// contact, etc.) still redirects back to "/". Static assets and Next's own
// internals are excluded via the matcher below.
const ALLOWED_EXACT = new Set(["/", "/sandbox", "/create-account"]);
const ALLOWED_PATTERNS = [/^\/u\/[^/]+$/, /^\/marketplace\/[^/]+(\/try)?$/];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const allowed = ALLOWED_EXACT.has(pathname) || ALLOWED_PATTERNS.some((re) => re.test(pathname));
  if (!allowed) {
    return NextResponse.redirect(new URL("/", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|assets|favicon.ico|icon.svg).*)"],
};
