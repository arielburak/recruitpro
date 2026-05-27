"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Briefcase, Building2, ChevronRight, CheckCircle2, Users, Globe, UserPlus, Sparkles, Mail } from "lucide-react";
import { COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS } from "@/lib/constants";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // The trial sign-up is agency-side only. Client portal access comes
  // from a recruiter's invite — you don't self-register for it. The
  // selector leads with that distinction so hiring companies don't get
  // stuck typing company details they can't use.
  const [step, setStep] = useState<"select" | "agency" | "client-info">("select");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const data = {
      orgName: formData.get("orgName") as string,
      name: formData.get("name") as string,
      title: formData.get("title") as string,
      email,
      password,
      industry: formData.get("industry") as string,
      companySize: formData.get("companySize") as string,
    };

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Registration failed");
        return;
      }

      // Auto-login after registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        router.push("/login?registered=true");
        return;
      }

      router.push("/dashboard?welcome=true");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
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
            A modern ATS<br />for boutique firms
          </h1>
          <p className="text-indigo-100 text-lg mb-10">
            Everything you need to run a recruiting operation — without the enterprise bloat.
          </p>

          <div className="space-y-5">
            {[
              { icon: UserPlus, label: "Unlimited candidates & job postings" },
              { icon: Globe, label: "Built-in client portal" },
              { icon: Users, label: "Team collaboration & permissions" },
              { icon: Sparkles, label: "5-day trial, cancel any time" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-indigo-200" />
                </div>
                <span className="text-indigo-50">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/20 pt-8">
          <p className="text-indigo-100 text-sm leading-relaxed">
            You&apos;re joining early. That means direct access to the team, weekly shipping,
            and early-adopter pricing that stays grandfathered.
          </p>
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
                <h2 className="text-2xl font-bold text-gray-900">Get started</h2>
                <p className="text-gray-500 mt-1">Which side are you on?</p>
              </div>

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
                      I work at a recruiting firm and want to manage searches, candidates, and client relationships.
                    </p>
                    <p className="text-[11px] text-indigo-700 mt-1.5 font-medium">
                      5-day free trial · Credit card required · Cancel anytime
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 shrink-0 mt-1 transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => setStep("client-info")}
                  className="group w-full flex items-start gap-4 p-4 rounded-xl border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors text-left"
                >
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Client Portal</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      I&apos;m a hiring company working with recruiting firms on searches.
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-1.5">
                      You already pay a fee — no need to pay for the ATS.
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-500 shrink-0 mt-1 transition-colors" />
                </button>
              </div>

              <p className="text-sm text-gray-500 text-center mt-8">
                Already have an account?{" "}
                <Link href="/login" className="text-indigo-600 font-medium hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}

          {step === "client-info" && (
            <>
              <button
                type="button"
                onClick={() => setStep("select")}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 -mt-2"
              >
                <ArrowLeft className="w-3 h-3" />
                Back
              </button>

              <div className="mb-6">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                  <Mail className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">You&apos;ll get an invite</h2>
                <p className="text-gray-500 mt-2 leading-relaxed">
                  The Client Portal works by invitation. Your recruiting agency
                  invites you by email when they&apos;re ready to share a search
                  with you — you don&apos;t sign up on your own.
                </p>
              </div>

              <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-4 text-sm text-emerald-800">
                <p className="font-medium mb-1">Already invited?</p>
                <p className="text-emerald-700">
                  Check your email for the invitation link, or sign in directly
                  if you&apos;ve already set up your password.
                </p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href="/client-portal/login"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition"
                  >
                    Sign in to Client Portal
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-6 leading-relaxed">
                If your agency isn&apos;t on Recruiting ATS yet, share this link
                with them — they can start a free trial and invite you once
                they&apos;re set up.
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
            Back
          </button>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Start your free trial</h2>
            <p className="text-gray-500 mt-1">
              5 days free. Credit card required. Cancel anytime before the trial ends.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                {error}
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
                Sign up with Google
              </button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-gray-500">or register with email</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgName">Company / Firm Name</Label>
              <Input
                id="orgName"
                name="orgName"
                placeholder="Acme Recruiting"
                className="focus-visible:ring-indigo-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <select
                  id="industry"
                  name="industry"
                  required
                  defaultValue=""
                  className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <option value="" disabled>Select…</option>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="companySize">Team Size</Label>
                <select
                  id="companySize"
                  name="companySize"
                  required
                  defaultValue=""
                  className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <option value="" disabled>Select…</option>
                  {COMPANY_SIZE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="name">Your Name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="e.g. María López"
                  className="focus-visible:ring-indigo-500"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Job Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g. Senior Recruiter"
                  className="focus-visible:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@acmerecruiting.com"
                className="focus-visible:ring-indigo-500"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                name="password"
                placeholder="Min. 8 characters"
                className="focus-visible:ring-indigo-500"
                minLength={8}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              disabled={loading}
            >
              {loading ? "Creating your workspace..." : "Start Free Trial"}
            </Button>
          </form>

          <div className="mt-6 space-y-2">
            {["Unlimited candidates & jobs", "Client portal included", "Set up in 2 minutes"].map(
              (item) => (
                <div key={item} className="flex items-center gap-2 text-xs text-gray-500">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  {item}
                </div>
              )
            )}
          </div>

          <p className="text-sm text-gray-500 text-center mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
