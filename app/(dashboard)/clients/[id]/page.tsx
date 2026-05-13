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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Mail, Phone, Globe, Plus, Pencil, Trash2, UserCircle } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { CurrencyPicker } from "@/components/ui/currency-picker";
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

  // Client edit state
  const [editingClient, setEditingClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [clientForm, setClientForm] = useState({
    name: "",
    industry: "",
    website: "",
    notes: "",
    engagementType: "RECRUITING" as "RECRUITING" | "STAFF_AUG",
    defaultCurrency: "USD",
    defaultFeeType: "PERCENTAGE",
    defaultFeeAmount: "" as string | number,
    defaultPaymentTerms: "" as string | number,
    defaultGuaranteePeriod: "" as string | number,
  });

  function startEditClient() {
    setClientForm({
      name: client.name || "",
      industry: client.industry || "",
      website: client.website || "",
      notes: client.notes || "",
      engagementType: (client.engagementType === "STAFF_AUG" ? "STAFF_AUG" : "RECRUITING"),
      defaultCurrency: client.defaultCurrency || "USD",
      defaultFeeType: client.defaultFeeType || "PERCENTAGE",
      defaultFeeAmount: client.defaultFeeAmount ? Number(client.defaultFeeAmount) : "",
      defaultPaymentTerms: client.defaultPaymentTerms ?? "",
      defaultGuaranteePeriod: client.defaultGuaranteePeriod ?? "",
    });
    setEditingClient(true);
  }

  async function saveClient() {
    setSavingClient(true);
    try {
      // For staff-aug clients we don't persist fee defaults — every
      // search sets its own. Force them to null on save so flipping
      // between types doesn't leave stale values behind.
      const isRecruiting = clientForm.engagementType === "RECRUITING";
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...clientForm,
          defaultCurrency: isRecruiting ? clientForm.defaultCurrency : null,
          defaultFeeType: isRecruiting ? clientForm.defaultFeeType : null,
          defaultFeeAmount:
            isRecruiting && clientForm.defaultFeeAmount
              ? Number(clientForm.defaultFeeAmount)
              : null,
          defaultPaymentTerms:
            isRecruiting && clientForm.defaultPaymentTerms !== ""
              ? Number(clientForm.defaultPaymentTerms)
              : null,
          defaultGuaranteePeriod:
            isRecruiting && clientForm.defaultGuaranteePeriod !== ""
              ? Number(clientForm.defaultGuaranteePeriod)
              : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to save");
      } else {
        setEditingClient(false);
        const updated = await fetch(`/api/clients/${clientId}`).then((r) => r.json());
        setClient(updated);
      }
    } catch {
      alert("Failed to save");
    } finally {
      setSavingClient(false);
    }
  }

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
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-gray-500">Client Details</CardTitle>
              {!editingClient && (
                <Button variant="outline" size="sm" onClick={startEditClient}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!editingClient ? (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Engagement type</p>
                  <div className="flex items-center gap-2">
                    {client.engagementType === "STAFF_AUG" ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          Staff Augmentation
                        </span>
                        <span className="text-xs text-gray-400">per-search economics</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                          Headhunting / Recruiting
                        </span>
                        <span className="text-xs text-gray-400">defaults auto-fill per search</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Industry</p>
                    <p className="text-sm font-medium text-gray-900">{client.industry || "—"}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Website</p>
                    {client.website ? (
                      <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline">{client.website}</a>
                    ) : <p className="text-sm text-gray-900">—</p>}
                  </div>
                </div>
                {client.engagementType !== "STAFF_AUG" && (client.defaultFeeAmount || client.defaultCurrency) && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Default Fee Terms</p>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-medium">
                        {client.defaultFeeType === "FLAT" ? "Flat Fee" : "Percentage"}
                        {client.defaultFeeAmount ? `: ${Number(client.defaultFeeAmount)}${client.defaultFeeType === "PERCENTAGE" ? "%" : ""}` : ""}
                      </span>
                      <span className="text-gray-400">·</span>
                      <span>{client.defaultCurrency || "USD"}</span>
                    </div>
                  </div>
                )}
                {client.notes && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{client.notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-end gap-2 mb-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingClient(false)} disabled={savingClient}>Cancel</Button>
                  <Button size="sm" onClick={saveClient} disabled={savingClient}>{savingClient ? "Saving..." : "Save"}</Button>
                </div>
                <div className="space-y-2">
                  <Label>Company Name *</Label>
                  <Input value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input value={clientForm.industry} onChange={(e) => setClientForm({ ...clientForm, industry: e.target.value })} placeholder="Technology, Finance..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input value={clientForm.website} onChange={(e) => setClientForm({ ...clientForm, website: e.target.value })} placeholder="https://..." />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Engagement type</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={clientForm.engagementType}
                    onChange={(e) => setClientForm({ ...clientForm, engagementType: e.target.value as "RECRUITING" | "STAFF_AUG" })}
                  >
                    <option value="RECRUITING">Headhunting / Recruiting</option>
                    <option value="STAFF_AUG">Staff Augmentation / Outsourcing</option>
                  </select>
                  <p className="text-[11px] text-gray-400">
                    {clientForm.engagementType === "STAFF_AUG"
                      ? "Every search negotiates its own fee terms — we won't save any defaults on this client."
                      : "Fee defaults on this client auto-fill when you create a search."}
                  </p>
                </div>
                {clientForm.engagementType === "RECRUITING" && (
                  <div className="border-t pt-3 mt-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Default Fee Terms</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Currency</Label>
                        <CurrencyPicker
                          compact
                          value={clientForm.defaultCurrency}
                          onChange={(c) => setClientForm({ ...clientForm, defaultCurrency: c })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Fee Type</Label>
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                          value={clientForm.defaultFeeType}
                          onChange={(e) => setClientForm({ ...clientForm, defaultFeeType: e.target.value })}
                        >
                          <option value="PERCENTAGE">Percentage</option>
                          <option value="FLAT">Flat Fee</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Fee Amount</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                            {clientForm.defaultFeeType === "FLAT" ? "$" : "%"}
                          </span>
                          <Input
                            className="h-9 pl-7"
                            type="number"
                            step="0.01"
                            placeholder="e.g. 15"
                            value={clientForm.defaultFeeAmount}
                            onChange={(e) => setClientForm({ ...clientForm, defaultFeeAmount: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Payment terms (days)</Label>
                        <Input
                          className="h-9"
                          type="number"
                          min={0}
                          placeholder="30"
                          value={clientForm.defaultPaymentTerms}
                          onChange={(e) => setClientForm({ ...clientForm, defaultPaymentTerms: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Guarantee period (days)</Label>
                        <Input
                          className="h-9"
                          type="number"
                          min={0}
                          placeholder="90"
                          value={clientForm.defaultGuaranteePeriod}
                          onChange={(e) => setClientForm({ ...clientForm, defaultGuaranteePeriod: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea rows={3} value={clientForm.notes} onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })} placeholder="Internal notes about this client..." />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <Tabs defaultValue="jobs" className="space-y-3">
        <TabsList>
          <TabsTrigger value="jobs">Jobs / Searches</TabsTrigger>
          <TabsTrigger value="contacts">
            Contacts {contacts.length > 0 && `(${contacts.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-0">
          <Card>
            <CardContent className="p-4">
              {client.jobs?.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-400">No jobs yet for this client.</p>
                </div>
              ) : (
                <div className="space-y-1">
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

        <TabsContent value="contacts" className="mt-0">
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
                          <PhoneInput
                            compact
                            value={newContact.phone}
                            onChange={(val) => setNewContact({ ...newContact, phone: val })}
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
                            <PhoneInput
                              compact
                              value={editForm.phone}
                              onChange={(val) => setEditForm({ ...editForm, phone: val })}
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
                        <TableRow key={contact.id} className="hover:bg-gray-50">
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
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => startEditContact(contact)} title="Edit contact">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => deleteContact(contact.id)} title="Delete contact">
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
