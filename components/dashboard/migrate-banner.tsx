"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Upload, X } from "lucide-react";

const DISMISS_KEY = "migrate-banner-dismissed";

// First-week banner that nudges fresh agencies to bring their existing
// roster over from another ATS via the import wizard. Dismissable;
// state lives in localStorage so we don't burn a schema column on a
// purely client-side preference. The parent server component controls
// whether to render at all (based on org age), so this just owns the
// dismissed/visible toggle.
export function MigrateBanner({ daysSinceSignup }: { daysSinceSignup: number }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
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
