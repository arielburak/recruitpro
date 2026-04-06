"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Briefcase, Check } from "lucide-react";

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
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 mb-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-gray-900">RecruitPro</span>
        </div>
      </div>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold">Start your free trial</CardTitle>
          <CardDescription>
            7 days free. No credit card required. Cancel anytime.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="orgName">Company / Firm Name</Label>
              <Input
                id="orgName"
                name="orgName"
                placeholder="Acme Recruiting"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input id="name" name="name" placeholder="John Smith" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@acmerecruiting.com"
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
                minLength={8}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating your workspace..." : "Start Free Trial"}
            </Button>
            <div className="space-y-1.5 w-full">
              {["Unlimited candidates & jobs", "Client portal included", "Set up in 2 minutes"].map(
                (item) => (
                  <div key={item} className="flex items-center gap-2 text-xs text-gray-500">
                    <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {item}
                  </div>
                )
              )}
            </div>
            <p className="text-sm text-gray-500 text-center">
              Already have an account?{" "}
              <Link href="/login" className="text-indigo-600 hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
