"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, UserCircle, Pencil, Trash2, KeyRound, Send, MailPlus, Shield } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";

type PortalStatus = "none" | "pending" | "active";

type UnifiedContact = {
  id: string;
  contactId: string | null;
  clientUserId: string | null;
  portalStatus: PortalStatus;
  portalRole: string | null;
  firstName: string;
  lastName: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  clientId: string;
  clientName: string;
  createdAt: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function StatusPill({ status }: { status: PortalStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        Pending invite
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <span className="h-2 w-2 rounded-full bg-gray-300" />
      No portal access
    </span>
  );
}

export default function ClientContactsPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});

  async function refresh() {
    const res = await fetch(`/api/contacts/all?clientId=${clientId}`);
    if (res.ok) {
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : []);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/clients/${clientId}`).then((r) => r.json()),
      fetch(`/api/contacts/all?clientId=${clientId}`).then((r) => r.json()),
    ])
      .then(([clientData, contactsData]) => {
        setClient(clientData);
        setContacts(Array.isArray(contactsData) ? contactsData : []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load data");
        setLoading(false);
      });
  }, [clientId]);

  function startEdit(row: UnifiedContact) {
    if (!row.contactId) return;
    setEditingId(row.contactId);
    setEditForm({
      firstName: row.firstName,
      lastName: row.lastName,
      title: row.title || "",
      email: row.email || "",
      phone: row.phone || "",
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/contacts/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to update contact");
        setSaving(false);
        return;
      }
      await refresh();
      setEditingId(null);
    } catch {
      setError("Failed to update contact");
    }
    setSaving(false);
  }

  async function deleteContact(contactId: string) {
    if (!confirm("Delete this contact? This won't revoke any existing portal access.")) return;
    try {
      const res = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to delete contact");
        return;
      }
      await refresh();
    } catch {
      setError("Failed to delete contact");
    }
  }

  async function sendInvite(row: UnifiedContact) {
    if (!row.contactId) return;
    setInvitingId(row.id);
    setInviteFeedback((m) => {
      const copy = { ...m };
      delete copy[row.id];
      return copy;
    });
    try {
      const res = await fetch(`/api/contacts/${row.contactId}/invite-portal`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setContacts((arr) =>
          arr.map((c) => (c.id === row.id ? { ...c, portalStatus: "pending" } : c))
        );
        setInviteFeedback((m) => ({
          ...m,
          [row.id]: { type: "success", message: data.mode === "resent" ? "Invite resent" : "Invite sent" },
        }));
      } else {
        setInviteFeedback((m) => ({
          ...m,
          [row.id]: { type: "error", message: data?.error || "Couldn't send invite" },
        }));
      }
    } catch {
      setInviteFeedback((m) => ({
        ...m,
        [row.id]: { type: "error", message: "Network error" },
      }));
    }
    setInvitingId(null);
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-48 bg-gray-100 rounded animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const summary = {
    total: contacts.length,
    active: contacts.filter((c) => c.portalStatus === "active").length,
    pending: contacts.filter((c) => c.portalStatus === "pending").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton fallback={`/clients/${clientId}`} />
          <div>
            <h1 className="text-2xl font-bold">Contacts</h1>
            <p className="text-gray-500 text-sm">
              {summary.total} {summary.total === 1 ? "person" : "people"} at {client?.name}
              {summary.active > 0 && (
                <span className="ml-2 text-emerald-600">
                  · {summary.active} active portal
                </span>
              )}
              {summary.pending > 0 && (
                <span className="ml-2 text-amber-600">
                  · {summary.pending} pending
                </span>
              )}
            </p>
          </div>
        </div>
        <Link href={`/clients/${clientId}/contacts/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Add contact
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{error}</div>
      )}

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <UserCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 text-sm font-medium mb-1">No contacts yet</p>
            <p className="text-xs text-gray-400 mb-4 max-w-sm mx-auto">
              Add hiring managers and other client contacts here. You can invite them to the portal right away or later.
            </p>
            <Link href={`/clients/${clientId}/contacts/new`}>
              <Button size="sm">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add first contact
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Portal access</TableHead>
                  <TableHead className="text-right w-[180px]">&nbsp;</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((row) => {
                  const isEditing = editingId === row.contactId && row.contactId;
                  const fb = inviteFeedback[row.id];
                  const canInvite = !!row.contactId && !!row.email && row.portalStatus !== "active";

                  if (isEditing) {
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex gap-2">
                            <Input
                              className="h-8 w-24"
                              value={editForm.firstName}
                              onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                              placeholder="First"
                            />
                            <Input
                              className="h-8 w-24"
                              value={editForm.lastName}
                              onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                              placeholder="Last"
                            />
                          </div>
                          <Input
                            className="h-8 mt-2"
                            value={editForm.title}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            placeholder="Title"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <PhoneInput
                            compact
                            value={editForm.phone}
                            onChange={(val) => setEditForm({ ...editForm, phone: val })}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusPill status={row.portalStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="ghost" onClick={saveEdit} disabled={saving}>
                              {saving ? "…" : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow key={row.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                            {initials(row.name) || "?"}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-gray-900 truncate">{row.name}</span>
                              {row.portalRole === "ADMIN" && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
                                  title="Portal admin"
                                >
                                  <Shield className="h-2.5 w-2.5" />
                                  Admin
                                </span>
                              )}
                            </div>
                            {row.title && (
                              <div className="text-xs text-gray-500 truncate">{row.title}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.email ? (
                          <a
                            href={`mailto:${row.email}`}
                            className="text-sm text-gray-700 hover:text-indigo-600"
                          >
                            {row.email}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.phone ? (
                          <span className="text-sm text-gray-700">{row.phone}</span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={row.portalStatus} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canInvite ? (
                            <div className="flex flex-col items-end gap-0.5 max-w-[180px] ml-auto">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1.5"
                                disabled={invitingId === row.id}
                                onClick={() => sendInvite(row)}
                              >
                                {row.portalStatus === "pending" ? (
                                  <>
                                    <Send className="h-3 w-3" />
                                    {invitingId === row.id ? "Resending…" : "Resend"}
                                  </>
                                ) : (
                                  <>
                                    <MailPlus className="h-3 w-3" />
                                    {invitingId === row.id ? "Inviting…" : "Invite"}
                                  </>
                                )}
                              </Button>
                              {fb && (
                                <span
                                  className={`text-[10px] leading-tight whitespace-normal break-words text-right ${
                                    fb.type === "success" ? "text-emerald-600" : "text-red-600"
                                  }`}
                                  title={fb.message}
                                >
                                  {fb.message}
                                </span>
                              )}
                            </div>
                          ) : row.portalStatus === "active" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <KeyRound className="h-3 w-3" />
                              In portal
                            </span>
                          ) : row.contactId && !row.email ? (
                            // No email → no invite. Nudge the recruiter
                            // to add one rather than just hiding the
                            // action quietly.
                            <span className="text-[11px] text-gray-400 italic">
                              Add an email to invite
                            </span>
                          ) : null}

                          {row.contactId && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEdit(row)}
                                title="Edit"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700"
                                onClick={() => deleteContact(row.contactId!)}
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
