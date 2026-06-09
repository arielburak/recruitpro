"use client";

// Top-level error boundary — catches crashes in the root layout itself
// (which app/error.tsx can't, because error.tsx renders *inside* the
// root layout). Required by @sentry/nextjs to report root-layout
// failures. See https://docs.sentry.io/platforms/javascript/guides/nextjs/.

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* `NextError` renders Next's built-in 500 page so we don't have to
            duplicate styling here for an unlikely-to-be-seen page. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
