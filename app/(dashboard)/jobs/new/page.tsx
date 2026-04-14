"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

function NewJobContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clients, setClients] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then(setClients);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        description: fd.get("description"),
        clientId: fd.get("clientId"),
        location: fd.get("location"),
        salary: fd.get("salary"),
        feeType: fd.get("feeType") || "PERCENTAGE",
        feeAmount: fd.get("feeAmount") ? Number(fd.get("feeAmount")) : null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to create job");
      setLoading(false);
      return;
    }

    const job = await res.json();
    router.push(`/jobs/${job.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/jobs">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        </Link>
        <h1 className="text-2xl font-bold">Create Job</h1>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader><CardTitle>Job Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}
            <div className="space-y-2">
              <Label>Job Title *</Label>
              <Input name="title" placeholder="Senior Software Engineer" required />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <select name="clientId" className="w-full border rounded-md px-3 py-2 text-sm" required defaultValue={preselectedClientId}>
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {clients.length === 0 && (
                <p className="text-xs text-gray-400">
                  <Link href="/clients/new" className="text-indigo-600 hover:underline">Add a client first</Link>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input name="location" placeholder="New York, NY / Remote" />
              </div>
              <div className="space-y-2">
                <Label>Salary Range</Label>
                <Input name="salary" placeholder="$150K - $180K" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fee Type</Label>
                <select name="feeType" className="w-full border rounded-md px-3 py-2 text-sm">
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FLAT">Flat Fee</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Fee Amount</Label>
                <Input name="feeAmount" type="number" step="0.01" placeholder="25" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea name="description" rows={4} placeholder="Job description, requirements..." />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Link href="/jobs"><Button type="button" variant="outline">Cancel</Button></Link>
              <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create Job"}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default function NewJobPage() {
  return (
    <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
      <NewJobContent />
    </Suspense>
  );
}
