"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Briefcase, Lock } from "lucide-react";
import { INDUSTRY_OPTIONS } from "@/lib/constants";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Stub Clients (created via quick-invite when the recruiter only had
  // the hiring contact's email) need company info filled in on first
  // login. We probe the token to know whether to show those inputs.
  const [isStub, setIsStub] = useState(false);
  const [stubCompanyName, setStubCompanyName] = useState("");
  const [stubIndustry, setStubIndustry] = useState("");
  // Hiring contact's own name + role. We always ask — even when the
  // recruiter pre-filled them on the invite, the contact should
  // confirm so we don't carry typos through the portal. Pre-filled
  // from the invite payload when available.
  const [userName, setUserName] = useState("");
  const [userTitle, setUserTitle] = useState("");

  useEffect(() => {
    if (!token || !email) return;
    fetch(`/api/client-portal/set-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.isStub) {
          setIsStub(true);
          setStubCompanyName(data.currentName === "New Client" ? "" : data.currentName || "");
          setStubIndustry(data.currentIndustry || "");
        }
        if (typeof data?.currentUserName === "string") setUserName(data.currentUserName);
        if (typeof data?.currentUserTitle === "string") setUserTitle(data.currentUserTitle);
      })
      .catch(() => {});
  }, [token, email]);

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

    if (isStub && !stubCompanyName.trim()) {
      setError("Company name is required");
      setLoading(false);
      return;
    }

    if (!userName.trim()) {
      setError("Your full name is required");
      setLoading(false);
      return;
    }
    if (!userTitle.trim()) {
      setError("Your role is required");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/client-portal/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email,
          password,
          userName: userName.trim(),
          userTitle: userTitle.trim(),
          ...(isStub
            ? { companyName: stubCompanyName.trim(), industry: stubIndustry.trim() }
            : {}),
        }),
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

      // Honor ?callbackUrl= so a brand-new portal user clicking a
      // share email lands directly on the Job they were invited to,
      // not the generic dashboard.
      //
      // Open-redirect defense: el check anterior (startsWith '/' &&
      // !startsWith '//') era bypassable con `/\evil.com/path` —
      // Chromium normaliza \ a / durante URL parsing. URL parse +
      // origin check es la defensa correcta.
      const cb = searchParams.get("callbackUrl");
      let safeCb: string | null = null;
      if (cb) {
        try {
          const fake = new URL(cb, "http://x.local");
          if (
            fake.origin === "http://x.local" &&
            fake.pathname.startsWith("/client-portal/")
          ) {
            safeCb = fake.pathname + fake.search + fake.hash;
          }
        } catch {
          safeCb = null;
        }
      }
      window.location.href = safeCb || "/client-portal/dashboard";
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
            {isStub
              ? "Add your company name and pick a password to access your client portal."
              : "Choose a password to access your client portal"}
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

            {isStub && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    placeholder="Acme Inc."
                    value={stubCompanyName}
                    onChange={(e) => setStubCompanyName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Combobox
                    id="industry"
                    value={stubIndustry}
                    onChange={setStubIndustry}
                    options={INDUSTRY_OPTIONS}
                    placeholder="Select or type…"
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="userName">Your Full Name *</Label>
              <Input
                id="userName"
                name="userName"
                placeholder="Jane Smith"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userTitle">Your Role *</Label>
              <Input
                id="userTitle"
                name="userTitle"
                placeholder="e.g. Hiring Manager, Head of Engineering"
                value={userTitle}
                onChange={(e) => setUserTitle(e.target.value)}
                required
              />
            </div>

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
