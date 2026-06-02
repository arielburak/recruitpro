"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { PhoneInput } from "@/components/ui/phone-input";
import Link from "next/link";

export default function NewContactPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  // Optional: send a portal invite as part of creating the contact, so
  // recruiters can grant access without bouncing to /contacts after
  // saving. Disabled until a valid-looking email is filled in.
  const [sendInvite, setSendInvite] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((data) => setClientName(data.name || ""))
      .catch(() => {});
  }, [clientId]);

  const emailLooksValid = /^\S+@\S+\.\S+$/.test(email.trim());

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

    // Optional second step: portal invite. We chain it client-side so
    // the recruiter sees a clear failure message ("contact created,
    // invite failed") if SMTP burps, instead of losing the contact
    // because the combined endpoint rolled back.
    if (sendInvite && emailLooksValid) {
      const created = await res.json().catch(() => null);
      if (created?.id) {
        const inviteRes = await fetch(`/api/contacts/${created.id}/invite-portal`, {
          method: "POST",
        });
        if (!inviteRes.ok) {
          const body = await inviteRes.json().catch(() => ({}));
          setError(
            `Contact created, but portal invite failed: ${body.error || "unknown error"}`
          );
          setLoading(false);
          return;
        }
      }
    }

    router.push(`/clients/${clientId}/contacts`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <BackButton fallback={`/clients/${clientId}/contacts`} />
        <div>
          <h1 className="text-2xl font-bold">Add contact</h1>
          {clientName && <p className="text-gray-500 text-sm">at {clientName}</p>}
        </div>
      </div>

      <form onSubmit={onSubmit} autoComplete="off">
        <Card>
          <CardHeader>
            <CardTitle>Contact information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First name *</Label>
                <Input name="firstName" required />
              </div>
              <div className="space-y-2">
                <Label>Last name *</Label>
                <Input name="lastName" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input name="title" placeholder="VP of Engineering, HR Director…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <PhoneInput name="phone" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>LinkedIn profile</Label>
              <Input name="linkedIn" placeholder="https://linkedin.com/in/…" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea name="notes" rows={3} />
            </div>

            {/* Portal invite — single-pass: create the contact and
                ship the set-password email in the same flow so we
                don't bounce to /contacts to do step two. */}
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 flex items-start gap-3">
              <input
                type="checkbox"
                id="sendInvite"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                disabled={!emailLooksValid}
                className="mt-1 h-4 w-4 rounded border-indigo-300 text-indigo-600 disabled:opacity-50"
              />
              <div className="flex-1 min-w-0">
                <Label htmlFor="sendInvite" className="cursor-pointer flex items-center gap-1.5 text-sm font-medium text-gray-900">
                  <KeyRound className="h-3.5 w-3.5 text-indigo-600" />
                  Also send a portal invite
                </Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  We&apos;ll email a set-password link. They&apos;ll see the portal once they sign in, but won&apos;t have access to any specific job until you share one.
                  {!emailLooksValid && (
                    <span className="block mt-1 text-amber-700">Fill in a valid email to enable this option.</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link href={`/clients/${clientId}/contacts`}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading
                  ? sendInvite
                    ? "Creating & inviting…"
                    : "Creating…"
                  : sendInvite
                    ? "Create & invite"
                    : "Create contact"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
