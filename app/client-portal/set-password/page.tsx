"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Briefcase, Lock } from "lucide-react";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/client-portal/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to set password");
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
        // Password was set, but auto-login failed — redirect to login
        router.push("/client-portal/login");
        return;
      }

      window.location.href = "/client-portal/dashboard";
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-gray-500">Invalid or missing link. Please check the email you received.</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Set up your account</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Choose a password to access your client portal
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="mb-6 bg-gray-50 rounded-lg p-3 flex items-center gap-3">
            <Lock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">{email}</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
              {loading ? "Setting up..." : "Set Password & Sign In"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse h-64 w-96 bg-gray-200 rounded-2xl" /></div>}>
      <SetPasswordForm />
    </Suspense>
  );
}
