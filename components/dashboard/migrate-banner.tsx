"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Upload, X } from "lucide-react";

const DISMISS_KEY_PREFIX = "migrate-banner-dismissed:";
const LEGACY_DISMISS_KEY = "migrate-banner-dismissed";

// First-week banner that nudges fresh agencies to bring their existing
// roster over from another ATS via the import wizard. Dismissable;
// state lives in localStorage so we don't burn a schema column on a
// purely client-side preference.
//
// Dismiss state is scoped by orgId: a recruiter who dismissed it once
// in a previous workspace (or in a QA test org) won't have that flag
// silently block the banner in a different workspace on the same
// browser. Per-org scoping was the bug: a global flag made the banner
// invisible after the first dismiss across every future org.
//
// The parent server component controls whether to render at all
// (based on org age); this just owns the dismissed/visible toggle.
export function MigrateBanner({
  daysSinceSignup,
  orgId,
}: {
  daysSinceSignup: number;
  orgId: string;
}) {
  // On day 0 — the literal first day of the org — we force the banner
  // on regardless of any stored dismiss state. A user can't have
  // genuinely engaged with the suggestion in the time it took to
  // bounce from /register to /dashboard, so an early-state dismiss
  // flag (legacy global, stale from a previous QA run, leftover
  // browser state, etc.) is more likely noise than a real preference.
  // From day 1 onwards we honor the user's dismiss again.
  const forceShow = daysSinceSignup <= 0;
  const [dismissed, setDismissed] = useState(!forceShow);
  const key = `${DISMISS_KEY_PREFIX}${orgId}`;

  useEffect(() => {
    try {
      // One-time cleanup of the old unscoped flag so it doesn't leak
      // forward — we don't honor it as a dismiss because that was the
      // exact bug we're fixing here.
      window.localStorage.removeItem(LEGACY_DISMISS_KEY);
      if (forceShow) {
        // Also clear the per-org flag on day 0: a fresh org should
        // not carry over a dismiss from any earlier session.
        window.localStorage.removeItem(key);
        setDismissed(false);
        return;
      }
      setDismissed(window.localStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key, forceShow]);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {}
  }

  const daysLeft = Math.max(0, 7 - daysSinceSignup);

  return (
    <div className="bg-gradient-to-r from-cyan-50 via-sky-50 to-indigo-50 border border-sky-200 rounded-2xl p-5 relative">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        title="Dismiss"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-4 pr-6">
        <div className="p-2.5 bg-sky-100 rounded-xl shrink-0">
          <Upload className="w-5 h-5 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sky-900">Coming from another ATS?</p>
          <p className="text-sm text-sky-800/80 mt-0.5">
            Bring your candidates, clients, and open searches over in one shot — CSV or TSV from Bullhorn, JobAdder,
            Loxo, Crelate, or wherever you live today. The mapping wizard handles renamed columns.
          </p>
          <div className="flex items-center gap-3 mt-3">
            <Link
              href="/import"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Start importing
              <ArrowRight className="h-3 w-3" />
            </Link>
            <span className="text-[11px] text-sky-700/70">
              {daysLeft > 0
                ? `Your first week — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
                : "Migrate any time"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
