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
