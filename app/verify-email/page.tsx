"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Status = "loading" | "success" | "already" | "expired" | "error";

function VerifyEmailContent() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const { update: updateSession } = useSession();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("Missing verification token.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error || "Verification failed";
          // The API returns the same generic shape whether the token
          // expired or never existed. We branch on the message string
          // so we can offer a one-click resend on the expired case.
          if (/expired/i.test(msg)) {
            setStatus("expired");
          } else {
            setStatus("error");
            setErrorMessage(msg);
          }
          return;
        }
        setStatus(data.alreadyVerified ? "already" : "success");
        // Refresh the JWT so the gated actions (invites, shares, etc.)
        // unlock immediately without a re-login. NextAuth picks this
        // up via the `update` trigger in the jwt callback.
        if (!data.alreadyVerified) {
          try {
            await updateSession({ emailVerified: true });
          } catch {}
        }
      } catch {
        setStatus("error");
        setErrorMessage("Network error. Try again.");
      }
    })();
  }, [token, updateSession]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim()) return;
    setResendState("sending");
    setResendError("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResendState("error");
        setResendError(data.error || "Couldn't send. Try again.");
        return;
      }
      setResendState("sent");
    } catch {
      setResendState("error");
      setResendError("Network error. Try again.");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        {status === "loading" && (
          <div className="space-y-3">
            <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mx-auto" />
            <p className="text-sm text-gray-600">Verifying your email…</p>
          </div>
        )}
        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Email verified</h1>
            <p className="text-sm text-gray-500">
              You're all set. Head back to your dashboard to keep working.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Go to dashboard
            </Link>
          </div>
        )}
        {status === "already" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Already verified</h1>
            <p className="text-sm text-gray-500">
              Your email is already confirmed.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Go to dashboard
            </Link>
          </div>
        )}
        {status === "expired" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-amber-500 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Link expired</h1>
            <p className="text-sm text-gray-500">
              Verification links are good for 24 hours. Send yourself a new one.
            </p>
            {resendState === "sent" ? (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                New link sent. Check your inbox.
              </p>
            ) : (
              <form onSubmit={handleResend} className="space-y-2 text-left">
                <label className="block text-xs font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {resendError && (
                  <p className="text-xs text-red-600">{resendError}</p>
                )}
                <button
                  type="submit"
                  disabled={resendState === "sending"}
                  className="w-full inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {resendState === "sending" ? "Sending…" : "Send a new verification email"}
                </button>
              </form>
            )}
          </div>
        )}
        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Couldn't verify</h1>
            <p className="text-sm text-gray-500">{errorMessage}</p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Go to dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
