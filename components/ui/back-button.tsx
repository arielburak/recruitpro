"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Universal "Back" button. Uses the browser history so the user
// returns to wherever they actually came from (a Job, a search
// result list, a deep-linked filter, …) instead of always
// landing on the entity's index page.
//
// `fallback` is what we navigate to when there's no history to pop
// (direct URL load, brand-new tab, etc.). Defaults to "/dashboard"
// — every page has at least that as a safe landing spot.
type Props = {
  fallback?: string;
  label?: string;
  className?: string;
};

export function BackButton({ fallback = "/dashboard", label = "Back", className }: Props) {
  const router = useRouter();

  function handleBack() {
    // Always try the browser back first — that's the only way to land
    // exactly where the user came from (a Job, a filtered list, …)
    // instead of a generic index. If the page was opened directly
    // (no SPA entry to pop), the URL won't change after a beat and
    // we navigate to the page-specific fallback so the click isn't
    // a no-op. history.length isn't reliable enough on its own —
    // some browsers carry entries from other tabs.
    if (typeof window === "undefined") return;
    const before = window.location.pathname + window.location.search;
    router.back();
    setTimeout(() => {
      const after = window.location.pathname + window.location.search;
      if (after === before) router.push(fallback);
    }, 150);
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className={className}
      type="button"
    >
      <ArrowLeft className="h-4 w-4 mr-1" /> {label}
    </Button>
  );
}
