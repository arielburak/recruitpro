"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Briefcase,
  CheckCircle2,
  Users,
  FileText,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

export default function ClientPortalLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      window.location.href = "/client-portal/dashboard";
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
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
            <span className="text-2xl font-bold">RecruitPro</span>
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
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
                <p className="text-gray-500 mt-1">Free forever for hiring companies.</p>
              </div>
              <form onSubmit={handleRegister} className="space-y-4">
                {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input id="companyName" name="companyName" placeholder="Acme Inc." required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name</Label>
                    <Input id="name" name="name" placeholder="Jane Smith" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Input id="industry" name="industry" placeholder="Technology" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Work Email</Label>
                  <Input id="reg-email" name="email" type="email" placeholder="jane@acme.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input id="reg-password" name="password" type="password" placeholder="Min. 8 characters" minLength={8} required />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                  {loading ? "Creating account..." : "Create Free Account"}
                </Button>
              </form>
              <div className="mt-4 flex items-center gap-2 justify-center text-xs text-gray-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                No credit card required
              </div>
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
