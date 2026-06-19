import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
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
