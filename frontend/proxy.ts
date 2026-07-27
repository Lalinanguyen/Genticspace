import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The deployed site is home-page-only for now: every other route redirects
// back to "/". Static assets and Next's own internals are excluded via the
// matcher below so the home page itself still loads correctly.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/") {
    return NextResponse.redirect(new URL("/", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|assets|favicon.ico|icon.svg).*)"],
};
