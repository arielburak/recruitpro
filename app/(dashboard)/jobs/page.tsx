"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Briefcase, Trash2, X } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/constants";

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [recruiterFilter, setRecruiterFilter] = useState("");

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => {
        setJobs(data);
        setLoading(false);
      });
  }, []);

  async function deleteJob(id: string, title: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${title}"? This will remove all pipeline data. This cannot be undone.`)) return;
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setJobs(jobs.filter((j) => j.id !== id));
  }

  // Extract unique filter options with counts
  const filterOptions = useMemo(() => {
    const statuses = new Map<string, number>();
    const locations = new Map<string, number>();
    const clients = new Map<string, { name: string; count: number }>();
    const recruiters = new Map<string, { name: string; count: number }>();

    for (const j of jobs) {
      statuses.set(j.status, (statuses.get(j.status) || 0) + 1);

      if (j.location) {
        const loc = j.location.trim();
        locations.set(loc, (locations.get(loc) || 0) + 1);
      }

      if (j.client) {
        const existing = clients.get(j.client.id);
        if (existing) existing.count++;
        else clients.set(j.client.id, { name: j.client.name, count: 1 });
      }

      if (j.assignments) {
        for (const a of j.assignments) {
          const existing = recruiters.get(a.user.id);
          if (existing) existing.count++;
          else recruiters.set(a.user.id, { name: a.user.name, count: 1 });
        }
      }
    }

    return {
      statuses: Array.from(statuses.entries())
        .map(([value, count]) => ({ value, label: JOB_STATUS_LABELS[value] || value, count }))
        .sort((a, b) => b.count - a.count),
      locations: Array.from(locations.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      clients: Array.from(clients.entries())
        .map(([value, data]) => ({ value, label: data.name, count: data.count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      recruiters: Array.from(recruiters.entries())
        .map(([value, data]) => ({ value, label: data.name, count: data.count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [jobs]);

  // Apply all filters
  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          j.title.toLowerCase().includes(q) ||
          j.client.name.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (statusFilter && j.status !== statusFilter) return false;
      if (locationFilter && j.location?.trim() !== locationFilter) return false;
      if (clientFilter && j.client.id !== clientFilter) return false;
      if (recruiterFilter && !(j.assignments || []).some((a: any) => a.user.id === recruiterFilter)) return false;
      return true;
    });
  }, [jobs, search, statusFilter, locationFilter, clientFilter, recruiterFilter]);

  const activeFilterCount = [statusFilter, locationFilter, clientFilter, recruiterFilter].filter(Boolean).length;

  function clearAllFilters() {
    setStatusFilter("");
    setLocationFilter("");
    setClientFilter("");
    setRecruiterFilter("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs / Searches</h1>
          <p className="text-sm text-gray-500">{jobs.length} total</p>
        </div>
        <Link href="/jobs/new">
          <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create Job</Button>
        </Link>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by title or client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-9 text-sm"
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0">Filters</span>
        <div className="h-4 w-px bg-gray-200" />

        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`h-8 rounded-md border text-xs font-medium px-2.5 pr-7 appearance-none bg-no-repeat bg-[length:12px] bg-[right_8px_center] cursor-pointer transition-colors ${
            statusFilter
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          }`}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z'/%3E%3C/svg%3E")` }}
        >
          <option value="">Status</option>
          {filterOptions.statuses.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
          ))}
        </select>

        {/* Client */}
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className={`h-8 rounded-md border text-xs font-medium px-2.5 pr-7 appearance-none bg-no-repeat bg-[length:12px] bg-[right_8px_center] cursor-pointer transition-colors max-w-[160px] ${
            clientFilter
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          }`}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z'/%3E%3C/svg%3E")` }}
        >
          <option value="">Client</option>
          {filterOptions.clients.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
          ))}
        </select>

        {/* Location */}
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className={`h-8 rounded-md border text-xs font-medium px-2.5 pr-7 appearance-none bg-no-repeat bg-[length:12px] bg-[right_8px_center] cursor-pointer transition-colors max-w-[160px] ${
            locationFilter
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          }`}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z'/%3E%3C/svg%3E")` }}
        >
          <option value="">Location</option>
          {filterOptions.locations.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
          ))}
        </select>

        {/* Recruiter */}
        <select
          value={recruiterFilter}
          onChange={(e) => setRecruiterFilter(e.target.value)}
          className={`h-8 rounded-md border text-xs font-medium px-2.5 pr-7 appearance-none bg-no-repeat bg-[length:12px] bg-[right_8px_center] cursor-pointer transition-colors max-w-[160px] ${
            recruiterFilter
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          }`}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%239ca3af'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z'/%3E%3C/svg%3E")` }}
        >
          <option value="">Recruiter</option>
          {filterOptions.recruiters.map((o) => (
            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
          ))}
        </select>

        {activeFilterCount > 0 && (
          <>
            <div className="h-4 w-px bg-gray-200" />
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              <X className="h-3 w-3" /> Clear ({activeFilterCount})
            </button>
          </>
        )}

        {/* Results count */}
        <div className="ml-auto">
          <span className="text-xs text-gray-400">
            {filtered.length === jobs.length
              ? `${jobs.length} jobs`
              : `${filtered.length} of ${jobs.length}`}
          </span>
        </div>
      </div>

      {/* Active filter tags */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {statusFilter && (
            <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-medium">
              Status: {JOB_STATUS_LABELS[statusFilter] || statusFilter}
              <button onClick={() => setStatusFilter("")} className="hover:bg-indigo-200 rounded-full p-0.5"><X className="h-3 w-3" /></button>
            </span>
          )}
          {clientFilter && (
            <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-medium">
              Client: {filterOptions.clients.find((c) => c.value === clientFilter)?.label}
              <button onClick={() => setClientFilter("")} className="hover:bg-indigo-200 rounded-full p-0.5"><X className="h-3 w-3" /></button>
            </span>
          )}
          {locationFilter && (
            <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-medium">
              Location: {locationFilter}
              <button onClick={() => setLocationFilter("")} className="hover:bg-indigo-200 rounded-full p-0.5"><X className="h-3 w-3" /></button>
            </span>
          )}
          {recruiterFilter && (
            <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-medium">
              Recruiter: {filterOptions.recruiters.find((r) => r.value === recruiterFilter)?.label}
              <button onClick={() => setRecruiterFilter("")} className="hover:bg-indigo-200 rounded-full p-0.5"><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-11 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Briefcase className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {search || activeFilterCount > 0
              ? "No jobs match your filters"
              : "No jobs yet. Create your first job order."}
          </p>
          {(search || activeFilterCount > 0) && (
            <button onClick={() => { clearAllFilters(); setSearch(""); }} className="text-indigo-600 text-sm mt-2 hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="grid grid-cols-[1fr_1fr_100px_140px_100px_80px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div>Title</div>
            <div>Client</div>
            <div>Status</div>
            <div>Location</div>
            <div>Assigned</div>
            <div className="text-right">Cands</div>
          </div>

          {filtered.map((j: any, i: number) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="block">
              <div className={`group grid grid-cols-[1fr_1fr_100px_140px_100px_80px] gap-0 px-4 py-2.5 items-center hover:bg-indigo-50/50 transition-colors cursor-pointer ${
                i < filtered.length - 1 ? "border-b border-gray-100" : ""
              }`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{j.title}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-500 truncate">{j.client.name}</p>
                </div>
                <div>
                  <Badge className={`${JOB_STATUS_COLORS[j.status]} text-[10px] px-1.5 py-0`}>
                    {JOB_STATUS_LABELS[j.status]}
                  </Badge>
                </div>
                <div className="min-w-0">
                  {j.location ? (
                    <p className="text-xs text-gray-500 truncate">{j.location}</p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">
                    {j.assignments?.map((a: any) => a.user.name).join(", ") || "—"}
                  </p>
                </div>
                <div className="text-right flex items-center justify-end gap-1">
                  {j._count.submissions > 0 ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{j._count.submissions}</Badge>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                  <button
                    onClick={(e) => deleteJob(j.id, j.title, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-0.5 rounded ml-1"
                    title="Delete job"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
