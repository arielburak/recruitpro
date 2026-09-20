import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  env: {
    // Vercel setea VERCEL_ENV solo del lado server. Para gatear UI de
    // dev en el cliente hace falta una NEXT_PUBLIC_*, y esa NO se crea
    // automáticamente: sin este mapeo valía `undefined` en el bundle y
    // los widgets dev de /settings/billing se renderizaban en
    // producción (el endpoint igual devuelve 403, pero el cliente veía
    // botones "DEV: backdate trial end" en su página de billing).
    // El fallback "development" solo aplica a `next dev` local, donde
    // VERCEL_ENV no existe. Launch audit 2026-06-26.
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "development",

    // Mismo problema que arriba: SUPPORT_EMAIL es server-only, pero las
    // páginas de forgot/reset password son client components y también
    // necesitan mostrarla. Sin este mapeo leerían undefined y caerían
    // al fallback, ignorando la env var sin avisar. Ver SUPPORT_EMAIL
    // en lib/constants.ts.
    NEXT_PUBLIC_SUPPORT_EMAIL:
      process.env.SUPPORT_EMAIL || "contact@alphabridgepartners.com",
  },

  // Security headers. Verificado 2026-08-31 que produccion solo mandaba
  // Strict-Transport-Security (lo agrega Vercel solo) — el resto no
  // estaba. Next no los pone por defecto.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // El mas importante para este producto: la app pone tokens en
          // la query string (/reset-password?token=...,
          // /client-portal/set-password?token=...&email=...). Sin
          // Referrer-Policy, el click a cualquier link externo desde esa
          // pagina manda la URL COMPLETA — token incluido — en el header
          // Referer del destino. Con strict-origin-when-cross-origin
          // solo viaja el origin.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // Clickjacking: sin esto, un atacante puede meter /login en un
          // iframe invisible sobre su propia pagina y capturar clicks.
          // Nada en el ATS necesita ser embebido (verificado: no hay un
          // solo <iframe> en el repo), asi que va DENY.
          { key: "X-Frame-Options", value: "DENY" },
          // frame-ancestors es el equivalente moderno y gana sobre
          // X-Frame-Options donde los dos aplican. Mandamos solo esta
          // directiva de CSP: una politica completa (script-src y
          // compania) necesita nonces para los inline de Next y se
          // rompe facil. Esto es el subconjunto seguro.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

          // Evita que el browser adivine el content-type e interprete
          // como script algo que servimos como otra cosa.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Nada de la app usa camara, microfono ni ubicacion.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

// `withSentryConfig` wires up source-map upload at build time and
// instruments the bundle so client errors arrive with readable stacks.
// It's a no-op at runtime when SENTRY_AUTH_TOKEN is unset, so local
// `next dev` works without any Sentry env vars.
export default withSentryConfig(nextConfig, {
  // Slug from sentry.io — set these in Vercel project env vars so
  // the build-time source map upload can authenticate.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Silence the SDK build banner in CI logs; show full output locally.
  silent: !process.env.CI,

  // Widen the client upload so chunks from the App Router get a source
  // map in Sentry. Skip the whole source-map upload step when the auth
  // token is missing (local dev, PR previews without env vars) so we
  // don't see noisy "no auth token" warnings on every build.
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
