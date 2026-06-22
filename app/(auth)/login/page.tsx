"use client";

import { useState, Suspense, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Briefcase, Building2, ChevronRight, CheckCircle2 } from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // When the user trips the email-verification wall, swap the generic
  // error for a richer panel with a resend button. We remember the
  // email they typed so the resend call has it without prompting.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const registered = searchParams.get("registered");
  // Which side of the product the user is signing into. The selector is
  // the default first view; `?portal=agency` (or coming back from a
  // fresh registration) skips it. Client-portal selection redirects out
  // to /client-portal/login so each side keeps its own dedicated form.
  const portalParam = searchParams.get("portal");
  // Soporte de invite link reusado: cuando un user vuelve a clickear su
  // link de invite despues de haber aceptado, /invite/[token] redirige
  // aca con ?email=…&from=invite-used. Mostramos banner verde + skip
  // del portal selector + email precargado, asi el flow termina en
  // "tipear password y entrar".
  const prefillEmail = searchParams.get("email") || "";
  const fromInviteUsed = searchParams.get("from") === "invite-used";
  // El layout del agency portal redirige aca cuando descubre que la
  // session pertenece a un user con isActive=false. Mostramos un
  // banner amigable en lugar del 401 silencioso que veian antes.
  const deactivatedError = searchParams.get("error") === "deactivated";
  const [step, setStep] = useState<"select" | "agency">(
    portalParam === "agency" || registered || fromInviteUsed || deactivatedError ? "agency" : "select"
  );

  // If a staffing user is already signed in, go to dashboard
  useEffect(() => {
    if (session?.user && !(session.user as any).isClientUser) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  const hasClientSession = !!(session?.user && (session.user as any).isClientUser);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new FormData(e.currentTarget);

      // If a client session is active, transparently sign out first
      if (hasClientSession) {
        await signOut({ redirect: false });
      }

      // Race signIn against a timeout
      const signInPromise = signIn("credentials", {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
        redirect: false,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), 15000)
      );

      const result = await Promise.race([signInPromise, timeoutPromise]);

      if (result?.error) {
        // NextAuth returns the error message via `result.error` when
        // signIn() is called with redirect:false. authorize() throws
        // sentinels que mapeamos a copy específica:
        //   · EMAIL_NOT_VERIFIED → panel con resend
        //   · DEACTIVATED → mensaje claro de access revoked
        //   · cualquier otro → "Invalid email or password" genérico
        //     (no revelar enumeración de emails)
        const emailValue = (formData.get("email") as string | null)?.trim().toLowerCase() || "";
        if (result.error.includes("EMAIL_NOT_VERIFIED")) {
          setUnverifiedEmail(emailValue);
          setResendSent(false);
          setError("");
        } else if (result.error.includes("DEACTIVATED")) {
          setError(
            "Your account has been deactivated. Please contact your workspace admin to regain access.",
          );
          setUnverifiedEmail(null);
        } else {
          setError("Invalid email or password");
          setUnverifiedEmail(null);
        }
        setLoading(false);
        return;
      }

      // Successful sign-in — navigate to dashboard
      window.location.href = "/dashboard";
    } catch (err: any) {
      console.error("Sign in error:", err);
      if (err.message === "TIMEOUT") {
        setError("Sign in timed out. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — branded */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold">Recruiting ATS</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight mb-4">
            The ATS built for<br />recruiting firms
          </h1>
          <p className="text-indigo-100 text-lg mb-10">
            Streamline your hiring pipeline from sourcing to placement.
          </p>

          <div className="space-y-4">
            {[
              "Manage candidates, jobs & clients in one place",
              "Automated pipeline tracking & analytics",
              "Team collaboration with role-based access",
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-200 shrink-0 mt-0.5" />
                <span className="text-indigo-50">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>

          {step === "select" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
                <p className="text-gray-500 mt-1">Which portal are you signing in to?</p>
              </div>

              {hasClientSession && (
                <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="flex-1 truncate">
                    Currently in client portal as <span className="font-medium text-gray-800">{(session?.user as any)?.email || session?.user?.name}</span>
                  </span>
                  <Link href="/client-portal/dashboard" className="text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap">
                    Go there →
                  </Link>
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setStep("agency")}
                  className="group w-full flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors text-left"
                >
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Agency Workspace</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      I work at a recruiting firm managing searches and candidates.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 shrink-0 mt-1 transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/client-portal/login")}
                  className="group w-full flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors text-left"
                >
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Client Portal</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      I&apos;m a hiring company reviewing candidates my recruiters shared.
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-1.5">
                      You already pay a fee — no need to pay for the ATS.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-500 shrink-0 mt-1 transition-colors" />
                </button>
              </div>

              <p className="text-sm text-gray-500 text-center mt-8">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="text-indigo-600 font-medium hover:underline">
                  Start free trial
                </Link>
              </p>
            </>
          )}

          {step === "agency" && (
          <>
          <button
            type="button"
            onClick={() => setStep("select")}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 -mt-2"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to portal selection
          </button>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-1">Sign in to your agency workspace.</p>
          </div>

          {hasClientSession && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="flex-1 truncate">
                Currently in client portal as <span className="font-medium text-gray-800">{(session?.user as any)?.email || session?.user?.name}</span>
              </span>
              <Link href="/client-portal/dashboard" className="text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap">
                Go there →
              </Link>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            {registered && (
              <div className="bg-green-50 text-green-600 text-sm p-3 rounded-lg">
                Account created! Please sign in.
              </div>
            )}
            {fromInviteUsed && (
              <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg border border-green-200">
                Looks like you&apos;ve already accepted that invitation. Sign in below to continue.
              </div>
            )}
            {deactivatedError && (
              <div className="bg-amber-50 text-amber-800 text-sm p-3 rounded-lg border border-amber-200">
                Your account has been deactivated. Please contact your workspace admin to regain access.
              </div>
            )}
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Email-verification wall. Surfaced when authorize() throws
                EMAIL_NOT_VERIFIED — login is blocked until the user
                clicks the verify link in their inbox. Resend is one
                click away so they don't have to leave the page if
                the email got lost. */}
            {unverifiedEmail && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-amber-900">Verify your email first</p>
                <p className="text-amber-800/90 text-xs">
                  We need to confirm <span className="font-medium">{unverifiedEmail}</span> before
                  you can sign in. Check your inbox for the link we sent — or send a new one below.
                </p>
                {resendSent ? (
                  <p className="text-amber-800 text-xs flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Sent. Check your inbox (and spam).
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={resending}
                    onClick={async () => {
                      setResending(true);
                      try {
                        await fetch("/api/auth/resend-verification", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: unverifiedEmail }),
                        });
                        setResendSent(true);
                      } finally {
                        setResending(false);
                      }
                    }}
                    className="inline-flex items-center text-xs font-medium text-amber-900 underline hover:text-amber-700 disabled:opacity-60"
                  >
                    {resending ? "Sending…" : "Resend verification email"}
                  </button>
                )}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
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

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-gray-500">or sign in with email</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@acmerecruiting.com"
                className="focus-visible:ring-indigo-500"
                defaultValue={prefillEmail}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  Forgot your password?
                </Link>
              </div>
              <PasswordInput
                id="password"
                name="password"
                className="focus-visible:ring-indigo-500"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-indigo-600 font-medium hover:underline">
              Start free trial
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 animate-pulse" />}>
      <LoginContent />
    </Suspense>
  );
}
