// Server-side Sentry init. Loaded by instrumentation.ts at boot when
// NEXT_RUNTIME === "nodejs". DSN comes from SENTRY_DSN — leave it
// unset locally to silence reporting in dev. tracesSampleRate is kept
// low (10%) for now; bump to 1.0 if you need full perf traces.
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  // Only emit in environments where we actually want noise — `production`
  // (Vercel) and `preview`. Set SENTRY_ENABLE_DEV=1 if you want to test
  // locally against a real Sentry project.
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.SENTRY_ENABLE_DEV === "1",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // The default integrations capture unhandled rejections, console errors,
  // and HTTP context. No extras needed for the MVP.
  beforeSend: scrubSentryEvent,
});
