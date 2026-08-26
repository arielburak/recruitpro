import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";

// NextAuth maneja todo el flow OAuth + credentials desde este catch-all.
// El POST en particular sirve a /callback/credentials que es el endpoint
// que un atacante usaría para brute-forcear passwords. Lo envolvemos
// para aplicar rate limit ANTES de que NextAuth corra bcrypt (que es
// el bottleneck — sin esto un atacante quema CPU del server por nada).
//
// Otros POSTs de NextAuth (signout, csrf) no se rate-limitean porque
// son legítimos y de bajo costo.

const nextAuthHandler = NextAuth(authOptions) as (
  req: Request,
  ctx: { params: Promise<{ nextauth: string[] }> },
) => Promise<Response>;

export const GET = nextAuthHandler;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ nextauth: string[] }> },
) {
  const url = new URL(request.url);
  // Match /api/auth/callback/credentials Y /api/auth/callback/client-credentials.
  // El path completo es "/api/auth/callback/<provider-id>".
  const isCredentialsCallback =
    url.pathname.endsWith("/callback/credentials") ||
    url.pathname.endsWith("/callback/client-credentials");

  if (isCredentialsCallback) {
    const rl = await checkRateLimit("auth:login", getClientIp(request));
    if (!rl.success) {
      // 429 antes de que NextAuth corra bcrypt — el atacante no quema
      // CPU del server, y el legitimate user ve un error claro en
      // lugar del "Invalid credentials" genérico.
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a minute." },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }
  }

  return nextAuthHandler(request, ctx);
}
