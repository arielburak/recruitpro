"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Briefcase, Trash2, X, Check, ChevronDown } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS, WORK_MODE_LABELS, WORK_MODE_COLORS } from "@/lib/constants";

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

  // Close on outside click
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

  // Focus search input when opening
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
            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
        }`}
      >
        <span>{label}</span>
        {hasSelection && (
          <span className="bg-indigo-200 text-indigo-800 rounded px-1 text-[10px] font-bold min-w-[16px] text-center">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""} ${hasSelection ? "text-indigo-400" : "text-gray-400"}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[220px] overflow-hidden">
          {/* Search input */}
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

          {/* Options list */}
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
                      isSelected ? "text-indigo-700" : "text-gray-700"
                    }`}
                    onClick={() => toggle(opt.value)}
                  >
                    {/* Checkbox */}
                    <div className={`flex items-center justify-center h-3.5 w-3.5 rounded border shrink-0 transition-colors ${
                      isSelected
                        ? "bg-indigo-600 border-indigo-600"
                        : "border-gray-300 bg-white"
                    }`}>
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </div>

                    {/* Label */}
                    <span className="flex-1 text-left truncate">
                      {colorMap && colorMap[opt.value] ? (
                        <Badge className={`${colorMap[opt.value]} text-[10px] px-1.5 py-0`}>
                          {opt.label}
                        </Badge>
                      ) : (
                        opt.label
                      )}
                    </span>

                    {/* Count */}
                    <span className="text-[10px] text-gray-400 shrink-0">{opt.count}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer actions */}
          {hasSelection && (
            <div className="border-t border-gray-100 px-2.5 py-1.5">
              <button
                type="button"
                onClick={() => { onChange([]); setQuery(""); }}
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

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Multi-select filters
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [workModeFilter, setWorkModeFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [recruiterFilter, setRecruiterFilter] = useState<string[]>([]);

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
    const workModes = new Map<string, number>();
    const locations = new Map<string, number>();
    const clients = new Map<string, { name: string; count: number }>();
    const recruiters = new Map<string, { name: string; count: number }>();

    for (const j of jobs) {
      statuses.set(j.status, (statuses.get(j.status) || 0) + 1);

      const wm = j.workMode || "ON_SITE";
      workModes.set(wm, (workModes.get(wm) || 0) + 1);

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
      workModes: Array.from(workModes.entries())
        .map(([value, count]) => ({ value, label: WORK_MODE_LABELS[value] || value, count }))
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

  // Apply all filters (multi-select: job passes if it matches ANY selected value)
  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !j.title.toLowerCase().includes(q) &&
          !j.client.name.toLowerCase().includes(q)
        )
          return false;
      }
      if (statusFilter.length > 0 && !statusFilter.includes(j.status)) return false;
      if (workModeFilter.length > 0 && !workModeFilter.includes(j.workMode || "ON_SITE")) return false;
      if (locationFilter.length > 0 && !locationFilter.includes(j.location?.trim())) return false;
      if (clientFilter.length > 0 && !clientFilter.includes(j.client.id)) return false;
      if (recruiterFilter.length > 0 && !(j.assignments || []).some((a: any) => recruiterFilter.includes(a.user.id))) return false;
      return true;
    });
  }, [jobs, search, statusFilter, workModeFilter, locationFilter, clientFilter, recruiterFilter]);

  const activeFilters = [
    ...statusFilter.map((v) => ({ type: "Status", value: v, label: JOB_STATUS_LABELS[v] || v, clear: () => setStatusFilter(statusFilter.filter((x) => x !== v)) })),
    ...workModeFilter.map((v) => ({ type: "Work Mode", value: v, label: WORK_MODE_LABELS[v] || v, clear: () => setWorkModeFilter(workModeFilter.filter((x) => x !== v)) })),
    ...clientFilter.map((v) => ({ type: "Client", value: v, label: filterOptions.clients.find((c) => c.value === v)?.label || v, clear: () => setClientFilter(clientFilter.filter((x) => x !== v)) })),
    ...locationFilter.map((v) => ({ type: "Location", value: v, label: v, clear: () => setLocationFilter(locationFilter.filter((x) => x !== v)) })),
    ...recruiterFilter.map((v) => ({ type: "Recruiter", value: v, label: filterOptions.recruiters.find((r) => r.value === v)?.label || v, clear: () => setRecruiterFilter(recruiterFilter.filter((x) => x !== v)) })),
  ];

  function clearAllFilters() {
    setStatusFilter([]);
    setWorkModeFilter([]);
    setLocationFilter([]);
    setClientFilter([]);
    setRecruiterFilter([]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs / Searches</h1>
          <p className="text-sm text-gray-500">{jobs.length} total</p>
        </div>
        <Link href="/jobs/new">
          <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create Job</Button>
        </Link>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by title or client..."
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
            colorMap={JOB_STATUS_COLORS}
          />
          <MultiFilter
            label="Work Mode"
            selected={workModeFilter}
            options={filterOptions.workModes}
            onChange={setWorkModeFilter}
            colorMap={WORK_MODE_COLORS}
          />
          <MultiFilter
            label="Client"
            selected={clientFilter}
            options={filterOptions.clients}
            onChange={setClientFilter}
          />
          <MultiFilter
            label="Location"
            selected={locationFilter}
            options={filterOptions.locations}
            onChange={setLocationFilter}
          />
          <MultiFilter
            label="Recruiter"
            selected={recruiterFilter}
            options={filterOptions.recruiters}
            onChange={setRecruiterFilter}
          />
        </div>
      </div>

      {/* Active filter pills */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeFilters.map((f) => (
            <span
              key={`${f.type}-${f.value}`}
              className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 pl-2 pr-1 py-0.5 rounded-md text-[11px] font-medium"
            >
              <span className="text-indigo-400">{f.type}:</span> {f.label}
              <button onClick={f.clear} className="hover:bg-indigo-200 rounded p-0.5 ml-0.5">
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
              : "No jobs yet. Create your first job order."}
          </p>
          {(search || activeFilters.length > 0) && (
            <button onClick={() => { clearAllFilters(); setSearch(""); }} className="text-indigo-600 text-sm mt-2 hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="grid grid-cols-[1fr_1fr_90px_80px_130px_100px_70px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div>Title</div>
            <div>Client</div>
            <div>Status</div>
            <div>Mode</div>
            <div>Location</div>
            <div>Assigned</div>
            <div className="text-right">Cands</div>
          </div>

          {filtered.map((j: any, i: number) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="block">
              <div className={`group grid grid-cols-[1fr_1fr_90px_80px_130px_100px_70px] gap-0 px-4 py-2.5 items-center hover:bg-indigo-50/50 transition-colors cursor-pointer ${
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
                <div>
                  <Badge className={`${WORK_MODE_COLORS[j.workMode] || "bg-gray-100 text-gray-800"} text-[10px] px-1.5 py-0`}>
                    {WORK_MODE_LABELS[j.workMode] || "On-site"}
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
