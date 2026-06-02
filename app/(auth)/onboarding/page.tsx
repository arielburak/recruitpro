"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Briefcase, LogOut } from "lucide-react";
import { COMPANY_SIZE_OPTIONS, INDUSTRY_OPTIONS } from "@/lib/constants";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Controlled Industry so users can pick a standard bucket or
  // type their own — matches the rest of the app's industry inputs.
  const [industry, setIndustry] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const orgName = (formData.get("orgName") as string)?.trim();
    const trimmedIndustry = industry.trim();
    const companySize = (formData.get("companySize") as string)?.trim();

    if (!orgName || orgName.length < 2) {
      setError("Please enter your company name.");
      setLoading(false);
      return;
    }

    if (!trimmedIndustry || !companySize) {
      setError("Please pick your industry and team size.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, industry: trimmedIndustry, companySize }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Could not save your company. Please try again.");
        return;
      }

      const body = await res.json();
      await update({
        organizationName: body.organizationName,
        needsOnboarding: false,
      });

      router.push("/dashboard?welcome=true");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const displayName =
    (session?.user as any)?.name || session?.user?.email || "there";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">Recruiting ATS</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome, {displayName}
          </h1>
          <p className="text-gray-500 mt-1">
            Before you get started, tell us which company you&apos;re with. This
            becomes your workspace name and shows up across your portal.
          </p>

          <form onSubmit={onSubmit} className="space-y-5 mt-6">
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
                placeholder="e.g. Acme Recruiting"
                className="focus-visible:ring-indigo-500"
                autoFocus
                required
                minLength={2}
              />
              <p className="text-xs text-gray-500">
                Enter the real name of the company you work for — not your own
                name.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Combobox
                  id="industry"
                  value={industry}
                  onChange={setIndustry}
                  options={INDUSTRY_OPTIONS}
                  placeholder="Select or type…"
                />
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

            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              disabled={loading}
            >
              {loading ? "Saving..." : "Continue to dashboard"}
            </Button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
