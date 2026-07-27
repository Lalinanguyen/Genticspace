import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The deployed site is home-page-only for now: every other route redirects
// back to "/". Static assets and Next's own internals are excluded via the
// matcher below so the home page itself still loads correctly. Only applies
// in production (the Dockerfile sets NODE_ENV=production for the deployed
// runner) so the rest of the app is still browsable via `next dev` locally.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  const { pathname } = request.nextUrl;
  if (pathname !== "/") {
    return NextResponse.redirect(new URL("/", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|assets|favicon.ico|icon.svg).*)"],
};
