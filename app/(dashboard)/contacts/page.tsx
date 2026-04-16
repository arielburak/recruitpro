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
import { UserRound, Mail, Phone, Search, Building2, Plus } from "lucide-react";

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedIn: string | null;
  isPrimary: boolean;
  client: { id: string; name: string };
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((data) => {
        setContacts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    contacts.forEach((c) => m.set(c.client.id, c.client.name));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (clientFilter !== "all" && c.client.id !== clientFilter) return false;
      if (!q) return true;
      const haystack = [
        c.firstName,
        c.lastName,
        c.title,
        c.email,
        c.phone,
        c.client.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [contacts, search, clientFilter]);

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
              {loading ? "Loading..." : `${contacts.length} contacts across ${clients.length} clients`}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
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
            {contacts.length === 0 ? (
              <>
                <p className="text-sm text-gray-500 mb-3">No contacts yet.</p>
                <p className="text-xs text-gray-400 mb-4">Add contacts from within each client&apos;s detail page.</p>
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
                  <TableHead>Primary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell className="font-medium">
                      <Link href={`/clients/${c.client.id}`} className="hover:text-indigo-600">
                        {c.firstName} {c.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-gray-700">{c.title || "—"}</TableCell>
                    <TableCell>
                      <Link href={`/clients/${c.client.id}`} className="text-sm text-indigo-600 hover:underline inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-gray-400" />
                        {c.client.name}
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
                      {c.isPrimary ? (
                        <Badge className="bg-indigo-100 text-indigo-800 text-[10px]">Primary</Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
