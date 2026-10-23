import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSessionId, SESSION_COOKIE } from "@/lib/session";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") return NextResponse.next();
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (isSessionId(sessionId)) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|icon.svg|manifest.webmanifest|sw.js).*)",
  ],
};
