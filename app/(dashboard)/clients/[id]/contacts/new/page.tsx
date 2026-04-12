"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewContactPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("");

  useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((data) => setClientName(data.name || ""))
      .catch(() => {});
  }, [clientId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: fd.get("firstName"),
        lastName: fd.get("lastName"),
        title: fd.get("title"),
        email: fd.get("email"),
        phone: fd.get("phone"),
        linkedIn: fd.get("linkedIn"),
        isPrimary: fd.get("isPrimary") === "on",
        notes: fd.get("notes"),
        clientId,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to create contact");
      setLoading(false);
      return;
    }

    router.push(`/clients/${clientId}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/clients/${clientId}/contacts`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add Contact</h1>
          {clientName && <p className="text-gray-500">for {clientName}</p>}
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input name="firstName" required />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input name="lastName" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input name="title" placeholder="VP of Engineering, HR Director, etc." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input name="email" type="email" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input name="phone" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>LinkedIn Profile</Label>
              <Input name="linkedIn" placeholder="https://linkedin.com/in/..." />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="isPrimary"
                id="isPrimary"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <Label htmlFor="isPrimary" className="cursor-pointer">
                Primary Contact
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea name="notes" rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Link href={`/clients/${clientId}/contacts`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Contact"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
