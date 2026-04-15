"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Briefcase, Trash2, X, Filter, ChevronDown } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/constants";

// ─── Filter Dropdown Component ───

function FilterDropdown({
  label,
  value,
  options,
  onChange,
  colorMap,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; count: number }[];
  onChange: (v: string) => void;
  colorMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          value
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        {label}
        {value && (
          <>
            <span className="text-indigo-400">:</span>
            <span className="max-w-[100px] truncate">
              {options.find((o) => o.value === value)?.label || value}
            </span>
          </>
        )}
        {value ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setOpen(false);
            }}
            className="ml-0.5 hover:bg-indigo-200 rounded p-0.5"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown className="h-3 w-3 text-gray-400" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 left-0 bg-white border rounded-lg shadow-lg min-w-[200px] max-h-[280px] overflow-y-auto py-1">
            {value && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear filter
              </button>
            )}
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2 ${
                  opt.value === value ? "bg-indigo-50 text-indigo-700" : ""
                }`}
                onClick={() => {
                  onChange(opt.value === value ? "" : opt.value);
                  setOpen(false);
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {colorMap && colorMap[opt.value] && (
                    <Badge className={`${colorMap[opt.value]} text-[10px] px-1.5 py-0 shrink-0`}>
                      {opt.label}
                    </Badge>
                  )}
                  {!(colorMap && colorMap[opt.value]) && (
                    <span className="truncate">{opt.label}</span>
                  )}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0">{opt.count}</span>
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">No options</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ───

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
    if (
      !confirm(
        `Delete "${title}"? This will remove all pipeline data. This cannot be undone.`
      )
    )
      return;
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
      // Status
      statuses.set(j.status, (statuses.get(j.status) || 0) + 1);

      // Location
      if (j.location) {
        const loc = j.location.trim();
        locations.set(loc, (locations.get(loc) || 0) + 1);
      }

      // Client
      if (j.client) {
        const existing = clients.get(j.client.id);
        if (existing) {
          existing.count++;
        } else {
          clients.set(j.client.id, { name: j.client.name, count: 1 });
        }
      }

      // Recruiters (assigned)
      if (j.assignments) {
        for (const a of j.assignments) {
          const existing = recruiters.get(a.user.id);
          if (existing) {
            existing.count++;
          } else {
            recruiters.set(a.user.id, { name: a.user.name, count: 1 });
          }
        }
      }
    }

    return {
      statuses: Array.from(statuses.entries())
        .map(([value, count]) => ({
          value,
          label: JOB_STATUS_LABELS[value] || value,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      locations: Array.from(locations.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      clients: Array.from(clients.entries())
        .map(([value, data]) => ({
          value,
          label: data.name,
          count: data.count,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      recruiters: Array.from(recruiters.entries())
        .map(([value, data]) => ({
          value,
          label: data.name,
          count: data.count,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [jobs]);

  // Apply all filters
  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      // Text search
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          j.title.toLowerCase().includes(q) ||
          j.client.name.toLowerCase().includes(q) ||
          (j.location || "").toLowerCase().includes(q) ||
          (j.assignments || []).some((a: any) =>
            a.user.name.toLowerCase().includes(q)
          );
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter && j.status !== statusFilter) return false;

      // Location filter
      if (locationFilter && j.location?.trim() !== locationFilter) return false;

      // Client filter
      if (clientFilter && j.client.id !== clientFilter) return false;

      // Recruiter filter
      if (
        recruiterFilter &&
        !(j.assignments || []).some(
          (a: any) => a.user.id === recruiterFilter
        )
      )
        return false;

      return true;
    });
  }, [jobs, search, statusFilter, locationFilter, clientFilter, recruiterFilter]);

  const activeFilterCount = [
    statusFilter,
    locationFilter,
    clientFilter,
    recruiterFilter,
  ].filter(Boolean).length;

  function clearAllFilters() {
    setStatusFilter("");
    setLocationFilter("");
    setClientFilter("");
    setRecruiterFilter("");
    setSearch("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs / Searches</h1>
          <p className="text-sm text-gray-500">{jobs.length} total</p>
        </div>
        <Link href="/jobs/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Job
          </Button>
        </Link>
      </div>

      {/* Search + Filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by title, client, location, recruiter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mr-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Filters:</span>
          </div>

          <FilterDropdown
            label="Status"
            value={statusFilter}
            options={filterOptions.statuses}
            onChange={setStatusFilter}
            colorMap={JOB_STATUS_COLORS}
          />

          <FilterDropdown
            label="Client"
            value={clientFilter}
            options={filterOptions.clients}
            onChange={setClientFilter}
          />

          <FilterDropdown
            label="Location"
            value={locationFilter}
            options={filterOptions.locations}
            onChange={setLocationFilter}
          />

          <FilterDropdown
            label="Recruiter"
            value={recruiterFilter}
            options={filterOptions.recruiters}
            onChange={setRecruiterFilter}
          />

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors ml-1"
            >
              <X className="h-3 w-3" />
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Results count when filtered */}
        {(search || activeFilterCount > 0) && (
          <p className="text-xs text-gray-400">
            Showing {filtered.length} of {jobs.length} jobs
          </p>
        )}
      </div>

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
            <button
              onClick={clearAllFilters}
              className="text-indigo-600 text-sm mt-2 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_100px_140px_100px_80px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div>Title</div>
            <div>Client</div>
            <div>Status</div>
            <div>Location</div>
            <div>Assigned</div>
            <div className="text-right">Cands</div>
          </div>

          {/* Rows */}
          {filtered.map((j: any, i: number) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="block">
              <div
                className={`group grid grid-cols-[1fr_1fr_100px_140px_100px_80px] gap-0 px-4 py-2.5 items-center hover:bg-indigo-50/50 transition-colors cursor-pointer ${
                  i < filtered.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                {/* Title */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {j.title}
                  </p>
                </div>

                {/* Client */}
                <div className="min-w-0">
                  <p className="text-sm text-gray-500 truncate">
                    {j.client.name}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <Badge
                    className={`${JOB_STATUS_COLORS[j.status]} text-[10px] px-1.5 py-0`}
                  >
                    {JOB_STATUS_LABELS[j.status]}
                  </Badge>
                </div>

                {/* Location */}
                <div className="min-w-0">
                  {j.location ? (
                    <p className="text-xs text-gray-500 truncate">
                      {j.location}
                    </p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                {/* Assigned */}
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">
                    {j.assignments
                      ?.map((a: any) => a.user.name)
                      .join(", ") || "—"}
                  </p>
                </div>

                {/* Candidates count */}
                <div className="text-right flex items-center justify-end gap-1">
                  {j._count.submissions > 0 ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {j._count.submissions}
                    </Badge>
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
