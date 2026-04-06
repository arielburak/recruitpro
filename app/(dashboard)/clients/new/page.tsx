"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        industry: fd.get("industry"),
        website: fd.get("website"),
        contactName: fd.get("contactName"),
        contactEmail: fd.get("contactEmail"),
        contactPhone: fd.get("contactPhone"),
        notes: fd.get("notes"),
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to create client");
      setLoading(false);
      return;
    }

    const client = await res.json();
    router.push(`/clients/${client.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/clients">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        </Link>
        <h1 className="text-2xl font-bold">Add Client</h1>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input name="name" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input name="industry" placeholder="Technology, Finance, etc." />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input name="website" placeholder="https://" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input name="contactName" />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input name="contactEmail" type="email" />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone</Label>
                <Input name="contactPhone" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea name="notes" rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Link href="/clients"><Button type="button" variant="outline">Cancel</Button></Link>
              <Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create Client"}</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
