"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Bouncer used by share notifications and emails so that a click
// always lands the recipient on the exact Job they were shared,
// even when they have memberships on multiple Clients.
//
// Inputs (query string):
//   clientId — Client the share is scoped to (required for the switch)
//   jobId    — Job to open after the switch (optional; falls back to dashboard)
//   path     — explicit destination (overrides the jobId-based default)
//
// Flow: switch the cp-client cookie via /api/client-portal/switch-client,
// then redirect to the resolved destination. If the user isn't logged in
// at all, middleware bounces them to /client-portal/login with this URL
// as callbackUrl so we resume here after they sign in.
function ClientPortalGoInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clientId = params.get("clientId");
    const jobId = params.get("jobId");
    const explicitPath = params.get("path");
    const destination =
      explicitPath ||
      (jobId ? `/client-portal/jobs/${jobId}` : "/client-portal/dashboard");

    async function run() {
      if (!clientId) {
        window.location.replace(destination);
        return;
      }
      try {
        const res = await fetch("/api/client-portal/switch-client", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId }),
        });
        if (!res.ok && res.status !== 403) {
          // 403 = not a member of that Client (e.g. recruiter sent to
          // the wrong address). Still send them somewhere sensible.
          throw new Error("Switch failed");
        }
        // Hard navigation so getClientContext re-resolves the cookie.
        window.location.replace(destination);
      } catch {
        setError("We couldn't open that share. Taking you to the dashboard…");
        setTimeout(() => router.replace("/client-portal/dashboard"), 1500);
      }
    }
    run();
  }, [params, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-500">
          {error || "Opening the candidates shared with you…"}
        </p>
      </div>
    </div>
  );
}

export default function ClientPortalGoPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <ClientPortalGoInner />
    </Suspense>
  );
}
