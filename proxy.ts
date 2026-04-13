import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes (landing page, auth, marketing)
  const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/invite", "/api/auth", "/api/webhooks", "/api/health", "/api/debug", "/api/invite", "/api/client-portal/register"];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
  const isLandingPage = pathname === "/";

  if (isPublicPath || isLandingPage) {
    return NextResponse.next();
  }

  // Client portal with token - allow (pages + API)
  if (pathname.startsWith("/client-portal/") && !pathname.startsWith("/client-portal/dashboard")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/client-portal/")) {
    return NextResponse.next();
  }

  // Check auth — explicitly pass secret for Edge Runtime compatibility
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: request.nextUrl.protocol === "https:",
  });

  if (!token) {
    const isClientPortal = pathname.startsWith("/client-portal");
    const loginUrl = isClientPortal ? "/client-portal/login" : "/login";
    return NextResponse.redirect(new URL(loginUrl, request.url));
  }

  // Client users can only access client portal
  if (token.isClientUser && !pathname.startsWith("/client-portal") && !pathname.startsWith("/api/client-portal")) {
    return NextResponse.redirect(new URL("/client-portal/dashboard", request.url));
  }

  // Internal users: check subscription status for non-admin routes
  if (!token.isClientUser && !pathname.startsWith("/admin/billing") && !pathname.startsWith("/api/")) {
    // Subscription check is handled at the layout level to avoid DB calls in middleware
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
