"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Thin redirect target used by share notifications and emails so a
// click always lands on the exact Job the recipient was shared. We
// used to also flip a "current Client" cookie here for multi-Client
// portal users; the email-uniqueness rule made the portal
// single-workspace, so this just resolves a destination and
// navigates. If the user isn't logged in, middleware bounces them
// to /client-portal/login with this URL as callbackUrl so we
// resume here after sign-in.
function ClientPortalGoInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const jobId = params.get("jobId");
    const explicitPath = params.get("path");
    const destination =
      explicitPath ||
      (jobId ? `/client-portal/jobs/${jobId}` : "/client-portal/dashboard");
    router.replace(destination);
  }, [params, router]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-gray-500">
          Opening the candidates shared with you…
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
