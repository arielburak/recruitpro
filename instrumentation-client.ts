// Browser-side Sentry init. Next 16 loads this file before React
// hydration (see node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation-client.md). We also export
// onRouterTransitionStart so client-side route changes appear as
// breadcrumbs / are captured in the perf trace.
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: parseFloat(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"
  ),
  // Session Replay is OFF by default — it's the most expensive feature
  // on the free tier. Flip NEXT_PUBLIC_SENTRY_REPLAY=1 to turn it on
  // and we'll only sample 10% of normal sessions / 100% with errors.
  replaysSessionSampleRate:
    process.env.NEXT_PUBLIC_SENTRY_REPLAY === "1" ? 0.1 : 0,
  replaysOnErrorSampleRate:
    process.env.NEXT_PUBLIC_SENTRY_REPLAY === "1" ? 1.0 : 0,
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_SENTRY_ENABLE_DEV === "1",
  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  integrations:
    process.env.NEXT_PUBLIC_SENTRY_REPLAY === "1"
      ? [
          Sentry.replayIntegration({
            maskAllText: false,
            blockAllMedia: false,
          }),
        ]
      : [],
  beforeSend: scrubSentryEvent,
});

// Required by @sentry/nextjs >= 8 so client-side navigations get
// attached to the active transaction.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
