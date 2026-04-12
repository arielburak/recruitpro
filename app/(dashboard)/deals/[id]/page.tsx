"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, User, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

const STAGE_OPTIONS = [
  { value: "LEAD", label: "Lead" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PITCHED", label: "Pitched" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
];

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-gray-100 text-gray-800",
  QUALIFIED: "bg-blue-100 text-blue-800",
  PITCHED: "bg-purple-100 text-purple-800",
  NEGOTIATION: "bg-yellow-100 text-yellow-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-red-100 text-red-800",
};

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;

  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editForm, setEditForm] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/deals/${dealId}`).then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ])
      .then(([dealData, clientsData]) => {
        setDeal(dealData);
        setClients(clientsData);
        setLoading(false);
        if (dealData.clientId) {
          fetch(`/api/contacts?clientId=${dealData.clientId}`)
            .then((r) => r.json())
            .then((data) => setContacts(data));
        }
      })
      .catch(() => {
        setError("Failed to load deal");
        setLoading(false);
      });
  }, [dealId]);

  function startEditing() {
    setEditForm({
      title: deal.title,
      clientId: deal.clientId,
      contactId: deal.contactId || "",
      value: deal.value ? Number(deal.value) : "",
      probability: deal.probability ?? 50,
      stage: deal.stage,
      expectedClose: deal.expectedClose
        ? new Date(deal.expectedClose).toISOString().split("T")[0]
        : "",
      notes: deal.notes || "",
    });
    setEditing(true);
  }

  async function onClientChange(clientId: string) {
    setEditForm({ ...editForm, clientId, contactId: "" });
    if (clientId) {
      const data = await fetch(`/api/contacts?clientId=${clientId}`).then((r) => r.json());
      setContacts(data);
    } else {
      setContacts([]);
    }
  }

  async function onSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          clientId: editForm.clientId,
          contactId: editForm.contactId || null,
          value: editForm.value ? Number(editForm.value) : null,
          probability: editForm.probability != null ? Number(editForm.probability) : null,
          stage: editForm.stage,
          expectedClose: editForm.expectedClose || null,
          notes: editForm.notes,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to update deal");
        setSaving(false);
        return;
      }

      // Refresh deal data
      const updated = await fetch(`/api/deals/${dealId}`).then((r) => r.json());
      setDeal(updated);
      setEditing(false);
    } catch {
      setError("Failed to update deal");
    }
    setSaving(false);
  }

  async function onDelete() {
    if (!confirm("Are you sure you want to delete this deal?")) return;
    try {
      const res = await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to delete deal");
        return;
      }
      router.push("/deals");
    } catch {
      setError("Failed to delete deal");
    }
  }

  if (loading) return <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />;
  if (!deal) return <p className="text-gray-500">Deal not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/deals">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{deal.title}</h1>
            <Badge className={STAGE_COLORS[deal.stage]}>
              {STAGE_OPTIONS.find((s) => s.value === deal.stage)?.label || deal.stage}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <>
              <Button variant="outline" onClick={startEditing}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
      )}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit Deal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Deal Title *</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client *</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={editForm.clientId}
                  onChange={(e) => onClientChange(e.target.value)}
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={editForm.contactId}
                  onChange={(e) => setEditForm({ ...editForm, contactId: e.target.value })}
                >
                  <option value="">Select a contact...</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Value ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.value}
                  onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Probability (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={editForm.probability}
                  onChange={(e) =>
                    setEditForm({ ...editForm, probability: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Stage</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={editForm.stage}
                  onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}
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
              <Input
                type="date"
                value={editForm.expectedClose}
                onChange={(e) =>
                  setEditForm({ ...editForm, expectedClose: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button onClick={onSave} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">Deal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-gray-400 uppercase">Value</p>
                <p className="text-lg font-semibold text-indigo-600">
                  {deal.value ? formatCurrency(Number(deal.value)) : "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Probability</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${deal.probability || 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{deal.probability ?? 0}%</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Expected Close</p>
                <p className="text-sm">
                  {deal.expectedClose ? formatDate(deal.expectedClose) : "Not set"}
                </p>
              </div>
              {deal.notes && (
                <div>
                  <p className="text-xs text-gray-400 uppercase">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{deal.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                <Link
                  href={`/clients/${deal.client?.id}`}
                  className="text-indigo-600 hover:underline font-medium"
                >
                  {deal.client?.name}
                </Link>
              </div>
              {deal.contact && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">
                      {deal.contact.firstName} {deal.contact.lastName}
                    </p>
                    {deal.contact.email && (
                      <p className="text-xs text-gray-500">{deal.contact.email}</p>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400 uppercase">Created</p>
                <p className="text-sm">{formatDate(deal.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase">Last Updated</p>
                <p className="text-sm">{formatDate(deal.updatedAt)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
