"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Briefcase, CheckCircle2, ShieldCheck, Lock } from "lucide-react";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to reset password");
        return;
      }

      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
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
            Almost there!
          </h1>
          <p className="text-indigo-100 text-lg mb-10">
            Choose a strong password and you&apos;ll be back to recruiting in no time.
          </p>

          <div className="space-y-5">
            {[
              { icon: ShieldCheck, label: "Use at least 8 characters" },
              { icon: Lock, label: "Mix letters, numbers & symbols" },
              { icon: CheckCircle2, label: "Avoid reusing old passwords" },
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
          <p className="text-indigo-200 text-sm">
            Need help? Contact us at{" "}
            <span className="text-white font-medium">support@recruitingats.com</span>
          </p>
        </div>
      </div>

      {/* Right Panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>

          {!token ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">
                This reset link is missing a token. Please request a new one.
              </p>
              <Link
                href="/forgot-password"
                className="text-indigo-600 text-sm font-medium hover:underline"
              >
                Request new link
              </Link>
            </div>
          ) : done ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Password updated
              </h2>
              <p className="text-gray-500">Redirecting to sign in...</p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900">Choose a new password</h2>
                <p className="text-gray-500 mt-1">
                  Enter and confirm your new password below.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                {error && (
                  <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    className="focus-visible:ring-indigo-500"
                    minLength={8}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
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
                  {loading ? "Updating..." : "Update password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-gray-50 animate-pulse" />}
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
