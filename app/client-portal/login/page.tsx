"use client";

import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
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

export default function ClientPortalLoginPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [isInvitedUser, setIsInvitedUser] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [clearingSession, setClearingSession] = useState(false);

  // If there's a client session already, go straight to dashboard
  // If there's a staffing session, don't touch it — just warn the user
  // that they need to sign out of staffing first to log in as client
  useEffect(() => {
    if (session?.user && (session.user as any).isClientUser) {
      router.replace("/client-portal/dashboard");
    }
  }, [session, router]);

  const hasStaffingSession = !!(session?.user && !(session.user as any).isClientUser);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    try {
      const result = await signIn("client-credentials", {
        email: fd.get("email") as string,
        password: fd.get("password") as string,
        redirect: false,
      });

      if (result?.error) {
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

      window.location.href = "/client-portal/dashboard";
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
          email,
          password,
          industry: fd.get("industry") as string,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      // Auto-login
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

      window.location.href = "/client-portal/dashboard";
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

        <div className="border-t border-white/20 pt-8">
          <p className="text-emerald-100 text-sm">
            <span className="font-semibold text-white">100% free</span> for hiring companies.
            No credit card required. No hidden fees.
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-md">
          {hasStaffingSession && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-900 mb-1">
                You&apos;re signed in as a staffing firm user
              </p>
              <p className="text-xs text-amber-700 mb-3">
                {(session?.user as any)?.email || session?.user?.name} — To sign in as a client, sign out first.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 border-amber-300 text-amber-900 hover:bg-amber-100"
                  onClick={() => (window.location.href = "/dashboard")}
                >
                  Go to Staffing Dashboard
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-8 bg-amber-600 hover:bg-amber-700"
                  onClick={async () => {
                    setClearingSession(true);
                    await signOut({ redirect: false });
                    setClearingSession(false);
                  }}
                  disabled={clearingSession}
                >
                  {clearingSession ? "Signing out..." : "Sign out & Continue"}
                </Button>
              </div>
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
              <form onSubmit={handleLogin} className="space-y-4">
                {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
                {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-lg">{success}</div>}
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
                    : "Free forever for hiring companies."}
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
                      <Input id="industry" name="industry" placeholder="Technology" />
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="name">Your Name</Label>
                  <Input id="name" name="name" placeholder="Jane Smith" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <PasswordInput id="reg-password" name="password" placeholder="Min. 8 characters" minLength={8} required />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                  {loading ? (isInvitedUser ? "Activating..." : "Creating account...") : (isInvitedUser ? "Activate & Sign In" : "Create Free Account")}
                </Button>
              </form>
              <div className="mt-4 flex items-center gap-2 justify-center text-xs text-gray-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                No credit card required
              </div>
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
