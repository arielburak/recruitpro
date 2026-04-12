"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
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
    <Card>
      <CardHeader className="text-center">
        <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-indigo-600 transition-colors">
          RecruitPro
        </Link>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {registered && (
            <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md">
              Account created! Please sign in.
            </div>
          )}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
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
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
          <Link
            href="/forgot-password"
            className="text-sm text-gray-400 hover:text-gray-600 text-center block"
          >
            Forgot your password?
          </Link>
          <p className="text-sm text-gray-500 text-center">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-indigo-600 hover:underline">
              Start free trial
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
      <LoginContent />
    </Suspense>
  );
}
