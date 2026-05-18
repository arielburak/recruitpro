"use client";

import { useState } from "react";
import { MailWarning, X } from "lucide-react";

// Soft banner shown at the top of the dashboard when the signed-in
// recruiter hasn't verified their email yet. Doesn't block any
// action — just nudges + offers a one-click resend.
export function EmailVerificationBanner({ email }: { email: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  if (dismissed) return null;

  async function resend() {
    setSending(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-amber-900 min-w-0 flex-1">
          <MailWarning className="h-4 w-4 shrink-0" />
          <p className="truncate">
            Verify your email — we sent a link to <strong>{email}</strong>.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {status === "sent" ? (
            <span className="text-xs text-emerald-700">Sent. Check your inbox.</span>
          ) : status === "error" ? (
            <span className="text-xs text-red-700">Couldn't resend.</span>
          ) : (
            <button
              onClick={resend}
              disabled={sending}
              className="text-xs font-medium text-amber-900 hover:text-amber-950 underline disabled:opacity-50"
            >
              {sending ? "Sending…" : "Resend"}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-700 hover:text-amber-900"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
