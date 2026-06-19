"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Status = "loading" | "success" | "already" | "expired" | "invalid" | "error";

function VerifyContent() {
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
        const res = await fetch("/api/client-portal/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error || "Verification failed";
          // Branch on the explicit `reason` discriminator from the
          // API, not on the message string. Sniffing /expired/i
          // catches "Invalid or expired link" (already-used case)
          // by accident and shows the wrong recovery UI.
          if (data.reason === "expired") {
            setStatus("expired");
          } else if (data.reason === "invalid") {
            setStatus("invalid");
          } else {
            setStatus("error");
            setErrorMessage(msg);
          }
          return;
        }
        setStatus(data.alreadyVerified ? "already" : "success");
        if (!data.alreadyVerified) {
          // Refresh the JWT so the gated client-portal actions
          // (feedback, team invites, share grants) unlock without
          // a re-login.
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
      const res = await fetch("/api/client-portal/resend-verification", {
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
            <Loader2 className="h-10 w-10 text-emerald-500 animate-spin mx-auto" />
            <p className="text-sm text-gray-600">Verifying your email…</p>
          </div>
        )}
        {status === "success" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Email verified</h1>
            <p className="text-sm text-gray-500">
              Your account is ready. Sign in to access your portal.
            </p>
            <Link
              href="/client-portal/login"
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Sign in
            </Link>
          </div>
        )}
        {status === "already" && (
          <div className="space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Already verified</h1>
            <p className="text-sm text-gray-500">Your email is already confirmed.</p>
            <Link
              href="/client-portal/login"
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Sign in
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
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {resendError && (
                  <p className="text-xs text-red-600">{resendError}</p>
                )}
                <button
                  type="submit"
                  disabled={resendState === "sending"}
                  className="w-full inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {resendState === "sending" ? "Sending…" : "Send a new verification email"}
                </button>
              </form>
            )}
          </div>
        )}
        {status === "invalid" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-gray-400 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Link no longer valid</h1>
            <p className="text-sm text-gray-500">
              This verification link has already been used or replaced by a newer one. If you've
              already verified your email, just sign in.
            </p>
            <Link
              href="/client-portal/login"
              className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Sign in
            </Link>
          </div>
        )}
        {status === "error" && (
          <div className="space-y-4">
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Couldn&apos;t verify</h1>
            <p className="text-sm text-gray-500">{errorMessage}</p>
            <Link
              href="/client-portal/login"
              className="inline-flex items-center justify-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientPortalVerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyContent />
    </Suspense>
  );
}
