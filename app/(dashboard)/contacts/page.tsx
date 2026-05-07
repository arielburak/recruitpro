"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRound, Mail, Phone, Search, Building2, Shield, Star, KeyRound } from "lucide-react";
import { DateRangeFilter, type DateRange, dateInRange } from "@/components/ui/date-range-filter";

type UnifiedContact = {
  id: string;
  isContact: boolean;
  hasPortalAccess: boolean;
  portalRole: string | null;
  firstName: string;
  lastName: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  clientId: string;
  clientName: string;
  createdAt: string;
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<UnifiedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  // "all" = everyone, "with" = has portal access, "without" = no portal access
  const [portalFilter, setPortalFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });

  useEffect(() => {
    fetch("/api/contacts/all")
      .then((r) => r.json())
      .then((data) => {
        setContacts(Array.isArray(data) ? data : []);
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
      if (portalFilter === "with" && !c.hasPortalAccess) return false;
      if (portalFilter === "without" && c.hasPortalAccess) return false;
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
  }, [contacts, search, clientFilter, portalFilter, dateRange]);

  const counts = useMemo(() => {
    return {
      total: contacts.length,
      withPortal: contacts.filter((c) => c.hasPortalAccess).length,
      withoutPortal: contacts.filter((c) => !c.hasPortalAccess).length,
    };
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
              {loading ? "Loading..." : `${counts.total} contacts across ${clients.length} clients`}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts, clients, emails..."
            className="pl-9"
          />
        </div>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="all">All Clients</option>
          {clients.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select
          value={portalFilter}
          onChange={(e) => setPortalFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="all">All ({counts.total})</option>
          <option value="with">With portal access ({counts.withPortal})</option>
          <option value="without">Without portal access ({counts.withoutPortal})</option>
        </select>
        <DateRangeFilter value={dateRange} onChange={setDateRange} label="Created" />
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
                <p className="text-sm text-gray-500 mb-3">No contacts yet.</p>
                <p className="text-xs text-gray-400 mb-4">
                  Add contacts from within each client&apos;s detail page, or invite them to the Client Portal.
                </p>
                <Link href="/clients">
                  <Button variant="outline" size="sm">
                    <Building2 className="h-3.5 w-3.5 mr-1" /> Go to Clients
                  </Button>
                </Link>
              </>
            ) : (
              <p className="text-sm text-gray-400">No contacts match your filters.</p>
            )}
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
                  <TableHead>Client</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="hover:bg-gray-50">
                    <TableCell>
                      <Link href={`/clients/${c.clientId}`} className="font-medium text-gray-900 hover:text-indigo-600 inline-flex items-center gap-1.5">
                        {c.isPrimary && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">{c.title || "—"}</TableCell>
                    <TableCell>
                      <Link href={`/clients/${c.clientId}`} className="text-sm text-indigo-600 hover:underline inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {c.clientName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-indigo-600">
                          <Mail className="h-3 w-3 text-gray-400" />
                          {c.email}
                        </a>
                      ) : <span className="text-sm text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                          <Phone className="h-3 w-3 text-gray-400" />
                          {c.phone}
                        </span>
                      ) : <span className="text-sm text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {c.hasPortalAccess ? (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-700">
                            <KeyRound className="h-2.5 w-2.5 mr-0.5" /> Portal
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-gray-100 text-gray-600">
                            Contact only
                          </Badge>
                        )}
                        {c.portalRole === "ADMIN" && (
                          <Badge className="text-[10px] bg-amber-50 text-amber-700">
                            <Shield className="h-2.5 w-2.5 mr-0.5" /> Admin
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      {!loading && counts.total > 0 && (
        <div className="text-xs text-gray-400 flex flex-wrap items-center gap-4 px-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <strong>Contact only</strong> — added from the client detail page
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <strong>Portal</strong> — has access to the Client Portal
          </span>
        </div>
      )}
    </div>
  );
}
