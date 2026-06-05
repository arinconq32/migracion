import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { verifyAuthToken } from "@/lib/authSession";

const PUBLIC_PATHS = ["/signin", "/signup"];
const ADMIN_ONLY_PREFIX = "/crm/reportes-chats";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/chat-embed") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyAuthToken(token) : null;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!session && !isPublic) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/signin";
    signInUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(signInUrl);
  }

  if (session && isPublic) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/chats";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  if (
    session &&
    pathname.startsWith(ADMIN_ONLY_PREFIX) &&
    session.role !== "administrador"
  ) {
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = "/chats";
    deniedUrl.search = "";
    return NextResponse.redirect(deniedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
