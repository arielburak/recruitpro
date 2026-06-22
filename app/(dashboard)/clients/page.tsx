"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Building2, Trash2 } from "lucide-react";
import { DateRangeFilter, type DateRange, dateInRange } from "@/components/ui/date-range-filter";

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  // "all" = no filter, "RECRUITING" or "STAFF_AUG" filters the list
  // by engagement model. Empty/legacy engagementType is treated as
  // RECRUITING (that's the schema default) so legacy rows show up
  // under Headhunting.
  const [engagementFilter, setEngagementFilter] = useState<"all" | "RECRUITING" | "STAFF_AUG">("all");

  // Bulk selection (same pattern as /candidates and /jobs).
  // 'Delete' on the agency side disengages from the shared Client
  // — see shared-Client model in PR #139. The Client itself stays
  // for other engaged agencies.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible(checked: boolean, ids: string[]) {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }
  async function bulkDelete() {
    if (selectedIds.size === 0 || bulkDeleting) return;
    const n = selectedIds.size;
    if (!confirm(`Remove ${n} client${n === 1 ? "" : "s"} from your workspace? Their jobs / candidates / engagements stay in the system but you'll need to re-engage to see them again.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/clients/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        const dead = new Set(selectedIds);
        setClients((arr) => arr.filter((c) => !dead.has(c.id)));
        setSelectedIds(new Set());
      }
    } catch {}
    setBulkDeleting(false);
  }

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => {
        // /api/clients returns { error } on 401/500, not an array. Normalize
        // to [] so downstream `for (const c of clients)` doesn't blow up
        // with "X is not iterable" (Sentry: TypeError on /clients).
        setClients(Array.isArray(data) ? data : []);
        setSelectedIds(new Set());
        setLoading(false);
      })
      .catch(() => {
        setClients([]);
        setLoading(false);
      });
  }, []);

  async function deleteClient(id: string, name: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${name}"? This will also delete all associated jobs and data. This cannot be undone.`)) return;
    await fetch(`/api/clients/${id}`, { method: "DELETE" });
    setClients(clients.filter((c) => c.id !== id));
  }

  const engagementCounts = useMemo(() => {
    let recruiting = 0;
    let staffAug = 0;
    for (const c of clients) {
      if (c.engagementType === "STAFF_AUG") staffAug++;
      else recruiting++;
    }
    return { recruiting, staffAug };
  }, [clients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (!dateInRange(c.createdAt, dateRange)) return false;
      if (engagementFilter !== "all") {
        const type = c.engagementType === "STAFF_AUG" ? "STAFF_AUG" : "RECRUITING";
        if (type !== engagementFilter) return false;
      }
      if (!q) return true;
      const primary = c.contacts?.[0];
      const primaryName = primary ? `${primary.firstName || ""} ${primary.lastName || ""}` : "";
      return (
        c.name.toLowerCase().includes(q) ||
        (c.industry || "").toLowerCase().includes(q) ||
        primaryName.toLowerCase().includes(q) ||
        (primary?.email || "").toLowerCase().includes(q)
      );
    });
  }, [clients, search, dateRange, engagementFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-gray-500">{clients.length} companies</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton type="clients" disabled={clients.length === 0} />
          <Link href="/clients/new">
            <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> Add Client</Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, industry, contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
        <select
          value={engagementFilter}
          onChange={(e) => setEngagementFilter(e.target.value as "all" | "RECRUITING" | "STAFF_AUG")}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="all">All types ({clients.length})</option>
          <option value="RECRUITING">Headhunting / Recruiting ({engagementCounts.recruiting})</option>
          <option value="STAFF_AUG">Staff Aug / Outsourcing ({engagementCounts.staffAug})</option>
        </select>
        <DateRangeFilter value={dateRange} onChange={setDateRange} label="Created" />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
          <span className="text-sm font-medium text-indigo-900">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-indigo-700 hover:text-indigo-900"
          >
            Clear
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ExportCsvButton type="clients" ids={Array.from(selectedIds)} variant="subtle" />
            <button
              type="button"
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {bulkDeleting ? "Removing…" : "Remove from workspace"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-11 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {search ? "No clients match your search" : "No clients yet. Add your first client company."}
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="grid grid-cols-[36px_1fr_120px_140px_1fr_70px_36px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider items-center">
            <div>
              <input
                type="checkbox"
                aria-label="Select all visible clients"
                checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                onChange={(e) => selectAllVisible(e.target.checked, filtered.map((c) => c.id))}
                className="rounded border-gray-300"
              />
            </div>
            <div>Company</div>
            <div>Industry</div>
            <div>Primary contact</div>
            <div>Email</div>
            <div className="text-right">Jobs</div>
            <div></div>
          </div>

          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={`group grid grid-cols-[36px_1fr_120px_140px_1fr_70px_36px] gap-0 px-4 py-2.5 items-center hover:bg-indigo-50/50 transition-colors ${
                i < filtered.length - 1 ? "border-b border-gray-100" : ""
              } ${selectedIds.has(c.id) ? "bg-indigo-50/30" : ""}`}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${c.name}`}
                  checked={selectedIds.has(c.id)}
                  onChange={() => toggleSelected(c.id)}
                  className="rounded border-gray-300"
                />
              </div>
              <Link href={`/clients/${c.id}`} className="contents">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  {c.engagementType === "STAFF_AUG" && (
                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                      Staff Aug
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">{c.industry || "—"}</p>
                </div>
                <div className="min-w-0">
                  {c.contacts?.[0] ? (
                    <p className="text-sm text-gray-600 truncate">
                      {c.contacts[0].firstName} {c.contacts[0].lastName}
                    </p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
                <div className="min-w-0">
                  {c.contacts?.[0]?.email ? (
                    <p className="text-xs text-gray-400 truncate">{c.contacts[0].email}</p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {c._count.jobs}
                  </Badge>
                </div>
                <div>
                  <button
                    onClick={(e) => deleteClient(c.id, c.name, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 rounded"
                    title="Delete client"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
