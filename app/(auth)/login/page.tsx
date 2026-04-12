"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Briefcase, CheckCircle2 } from "lucide-react";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const registered = searchParams.get("registered");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const formData = new FormData(e.currentTarget);

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
        setError("Invalid email or password");
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
            <span className="text-2xl font-bold">RecruitPro</span>
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

        <div className="border-t border-white/20 pt-8">
          <blockquote className="text-indigo-100 italic text-sm leading-relaxed">
            &ldquo;RecruitPro cut our time-to-fill by 40%. The pipeline visibility alone
            is worth it.&rdquo;
          </blockquote>
          <div className="mt-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
              SM
            </div>
            <div>
              <p className="text-sm font-medium">Sarah Mitchell</p>
              <p className="text-xs text-indigo-200">Director of Talent, Apex Recruiting</p>
            </div>
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

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-1">Sign in to your account to continue.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {registered && (
              <div className="bg-green-50 text-green-600 text-sm p-3 rounded-lg">
                Account created! Please sign in.
              </div>
            )}
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  Forgot your password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
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
