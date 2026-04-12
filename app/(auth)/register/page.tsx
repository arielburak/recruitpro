"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Briefcase, CheckCircle2, Users, Globe, UserPlus, Sparkles } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      email,
      password,
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
            <span className="text-2xl font-bold">RecruitPro</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight mb-4">
            Join 500+ recruiting<br />firms worldwide
          </h1>
          <p className="text-indigo-100 text-lg mb-10">
            Everything you need to run a modern recruiting operation.
          </p>

          <div className="space-y-5">
            {[
              { icon: UserPlus, label: "Unlimited candidates & job postings" },
              { icon: Globe, label: "Built-in client portal" },
              { icon: Users, label: "Team collaboration & permissions" },
              { icon: Sparkles, label: "7-day free trial, no credit card" },
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
          <blockquote className="text-indigo-100 italic text-sm leading-relaxed">
            &ldquo;We onboarded our entire team in under an hour. The candidate management
            is leagues ahead of what we had before.&rdquo;
          </blockquote>
          <div className="mt-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
              JR
            </div>
            <div>
              <p className="text-sm font-medium">James Rivera</p>
              <p className="text-xs text-indigo-200">Founder, TalentBridge Partners</p>
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
            <h2 className="text-2xl font-bold text-gray-900">Start your free trial</h2>
            <p className="text-gray-500 mt-1">
              7 days free. No credit card required. Cancel anytime.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">
                {error}
              </div>
            )}

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

            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="John Smith"
                className="focus-visible:ring-indigo-500"
                required
              />
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
              <Input
                id="password"
                name="password"
                type="password"
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
        </div>
      </div>
    </div>
  );
}
