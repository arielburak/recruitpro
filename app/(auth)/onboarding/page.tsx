"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, LogOut } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const orgName = (formData.get("orgName") as string)?.trim();
    const industry = (formData.get("industry") as string)?.trim();

    if (!orgName || orgName.length < 2) {
      setError("Please enter your company name.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgName, industry: industry || undefined }),
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

            <div className="space-y-2">
              <Label htmlFor="industry">
                Industry <span className="text-gray-400">(optional)</span>
              </Label>
              <Input
                id="industry"
                name="industry"
                placeholder="e.g. Technology, Healthcare"
                className="focus-visible:ring-indigo-500"
              />
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
