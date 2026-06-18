import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets served from /public are reached at the URL root
  // (e.g. /icon.svg, /logo.svg, /robots.txt). The matcher's "public"
  // negative lookahead never fires because there is no /public prefix
  // in the real URL — so we need an explicit early return here.
  if (/\.(?:svg|png|jpe?g|gif|webp|ico|avif|bmp|tiff?|js|css|map|woff2?|ttf|eot|otf|json|xml|txt|pdf|mp4|webm|mp3|wav)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // Public routes (landing page, auth, marketing)
  const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/invite", "/privacy", "/terms", "/api/auth", "/api/webhooks", "/api/health", "/api/debug", "/api/invite", "/api/client-portal/register"];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
  const isLandingPage = pathname === "/";

  if (isPublicPath || isLandingPage) {
    return NextResponse.next();
  }

  // Client portal public pages (login, set-password, reset-password) — always allow
  const clientPublicPaths = ["/client-portal/login", "/client-portal/set-password", "/client-portal/reset-password", "/client-portal/verify-email"];
  if (clientPublicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Client portal API routes that don't need session (register,
  // verify-email + resend — the recipient has no session yet by definition).
  const clientPublicApis = ["/api/client-portal/register", "/api/client-portal/set-password", "/api/client-portal/verify-email", "/api/client-portal/resend-verification"];
  if (clientPublicApis.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check auth — explicitly pass secret for Edge Runtime compatibility
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: request.nextUrl.protocol === "https:",
  });

  if (!token) {
    const isClientPortal = pathname.startsWith("/client-portal") || pathname.startsWith("/api/client-portal");
    const loginPath = isClientPortal ? "/client-portal/login" : "/login";
    const loginUrl = new URL(loginPath, request.url);
    // Preserve the original destination so deep links survive the login
    // detour — e.g. clicking a share email at /client-portal/go?clientId=...
    // when not yet authed should resume on /go after sign-in, not dashboard.
    if (pathname.startsWith("/client-portal") && pathname !== loginPath) {
      const target = pathname + (request.nextUrl.search || "");
      loginUrl.searchParams.set("callbackUrl", target);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Shared API routes accessible to both staffing and client users
  const sharedApiRoutes = ["/api/profile"];
  const isSharedApi = sharedApiRoutes.some((p) => pathname.startsWith(p));

  // Agency-owned APIs that happen to live under /api/client-portal/* because
  // they manage client-portal data on the agency's behalf (e.g. issuing
  // set-password invites for a Client's portal account). They use
  // getOrgContext() internally, so let staffing users through — the
  // "no client-portal access for agency users" rule below would otherwise
  // 401 them.
  const agencyClientPortalApis = ["/api/client-portal/tokens"];
  const isAgencyClientPortalApi = agencyClientPortalApis.some((p) => pathname.startsWith(p));

  // Client users can only access client portal (plus shared APIs)
  if (
    token.isClientUser &&
    !pathname.startsWith("/client-portal") &&
    !pathname.startsWith("/api/client-portal") &&
    !isSharedApi
  ) {
    return NextResponse.redirect(new URL("/client-portal/dashboard", request.url));
  }

  // Staffing firm users accessing client portal → redirect to client login
  // (they need to sign out of staffing and sign in as client)
  // But allow shared APIs like /api/profile, plus agency-owned APIs that
  // happen to be namespaced under /api/client-portal/*.
  if (
    !token.isClientUser &&
    (pathname.startsWith("/client-portal") || pathname.startsWith("/api/client-portal")) &&
    !isSharedApi &&
    !isAgencyClientPortalApi
  ) {
    // For pages, redirect to client login
    if (pathname.startsWith("/client-portal")) {
      return NextResponse.redirect(new URL("/client-portal/login", request.url));
    }
    // For API calls, return 401 so the UI can handle it
    return NextResponse.json({ error: "Please sign in to the client portal" }, { status: 401 });
  }

  // Staffing users whose organization hasn't set a real company name yet
  // (e.g. fresh OAuth sign-ups) must complete onboarding before accessing
  // anything else.
  if (!token.isClientUser && token.needsOnboarding) {
    const onboardingAllowed =
      pathname === "/onboarding" ||
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/profile");
    if (!onboardingAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Please finish setting up your company." },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  } else if (!token.isClientUser && pathname === "/onboarding") {
    // Already onboarded — don't let them land back on onboarding
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Internal users: check subscription status for non-admin routes
  if (!token.isClientUser && !pathname.startsWith("/admin/billing") && !pathname.startsWith("/api/")) {
    // Subscription check is handled at the layout level to avoid DB calls in middleware
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and any URL ending in a static asset extension
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif|js|css|map|woff2?|ttf|eot|otf|json|xml|txt|pdf|mp4|webm|mp3|wav)).*)",
  ],
};
