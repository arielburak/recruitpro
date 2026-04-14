"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Plus, UserCircle, Mail, Phone, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";

export default function ClientContactsPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [contacts, setContacts] = useState<any[]>([]);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/clients/${clientId}`).then((r) => r.json()),
      fetch(`/api/contacts?clientId=${clientId}`).then((r) => r.json()),
    ])
      .then(([clientData, contactsData]) => {
        setClient(clientData);
        setContacts(contactsData);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load data");
        setLoading(false);
      });
  }, [clientId]);

  function startEdit(contact: any) {
    setEditingId(contact.id);
    setEditForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || "",
      linkedIn: contact.linkedIn || "",
      isPrimary: contact.isPrimary,
      notes: contact.notes || "",
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/contacts/${id}`, {
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
      // Refresh contacts
      const updated = await fetch(`/api/contacts?clientId=${clientId}`).then((r) => r.json());
      setContacts(updated);
      setEditingId(null);
    } catch {
      setError("Failed to update contact");
    }
    setSaving(false);
  }

  async function deleteContact(id: string) {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to delete contact");
        return;
      }
      setContacts(contacts.filter((c) => c.id !== id));
    } catch {
      setError("Failed to delete contact");
    }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/clients/${clientId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to {client?.name || "Client"}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Contacts</h1>
            <p className="text-gray-500">
              {contacts.length} contact{contacts.length !== 1 ? "s" : ""} at {client?.name}
            </p>
          </div>
        </div>
        <Link href={`/clients/${clientId}/contacts/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Add Contact
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
      )}

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <UserCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No contacts yet. Add your first contact for this client.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) =>
                  editingId === contact.id ? (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <div className="flex gap-2">
                          <Input
                            className="h-8 w-24"
                            value={editForm.firstName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, firstName: e.target.value })
                            }
                            placeholder="First"
                          />
                          <Input
                            className="h-8 w-24"
                            value={editForm.lastName}
                            onChange={(e) =>
                              setEditForm({ ...editForm, lastName: e.target.value })
                            }
                            placeholder="Last"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={editForm.title}
                          onChange={(e) =>
                            setEditForm({ ...editForm, title: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={editForm.email}
                          onChange={(e) =>
                            setEditForm({ ...editForm, email: e.target.value })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <PhoneInput
                          compact
                          value={editForm.phone}
                          onChange={(val) =>
                            setEditForm({ ...editForm, phone: val })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={editForm.isPrimary}
                          onChange={(e) =>
                            setEditForm({ ...editForm, isPrimary: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => saveEdit(contact.id)}
                            disabled={saving}
                          >
                            {saving ? "..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow
                      key={contact.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => startEdit(contact)}
                    >
                      <TableCell className="font-medium">
                        {contact.firstName} {contact.lastName}
                      </TableCell>
                      <TableCell>{contact.title || "-"}</TableCell>
                      <TableCell>
                        {contact.email ? (
                          <span className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3 text-gray-400" />
                            {contact.email}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.phone ? (
                          <span className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-gray-400" />
                            {contact.phone}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.isPrimary && (
                          <Badge className="bg-indigo-100 text-indigo-800">Primary</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(contact)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => deleteContact(contact.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
