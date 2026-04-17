"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Briefcase, CheckCircle2 } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData(e.currentTarget);
    const password = fd.get("password") as string;
    const confirmPassword = fd.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/client-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to reset password");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-gray-500">Invalid or missing reset link.</p>
          <Link href="/client-portal/login" className="text-emerald-600 text-sm font-medium hover:underline mt-2 inline-block">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {success ? "Password reset!" : "Reset your password"}
          </h1>
          {!success && (
            <p className="text-gray-500 mt-2 text-sm">Enter your new password below</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-gray-600 mb-6">Your password has been reset. You can now sign in.</p>
              <Link href="/client-portal/login">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                  Sign In
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="Min. 8 characters"
                  minLength={8}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  placeholder="Re-enter password"
                  minLength={8}
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                disabled={loading}
              >
                {loading ? "Resetting..." : "Reset Password"}
              </Button>
            </form>
          )}
        </div>

        {!success && (
          <div className="text-center mt-6">
            <Link href="/client-portal/login" className="text-sm text-gray-500 hover:text-gray-700">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse h-64 w-96 bg-gray-200 rounded-2xl" /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
