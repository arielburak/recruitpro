"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { INDUSTRY_OPTIONS } from "@/lib/constants";
import {
  Briefcase,
  CheckCircle2,
  Users,
  FileText,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  Mail,
} from "lucide-react";

function ForgotPasswordSection({
  forgotSent,
  forgotLoading,
  error,
  onBack,
  onSubmit,
}: {
  forgotSent: boolean;
  forgotLoading: boolean;
  error: string;
  onBack: () => void;
  onSubmit: (email: string) => void;
}) {
  if (forgotSent) {
    return (
      <div className="text-center py-4">
        <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm mb-6">
          If an account with that email exists, we&apos;ve sent a password reset link.
        </p>
        <button
          onClick={onBack}
          className="text-emerald-600 text-sm font-medium hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to sign in
      </button>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Reset your password</h2>
        <p className="text-gray-500 mt-1 text-sm">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          onSubmit(fd.get("forgot-email") as string);
        }}
        className="space-y-4"
      >
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            name="forgot-email"
            type="email"
            placeholder="you@company.com"
            required
          />
        </div>
        <Button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          disabled={forgotLoading}
        >
          {forgotLoading ? "Sending..." : "Send Reset Link"}
        </Button>
      </form>
    </>
  );
}

// Sets a short-lived cookie so the NextAuth server callbacks know the
// user kicked off OAuth from the client portal (not the staffing side).
function markClientOAuth() {
  document.cookie = "oauth-portal=client; path=/; max-age=120; SameSite=Lax";
}

function ClientPortalLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    searchParams.get("error") === "no-client-account"
      ? "That email isn't registered as a client user. Ask your recruiter to invite you, or create an account below."
      : ""
  );
  const [success, setSuccess] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [isInvitedUser, setIsInvitedUser] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [clearingSession, setClearingSession] = useState(false);
  // Set when the credentials sign-in succeeds on password but the
  // server throws EMAIL_NOT_VERIFIED. We surface a dedicated panel
  // (instead of a generic red error) with a one-click "resend
  // verification email" so the user can recover without help.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string>("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationResent, setVerificationResent] = useState(false);
  // Controlled Industry field on the sign-up form. The Combobox lets
  // the user pick a standard bucket from INDUSTRY_OPTIONS or type
  // their own — both produce the same string value submitted to
  // /api/client-portal/register.
  const [industry, setIndustry] = useState("");

  async function resendVerification() {
    if (!unverifiedEmail || resendingVerification) return;
    setResendingVerification(true);
    try {
      await fetch("/api/client-portal/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      setVerificationResent(true);
    } catch {}
    setResendingVerification(false);
  }

  // If there's a client session already, go straight to dashboard
  // (or honor ?callbackUrl= for share-email deep links).
  // If there's a staffing session, don't touch it — just warn the user
  // that they need to sign out of staffing first to log in as client
  const callbackUrl = searchParams.get("callbackUrl");
  // Only honor relative URLs to avoid open-redirect via callbackUrl.
  const safeCallback =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : null;
  useEffect(() => {
    if (session?.user && (session.user as any).isClientUser) {
      router.replace(safeCallback || "/client-portal/dashboard");
    }
  }, [session, router, safeCallback]);

  const hasStaffingSession = !!(session?.user && !(session.user as any).isClientUser);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    try {
      // If a staffing session is active, transparently sign out first
      if (hasStaffingSession) {
        await signOut({ redirect: false });
      }

      const result = await signIn("client-credentials", {
        email: fd.get("email") as string,
        password: fd.get("password") as string,
        redirect: false,
      });

      if (result?.error) {
        // NextAuth surfaces our thrown EMAIL_NOT_VERIFIED message via
        // result.error. Disambiguate that from a generic invalid-creds
        // case so we can offer a one-click resend instead of leaving
        // the user stuck without context.
        if (result.error === "EMAIL_NOT_VERIFIED") {
          setUnverifiedEmail(String(fd.get("email") || ""));
          setError("");
          setLoading(false);
          return;
        }
        // Check if user exists but has no password
        try {
          const checkRes = await fetch("/api/client-portal/check-account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: fd.get("email") }),
          });
          const checkData = await checkRes.json();
          if (checkData.exists && !checkData.hasPassword) {
            setError("Your account doesn't have a password yet. Check your email for a setup link, or ask your recruiter to resend the portal invitation.");
          } else {
            setError("Invalid email or password");
          }
        } catch {
          setError("Invalid email or password");
        }
        setLoading(false);
        return;
      }

      window.location.href = safeCallback || "/client-portal/dashboard";
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  async function checkInvitedEmail(email: string) {
    if (!email) return;
    setCheckingEmail(true);
    try {
      const res = await fetch("/api/client-portal/check-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setIsInvitedUser(data.exists && !data.hasPassword);
    } catch {}
    setCheckingEmail(false);
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;

    try {
      const res = await fetch("/api/client-portal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: fd.get("companyName") as string,
          name: fd.get("name") as string,
          title: fd.get("title") as string,
          email,
          password,
          industry,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      const data = await res.json().catch(() => ({}));

      // New accounts ship in unverified state — the credentials provider
      // would refuse to sign them in until they click the verify link.
      // Skip the auto-login attempt and surface the "check your email"
      // panel instead so the UX matches the actual constraint.
      if (data?.needsVerification) {
        setUnverifiedEmail(email);
        setMode("login");
        setLoading(false);
        return;
      }

      // If a staffing session is active, transparently sign out first
      if (hasStaffingSession) {
        await signOut({ redirect: false });
      }

      // Auto-login (legacy path for pre-verification accounts; new
      // accounts go through the verify panel above).
      const result = await signIn("client-credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setSuccess("Account created! Please sign in.");
        setMode("login");
        setLoading(false);
        return;
      }

      window.location.href = safeCallback || "/client-portal/dashboard";
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold">Recruiting ATS</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight mb-4">
            Hire smarter with<br />top recruiting firms
          </h1>
          <p className="text-emerald-100 text-lg mb-10">
            Post jobs, invite recruiters, and track your hiring pipeline — all in one place. Free for hiring companies.
          </p>

          <div className="space-y-4">
            {[
              { icon: FileText, text: "Post job descriptions and requirements" },
              { icon: Users, text: "Invite multiple recruiting firms to work your searches" },
              { icon: MessageSquare, text: "Review candidates and give real-time feedback" },
              { icon: CheckCircle2, text: "Track progress across all your open roles" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-emerald-200" />
                </div>
                <span className="text-emerald-50">{text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>

          {hasStaffingSession && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              <span className="flex-1 truncate">
                Currently in staffing as <span className="font-medium text-gray-800">{(session?.user as any)?.email || session?.user?.name}</span>
              </span>
              <Link href="/dashboard" className="text-emerald-600 hover:text-emerald-700 font-medium whitespace-nowrap">
                Go there →
              </Link>
            </div>
          )}
          {forgotMode ? (
            <ForgotPasswordSection
              forgotSent={forgotSent}
              forgotLoading={forgotLoading}
              error={error}
              onBack={() => { setForgotMode(false); setForgotSent(false); setError(""); }}
              onSubmit={async (email: string) => {
                setForgotLoading(true);
                setError("");
                try {
                  const res = await fetch("/api/auth/forgot-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, isClient: true }),
                  });
                  if (res.ok) {
                    setForgotSent(true);
                  } else {
                    setError("Something went wrong. Please try again.");
                  }
                } catch {
                  setError("Something went wrong. Please try again.");
                }
                setForgotLoading(false);
              }}
            />
          ) : (
          <>
          {/* Toggle */}
          <div className="flex bg-white rounded-xl border border-gray-200 p-1 mb-8">
            <button
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition ${
                mode === "login"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition ${
                mode === "register"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Create Account
            </button>
          </div>

          {mode === "login" ? (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
                <p className="text-gray-500 mt-1">Sign in to your client portal.</p>
              </div>

              <div className="space-y-3 mb-5">
                <button
                  type="button"
                  onClick={() => {
                    markClientOAuth();
                    signIn("google", { callbackUrl: safeCallback || "/client-portal/dashboard" });
                  }}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-sm font-medium text-gray-700"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>
              </div>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-gray-50 text-gray-500">or sign in with email</span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
                {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-lg">{success}</div>}
                {unverifiedEmail && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 rounded-lg space-y-2">
                    <p className="font-medium">Verify your email to sign in</p>
                    <p className="text-xs text-amber-800/80">
                      We sent a confirmation link to <strong>{unverifiedEmail}</strong>. Click it to activate your account.
                    </p>
                    {verificationResent ? (
                      <p className="text-xs text-emerald-700">A new link is on its way. Check your inbox.</p>
                    ) : (
                      <button
                        type="button"
                        onClick={resendVerification}
                        disabled={resendingVerification}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        {resendingVerification ? "Sending…" : "Resend verification email"}
                      </button>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="you@company.com" required />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <PasswordInput id="password" name="password" required />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {isInvitedUser ? "Activate your account" : "Create your account"}
                </h2>
                <p className="text-gray-500 mt-1">
                  {isInvitedUser
                    ? "A recruiter invited you. Set a password to get started."
                    : "Post jobs, invite recruiting firms, and hire great people."}
                </p>
              </div>
              <form onSubmit={handleRegister} className="space-y-4">
                {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Work Email</Label>
                  <Input
                    id="reg-email"
                    name="email"
                    type="email"
                    placeholder="jane@acme.com"
                    required
                    onBlur={(e) => checkInvitedEmail(e.target.value)}
                  />
                </div>
                {!isInvitedUser && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input id="companyName" name="companyName" placeholder="Acme Inc." required={!isInvitedUser} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="industry">Industry</Label>
                      <Combobox
                        id="industry"
                        value={industry}
                        onChange={setIndustry}
                        options={INDUSTRY_OPTIONS}
                        placeholder="Technology"
                      />
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name</Label>
                    <Input id="name" name="name" placeholder="Jane Smith" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="title">Job Title</Label>
                    <Input id="title" name="title" placeholder="e.g. Hiring Manager" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <PasswordInput id="reg-password" name="password" placeholder="Min. 8 characters" minLength={8} required />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                  {loading ? (isInvitedUser ? "Activating..." : "Creating account...") : (isInvitedUser ? "Activate & Sign In" : "Create Account")}
                </Button>
              </form>
            </>
          )}

          </>
          )}

          <div className="mt-8 text-center">
            <p className="text-xs text-gray-400">
              Are you a recruiting firm?{" "}
              <Link href="/register" className="text-indigo-600 font-medium hover:underline">
                Sign up here
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 animate-pulse" />}>
      <ClientPortalLoginInner />
    </Suspense>
  );
}
