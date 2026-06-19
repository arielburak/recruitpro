"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Welcome step for client-portal OAuth signups — Google profile gives
// us a name but never a job title. Manual signup + invite-accept
// already capture both up-front, so this page is the first thing only
// OAuth users see on their initial sign-in. After save → dashboard.
export default function ClientCompleteProfilePage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/client-portal/login");
      return;
    }
    if (session && !(session.user as any)?.isClientUser) {
      router.replace("/complete-profile");
      return;
    }
    if (session?.user?.name && !name) setName(session.user.name);
  }, [session, status, router, name]);

  if (status === "loading" || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanName = name.trim();
    const cleanTitle = title.trim();
    if (!cleanName || !cleanTitle) {
      setError("Both name and role are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, title: cleanTitle }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save profile");
      }
      await update({ name: cleanName });
      router.replace("/client-portal/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quick step before you get started — confirm how your name shows up
          and your role at the company.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Johnson"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Your role</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Head of Talent"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-lg"
          >
            {loading ? "Saving…" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
