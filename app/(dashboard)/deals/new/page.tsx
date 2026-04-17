"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { CurrencyPicker, getCurrency } from "@/components/ui/currency-picker";
import Link from "next/link";

const STAGE_OPTIONS = [
  { value: "LEAD", label: "Lead" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PITCHED", label: "Pitched" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

export default function NewDealPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setClients(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      fetch(`/api/contacts?clientId=${selectedClientId}`)
        .then((r) => r.json())
        .then((data) => setContacts(data))
        .catch(() => setContacts([]));
    } else {
      setContacts([]);
    }
  }, [selectedClientId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        clientId: fd.get("clientId"),
        contactId: fd.get("contactId") || undefined,
        value: fd.get("value") ? Number(fd.get("value")) : undefined,
        currency,
        probability: fd.get("probability") ? Number(fd.get("probability")) : undefined,
        stage: fd.get("stage"),
        expectedClose: fd.get("expectedClose") || undefined,
        notes: fd.get("notes"),
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to create deal");
      setLoading(false);
      return;
    }

    const deal = await res.json();
    router.push(`/deals/${deal.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/deals">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">New Deal</h1>
      </div>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Deal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
            )}
            <div className="space-y-2">
              <Label>Deal Title *</Label>
              <Input name="title" required placeholder="e.g. VP Engineering Search" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client *</Label>
                <select
                  name="clientId"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">Select a client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Contact</Label>
                <select
                  name="contactId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!selectedClientId}
                >
                  <option value="">Select a contact...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                      {c.title ? ` - ${c.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <CurrencyPicker value={currency} onChange={setCurrency} />
              </div>
              <div className="space-y-2">
                <Label>Value ({getCurrency(currency).symbol})</Label>
                <Input name="value" type="number" step="0.01" min="0" placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Probability (%)</Label>
                <Input
                  name="probability"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue="50"
                />
              </div>
              <div className="space-y-2">
                <Label>Stage</Label>
                <select
                  name="stage"
                  defaultValue="LEAD"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Expected Close Date</Label>
              <Input name="expectedClose" type="date" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea name="notes" rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Link href="/deals">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Deal"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
