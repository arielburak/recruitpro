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
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
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
