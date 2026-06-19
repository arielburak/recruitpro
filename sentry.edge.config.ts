// Edge-runtime Sentry init. Loaded by instrumentation.ts at boot when
// NEXT_RUNTIME === "edge" (proxy.ts / route segments with runtime="edge").
// Same DSN as the server config; the Edge SDK has a smaller surface
// because most Node-only integrations aren't available.
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.SENTRY_ENABLE_DEV === "1",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  beforeSend: scrubSentryEvent,
});
