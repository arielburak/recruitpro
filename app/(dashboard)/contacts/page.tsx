"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRound, Search, Building2, Shield, KeyRound, Trash2, Send, MailPlus } from "lucide-react";
import { DateRangeFilter, type DateRange, dateInRange } from "@/components/ui/date-range-filter";

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

// Pick a stable accent color per Client so the avatars line up by
// company in a long list. Eight slots is plenty before colors repeat.
const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
];
function avatarColor(clientId: string): string {
  let h = 0;
  for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

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

export default function ContactsPage() {
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  // Status filter values mirror UnifiedContact.portalStatus, plus "all"
  // and an "any portal" superset for the common "anyone who can log in"
  // question.
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "none" | "any">("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });

  // Bulk delete only touches rows that came from the Contact table —
  // portal users have their own removal path that affects login +
  // history, and we don't want to nuke that from a multi-select.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Per-row invite state. The action button can either invite (none →
  // pending) or resend (pending → fresh token + mail), both via the
  // idempotent /invite-portal endpoint.
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});

  function toggleSelected(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible(checked: boolean, rows: UnifiedContact[]) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      rows.forEach((r) => {
        if (!r.contactId) return;
        if (checked) next.add(r.id);
        else next.delete(r.id);
      });
      return next;
    });
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
        // Optimistic: a fresh "none" jumps to "pending"; a "pending"
        // resend stays pending but signals success in the feedback row.
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
        [row.id]: { type: "error", message: "Network error — try again" },
      }));
    }
    setInvitingId(null);
  }

  async function bulkDelete() {
    if (selectedIds.size === 0 || bulkDeleting) return;
    const n = selectedIds.size;
    if (!confirm(`Delete ${n} contact${n === 1 ? "" : "s"}? Cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/contacts/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        const dead = new Set(selectedIds);
        setContacts((arr) => arr.filter((c) => !dead.has(c.id)));
        setSelectedIds(new Set());
      }
    } catch {}
    setBulkDeleting(false);
  }

  useEffect(() => {
    fetch("/api/contacts/all")
      .then((r) => r.json())
      .then((data) => {
        setContacts(Array.isArray(data) ? data : []);
        setSelectedIds(new Set());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    contacts.forEach((c) => m.set(c.clientId, c.clientName));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (clientFilter !== "all" && c.clientId !== clientFilter) return false;
      if (statusFilter === "active" && c.portalStatus !== "active") return false;
      if (statusFilter === "pending" && c.portalStatus !== "pending") return false;
      if (statusFilter === "none" && c.portalStatus !== "none") return false;
      if (statusFilter === "any" && c.portalStatus === "none") return false;
      if (!dateInRange(c.createdAt, dateRange)) return false;
      if (!q) return true;
      const haystack = [
        c.firstName,
        c.lastName,
        c.name,
        c.title,
        c.email,
        c.phone,
        c.clientName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [contacts, search, clientFilter, statusFilter, dateRange]);

  const counts = useMemo(() => {
    const active = contacts.filter((c) => c.portalStatus === "active").length;
    const pending = contacts.filter((c) => c.portalStatus === "pending").length;
    const none = contacts.filter((c) => c.portalStatus === "none").length;
    return { total: contacts.length, active, pending, none };
  }, [contacts]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <UserRound className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
            <p className="text-gray-500 text-sm">
              {loading
                ? "Loading…"
                : `${counts.total} ${counts.total === 1 ? "person" : "people"} across ${clients.length} ${clients.length === 1 ? "client" : "clients"}`}
            </p>
          </div>
        </div>
        <ExportCsvButton type="contacts" disabled={contacts.length === 0} />
      </div>

      {/* Stat strip — quick glance at portal coverage */}
      {!loading && counts.total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Active portal
            </div>
            <div className="text-xl font-semibold text-emerald-600">{counts.active}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Pending invite
            </div>
            <div className="text-xl font-semibold text-amber-600">{counts.pending}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              No portal access
            </div>
            <div className="text-xl font-semibold text-gray-600">{counts.none}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company…"
            className="pl-9"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="all">All clients</option>
          {clients.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active portal ({counts.active})</option>
          <option value="pending">Pending invite ({counts.pending})</option>
          <option value="none">No portal ({counts.none})</option>
          <option value="any">Any portal access ({counts.active + counts.pending})</option>
        </select>
        <DateRangeFilter value={dateRange} onChange={setDateRange} label="Added" />
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-md animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <UserRound className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            {counts.total === 0 ? (
              <>
                <p className="text-sm text-gray-600 mb-1 font-medium">No contacts yet</p>
                <p className="text-xs text-gray-400 mb-4 max-w-sm mx-auto">
                  Add hiring managers and other client contacts from each client&apos;s page. You can invite them to the portal later, or right away.
                </p>
                <Link href="/clients">
                  <Button variant="outline" size="sm">
                    <Building2 className="h-3.5 w-3.5 mr-1.5" /> Go to clients
                  </Button>
                </Link>
              </>
            ) : (
              <p className="text-sm text-gray-400">No contacts match your filters.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
              <span className="text-sm font-medium text-indigo-900">{selectedIds.size} selected</span>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-indigo-700 hover:text-indigo-900">
                Clear
              </button>
              <div className="ml-auto flex items-center gap-2">
                <ExportCsvButton type="contacts" ids={Array.from(selectedIds)} variant="subtle" />
                <button
                  type="button"
                  onClick={bulkDelete}
                  disabled={bulkDeleting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {bulkDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-9">
                      <input
                        type="checkbox"
                        aria-label="Select all visible contacts"
                        checked={
                          filtered.filter((c) => c.contactId).length > 0 &&
                          filtered.filter((c) => c.contactId).every((c) => selectedIds.has(c.id))
                        }
                        onChange={(e) => selectAllVisible(e.target.checked, filtered)}
                        className="rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Portal access</TableHead>
                    <TableHead className="text-right">&nbsp;</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const fb = inviteFeedback[c.id];
                    const canInvite = !!c.contactId && !!c.email && c.portalStatus !== "active";
                    return (
                      <TableRow key={c.id} className={`hover:bg-gray-50 ${selectedIds.has(c.id) ? "bg-indigo-50/30" : ""}`}>
                        <TableCell>
                          {c.contactId ? (
                            <input
                              type="checkbox"
                              aria-label={`Select ${c.name}`}
                              checked={selectedIds.has(c.id)}
                              onChange={() => toggleSelected(c.id)}
                              className="rounded border-gray-300"
                            />
                          ) : (
                            <input
                              type="checkbox"
                              disabled
                              title="Portal users have their own removal flow on the client page"
                              className="rounded border-gray-200 opacity-40"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColor(c.clientId)}`}>
                              {initials(c.name) || "?"}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Link
                                  href={`/clients/${c.clientId}`}
                                  className="font-medium text-gray-900 hover:text-indigo-600 truncate"
                                >
                                  {c.name}
                                </Link>
                                {c.portalRole === "ADMIN" && (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded"
                                    title="Portal admin"
                                  >
                                    <Shield className="h-2.5 w-2.5" />
                                    Admin
                                  </span>
                                )}
                              </div>
                              {c.title && (
                                <div className="text-xs text-gray-500 truncate">{c.title}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/clients/${c.clientId}`}
                            className="text-sm text-gray-700 hover:text-indigo-600"
                          >
                            {c.clientName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              className="text-sm text-gray-700 hover:text-indigo-600"
                            >
                              {c.email}
                            </a>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.phone ? (
                            <span className="text-sm text-gray-700">{c.phone}</span>
                          ) : (
                            <span className="text-sm text-gray-300">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusPill status={c.portalStatus} />
                        </TableCell>
                        <TableCell className="text-right">
                          {canInvite ? (
                            <div className="inline-flex flex-col items-end gap-0.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7 gap-1.5"
                                disabled={invitingId === c.id}
                                onClick={() => sendInvite(c)}
                              >
                                {c.portalStatus === "pending" ? (
                                  <>
                                    <Send className="h-3 w-3" />
                                    {invitingId === c.id ? "Resending…" : "Resend"}
                                  </>
                                ) : (
                                  <>
                                    <MailPlus className="h-3 w-3" />
                                    {invitingId === c.id ? "Inviting…" : "Invite"}
                                  </>
                                )}
                              </Button>
                              {fb && (
                                <span
                                  className={`text-[10px] ${
                                    fb.type === "success" ? "text-emerald-600" : "text-red-600"
                                  }`}
                                >
                                  {fb.message}
                                </span>
                              )}
                            </div>
                          ) : c.portalStatus === "active" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <KeyRound className="h-3 w-3" />
                              In portal
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
