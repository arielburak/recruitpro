"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Mail, Phone, Globe, Plus, Pencil, Trash2, UserCircle } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/constants";

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [savingContact, setSavingContact] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    title: "",
    email: "",
    phone: "",
    isPrimary: false,
  });
  const [contactError, setContactError] = useState("");

  useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((data) => { setClient(data); setLoading(false); });
  }, [clientId]);

  useEffect(() => {
    fetch(`/api/contacts?clientId=${clientId}`)
      .then((r) => r.json())
      .then((data) => { setContacts(data); setContactsLoading(false); })
      .catch(() => setContactsLoading(false));
  }, [clientId]);

  function startEditContact(contact: any) {
    setEditingContactId(contact.id);
    setEditForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title || "",
      email: contact.email || "",
      phone: contact.phone || "",
      isPrimary: contact.isPrimary,
    });
  }

  async function saveContact(id: string) {
    setSavingContact(true);
    setContactError("");
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const body = await res.json();
        setContactError(body.error || "Failed to update");
        setSavingContact(false);
        return;
      }
      const updated = await fetch(`/api/contacts?clientId=${clientId}`).then((r) => r.json());
      setContacts(updated);
      setEditingContactId(null);
    } catch {
      setContactError("Failed to update contact");
    }
    setSavingContact(false);
  }

  async function deleteContact(id: string) {
    if (!confirm("Delete this contact?")) return;
    try {
      await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      setContacts(contacts.filter((c) => c.id !== id));
    } catch {
      setContactError("Failed to delete contact");
    }
  }

  async function createContact() {
    if (!newContact.firstName || !newContact.lastName) {
      setContactError("First and last name are required");
      return;
    }
    setSavingContact(true);
    setContactError("");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newContact, clientId }),
      });
      if (!res.ok) {
        const body = await res.json();
        setContactError(body.error || "Failed to create contact");
        setSavingContact(false);
        return;
      }
      const updated = await fetch(`/api/contacts?clientId=${clientId}`).then((r) => r.json());
      setContacts(updated);
      setAddingContact(false);
      setNewContact({ firstName: "", lastName: "", title: "", email: "", phone: "", isPrimary: false });
    } catch {
      setContactError("Failed to create contact");
    }
    setSavingContact(false);
  }

  async function deleteClient() {
    if (!confirm(`Delete "${client.name}"? This will also delete all associated jobs, pipeline data, and contacts. This cannot be undone.`)) return;
    try {
      await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      router.push("/clients");
    } catch {
      // stay on page
    }
  }

  if (loading) return <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />;
  if (!client) return <p className="text-gray-500">Client not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clients">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{client.name}</h1>
            {client.industry && <p className="text-gray-500">{client.industry}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/jobs/new?clientId=${client.id}`}>
            <Button>Create Job for {client.name}</Button>
          </Link>
          <Button
            variant="outline"
            className="text-red-600 border-red-300 hover:bg-red-50"
            onClick={async () => {
              if (!confirm("Are you sure you want to delete this client? This action cannot be undone.")) return;
              try {
                const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
                if (res.ok) {
                  router.push("/clients");
                } else {
                  alert("Failed to delete client.");
                }
              } catch {
                alert("Failed to delete client.");
              }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete Client
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Contact Info</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {client.contactName && <p className="text-sm font-medium">{client.contactName}</p>}
            {client.contactEmail && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <a href={`mailto:${client.contactEmail}`} className="text-indigo-600 hover:underline">{client.contactEmail}</a>
              </div>
            )}
            {client.contactPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-gray-400" /> {client.contactPhone}
              </div>
            )}
            {client.website && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="h-4 w-4 text-gray-400" />
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  {client.website}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Client Portal Users</CardTitle></CardHeader>
          <CardContent>
            {client.clientUsers?.length === 0 ? (
              <p className="text-sm text-gray-400">No portal users yet.</p>
            ) : (
              <div className="space-y-2">
                {client.clientUsers?.map((u: any) => (
                  <div key={u.id} className="flex items-center justify-between text-sm">
                    <span>{u.name} ({u.email})</span>
                    <Badge variant={u.isActive ? "default" : "secondary"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Jobs / Searches</TabsTrigger>
          <TabsTrigger value="contacts">
            Contacts {contacts.length > 0 && `(${contacts.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          <Card>
            <CardContent className="pt-6">
              {client.jobs?.length === 0 ? (
                <p className="text-sm text-gray-400">No jobs yet for this client.</p>
              ) : (
                <div className="space-y-2">
                  {client.jobs?.map((j: any) => (
                    <Link key={j.id} href={`/jobs/${j.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                        <div>
                          <h3 className="font-medium">{j.title}</h3>
                          <p className="text-sm text-gray-500">{j._count.submissions} candidates</p>
                        </div>
                        <Badge className={JOB_STATUS_COLORS[j.status]}>{JOB_STATUS_LABELS[j.status]}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Contacts</CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddingContact(!addingContact)}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add Inline
                  </Button>
                  <Link href={`/clients/${clientId}/contacts/new`}>
                    <Button size="sm">
                      <Plus className="mr-1 h-4 w-4" /> Full Form
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {contactError && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{contactError}</div>
              )}
              {contactsLoading ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : contacts.length === 0 && !addingContact ? (
                <div className="text-center py-8">
                  <UserCircle className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No contacts yet for this client.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Primary</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {addingContact && (
                      <TableRow>
                        <TableCell>
                          <div className="flex gap-1">
                            <Input
                              className="h-8 w-20"
                              placeholder="First"
                              value={newContact.firstName}
                              onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                            />
                            <Input
                              className="h-8 w-20"
                              placeholder="Last"
                              value={newContact.lastName}
                              onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            placeholder="Title"
                            value={newContact.title}
                            onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            placeholder="Email"
                            value={newContact.email}
                            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-8"
                            placeholder="Phone"
                            value={newContact.phone}
                            onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={newContact.isPrimary}
                            onChange={(e) => setNewContact({ ...newContact, isPrimary: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={createContact} disabled={savingContact}>
                              {savingContact ? "..." : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setAddingContact(false)}>
                              X
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {contacts.map((contact) =>
                      editingContactId === contact.id ? (
                        <TableRow key={contact.id}>
                          <TableCell>
                            <div className="flex gap-1">
                              <Input
                                className="h-8 w-20"
                                value={editForm.firstName}
                                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                              />
                              <Input
                                className="h-8 w-20"
                                value={editForm.lastName}
                                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
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
                            <Input
                              className="h-8"
                              value={editForm.phone}
                              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={editForm.isPrimary}
                              onChange={(e) => setEditForm({ ...editForm, isPrimary: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => saveContact(contact.id)} disabled={savingContact}>
                                {savingContact ? "..." : "Save"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingContactId(null)}>
                                X
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow key={contact.id} className="cursor-pointer hover:bg-gray-50" onClick={() => startEditContact(contact)}>
                          <TableCell className="font-medium">
                            {contact.firstName} {contact.lastName}
                          </TableCell>
                          <TableCell>{contact.title || "-"}</TableCell>
                          <TableCell>
                            {contact.email ? (
                              <span className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3 text-gray-400" /> {contact.email}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            {contact.phone ? (
                              <span className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3 text-gray-400" /> {contact.phone}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell>
                            {contact.isPrimary && (
                              <Badge className="bg-indigo-100 text-indigo-800">Primary</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" onClick={() => startEditContact(contact)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => deleteContact(contact.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
