"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  Briefcase,
  Trash2,
  X,
  Check,
  ChevronDown,
  CheckCircle,
  Clock,
  Building2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

// ─── Status constants for ClientJob ───

const CLIENT_JOB_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  FILLED: "Filled",
  CLOSED: "Closed",
};

const CLIENT_JOB_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-green-100 text-green-800",
  FILLED: "bg-purple-100 text-purple-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

// ─── Notion-style Multi-Select Filter ───

function MultiFilter({
  label,
  selected,
  options,
  onChange,
  colorMap,
}: {
  label: string;
  selected: string[];
  options: { value: string; label: string; count: number }[];
  onChange: (values: string[]) => void;
  colorMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filteredOptions = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-md border text-xs font-medium transition-all ${
          hasSelection
            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
        }`}
      >
        <span>{label}</span>
        {hasSelection && (
          <span className="bg-emerald-200 text-emerald-800 rounded px-1 text-[10px] font-bold min-w-[16px] text-center">
            {selected.length}
          </span>
        )}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""} ${
            hasSelection ? "text-emerald-400" : "text-gray-400"
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[220px] overflow-hidden">
          <div className="p-1.5 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full h-7 pl-7 pr-2 text-xs rounded border-0 bg-gray-50 focus:outline-none focus:bg-gray-100 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="max-h-[240px] overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-3 text-center">No results</p>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors hover:bg-gray-50 ${
                      isSelected ? "text-emerald-700" : "text-gray-700"
                    }`}
                    onClick={() => toggle(opt.value)}
                  >
                    <div
                      className={`flex items-center justify-center h-3.5 w-3.5 rounded border shrink-0 transition-colors ${
                        isSelected
                          ? "bg-emerald-600 border-emerald-600"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </div>

                    <span className="flex-1 text-left truncate">
                      {colorMap && colorMap[opt.value] ? (
                        <Badge className={`${colorMap[opt.value]} text-[10px] px-1.5 py-0`}>
                          {opt.label}
                        </Badge>
                      ) : (
                        opt.label
                      )}
                    </span>

                    <span className="text-[10px] text-gray-400 shrink-0">{opt.count}</span>
                  </button>
                );
              })
            )}
          </div>

          {hasSelection && (
            <div className="border-t border-gray-100 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setQuery("");
                }}
                className="text-[11px] text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function ClientJobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [jobTypeFilter, setJobTypeFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [engagementFilter, setEngagementFilter] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/client-portal/jobs")
      .then((r) => r.json())
      .then((data) => {
        setJobs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function deleteJob(id: string, title: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/client-portal/jobs/${id}`, { method: "DELETE" });
    if (res.ok) setJobs(jobs.filter((j) => j.id !== id));
  }

  // Extract unique filter options with counts
  const filterOptions = useMemo(() => {
    const statuses = new Map<string, number>();
    const jobTypes = new Map<string, number>();
    const locations = new Map<string, number>();
    const engStatuses = new Map<string, number>();

    for (const j of jobs) {
      statuses.set(j.status, (statuses.get(j.status) || 0) + 1);
      jobTypes.set(j.jobType, (jobTypes.get(j.jobType) || 0) + 1);

      if (j.location) {
        const loc = j.location.trim();
        locations.set(loc, (locations.get(loc) || 0) + 1);
      }

      // Engagement status categories
      const accepted = j.engagements?.filter((e: any) => e.status === "ACCEPTED").length || 0;
      const pending = j.engagements?.filter((e: any) => e.status === "PENDING").length || 0;
      if (accepted > 0) engStatuses.set("has_accepted", (engStatuses.get("has_accepted") || 0) + 1);
      if (pending > 0) engStatuses.set("has_pending", (engStatuses.get("has_pending") || 0) + 1);
      if (!j.engagements || j.engagements.length === 0)
        engStatuses.set("no_firms", (engStatuses.get("no_firms") || 0) + 1);
    }

    const engLabels: Record<string, string> = {
      has_accepted: "Has active firms",
      has_pending: "Has pending firms",
      no_firms: "No firms yet",
    };

    return {
      statuses: Array.from(statuses.entries())
        .map(([value, count]) => ({ value, label: CLIENT_JOB_STATUS_LABELS[value] || value, count }))
        .sort((a, b) => b.count - a.count),
      jobTypes: Array.from(jobTypes.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count),
      locations: Array.from(locations.entries())
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      engStatuses: Array.from(engStatuses.entries())
        .map(([value, count]) => ({ value, label: engLabels[value] || value, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [jobs]);

  // Apply all filters
  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (search) {
        const q = search.toLowerCase();
        if (!j.title.toLowerCase().includes(q) && !(j.location || "").toLowerCase().includes(q))
          return false;
      }
      if (statusFilter.length > 0 && !statusFilter.includes(j.status)) return false;
      if (jobTypeFilter.length > 0 && !jobTypeFilter.includes(j.jobType)) return false;
      if (locationFilter.length > 0 && !locationFilter.includes(j.location?.trim())) return false;
      if (engagementFilter.length > 0) {
        const accepted = j.engagements?.filter((e: any) => e.status === "ACCEPTED").length || 0;
        const pending = j.engagements?.filter((e: any) => e.status === "PENDING").length || 0;
        const total = j.engagements?.length || 0;
        const matches =
          (engagementFilter.includes("has_accepted") && accepted > 0) ||
          (engagementFilter.includes("has_pending") && pending > 0) ||
          (engagementFilter.includes("no_firms") && total === 0);
        if (!matches) return false;
      }
      return true;
    });
  }, [jobs, search, statusFilter, jobTypeFilter, locationFilter, engagementFilter]);

  const activeFilters = [
    ...statusFilter.map((v) => ({
      type: "Status",
      value: v,
      label: CLIENT_JOB_STATUS_LABELS[v] || v,
      clear: () => setStatusFilter(statusFilter.filter((x) => x !== v)),
    })),
    ...jobTypeFilter.map((v) => ({
      type: "Type",
      value: v,
      label: v,
      clear: () => setJobTypeFilter(jobTypeFilter.filter((x) => x !== v)),
    })),
    ...locationFilter.map((v) => ({
      type: "Location",
      value: v,
      label: v,
      clear: () => setLocationFilter(locationFilter.filter((x) => x !== v)),
    })),
    ...engagementFilter.map((v) => ({
      type: "Firms",
      value: v,
      label: filterOptions.engStatuses.find((e) => e.value === v)?.label || v,
      clear: () => setEngagementFilter(engagementFilter.filter((x) => x !== v)),
    })),
  ];

  function clearAllFilters() {
    setStatusFilter([]);
    setJobTypeFilter([]);
    setLocationFilter([]);
    setEngagementFilter([]);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Jobs</h1>
          <p className="text-sm text-gray-500">{jobs.length} total</p>
        </div>
        <Link href="/client-portal/jobs/new">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Post a Job
          </Button>
        </Link>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by title or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-[30px] text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <MultiFilter
            label="Status"
            selected={statusFilter}
            options={filterOptions.statuses}
            onChange={setStatusFilter}
            colorMap={CLIENT_JOB_STATUS_COLORS}
          />
          <MultiFilter
            label="Job Type"
            selected={jobTypeFilter}
            options={filterOptions.jobTypes}
            onChange={setJobTypeFilter}
          />
          <MultiFilter
            label="Location"
            selected={locationFilter}
            options={filterOptions.locations}
            onChange={setLocationFilter}
          />
          <MultiFilter
            label="Firms"
            selected={engagementFilter}
            options={filterOptions.engStatuses}
            onChange={setEngagementFilter}
          />
        </div>
      </div>

      {/* Active filter pills */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeFilters.map((f) => (
            <span
              key={`${f.type}-${f.value}`}
              className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 pl-2 pr-1 py-0.5 rounded-md text-[11px] font-medium"
            >
              <span className="text-emerald-400">{f.type}:</span> {f.label}
              <button onClick={f.clear} className="hover:bg-emerald-200 rounded p-0.5 ml-0.5">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="text-[11px] text-gray-400 hover:text-red-500 transition-colors ml-1"
          >
            Clear all
          </button>
          <span className="text-[11px] text-gray-300 ml-auto">
            {filtered.length} of {jobs.length}
          </span>
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
            {search || activeFilters.length > 0
              ? "No jobs match your filters"
              : "No jobs yet. Post your first job to get started."}
          </p>
          {search || activeFilters.length > 0 ? (
            <button
              onClick={() => {
                clearAllFilters();
                setSearch("");
              }}
              className="text-emerald-600 text-sm mt-2 hover:underline"
            >
              Clear all filters
            </button>
          ) : (
            <Link href="/client-portal/jobs/new" className="text-emerald-600 text-sm mt-2 hover:underline inline-block">
              Post a Job
            </Link>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="grid grid-cols-[1fr_100px_130px_80px_140px_90px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div>Title</div>
            <div>Type</div>
            <div>Location</div>
            <div>Status</div>
            <div>Firms</div>
            <div className="text-right">Posted</div>
          </div>

          {filtered.map((j: any, i: number) => {
            const accepted = j.engagements?.filter((e: any) => e.status === "ACCEPTED").length || 0;
            const pending = j.engagements?.filter((e: any) => e.status === "PENDING").length || 0;
            const total = j.engagements?.length || 0;

            return (
              <Link key={j.id} href={`/client-portal/jobs/${j.id}`} className="block">
                <div
                  className={`group grid grid-cols-[1fr_100px_130px_80px_140px_90px] gap-0 px-4 py-2.5 items-center hover:bg-emerald-50/50 transition-colors cursor-pointer ${
                    i < filtered.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{j.title}</p>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs text-gray-500">{j.jobType}</span>
                  </div>
                  <div className="min-w-0 flex items-center gap-1">
                    {j.location ? (
                      <p className="text-xs text-gray-500 truncate">{j.location}</p>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                    {j.isRemote && (
                      <Badge className="bg-emerald-100 text-emerald-800 text-[9px] px-1 py-0">
                        Remote
                      </Badge>
                    )}
                  </div>
                  <div>
                    <Badge
                      className={`${CLIENT_JOB_STATUS_COLORS[j.status] || "bg-gray-100 text-gray-800"} text-[10px] px-1.5 py-0`}
                    >
                      {CLIENT_JOB_STATUS_LABELS[j.status] || j.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {total === 0 ? (
                      <span className="text-xs text-gray-300">No firms</span>
                    ) : (
                      <>
                        {accepted > 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-green-600">
                            <CheckCircle className="h-3 w-3" />
                            {accepted}
                          </span>
                        )}
                        {pending > 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-amber-600">
                            <Clock className="h-3 w-3" />
                            {pending}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {total} firm{total !== 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-right flex items-center justify-end gap-1">
                    <span className="text-xs text-gray-400">{formatDate(j.createdAt)}</span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
