"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ExportCsvButton } from "@/components/export-csv-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Briefcase, Trash2, X, Check, ChevronDown } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS, JOB_STATUS_SELECTABLE, WORK_ARRANGEMENT_LABELS, WORK_ARRANGEMENT_COLORS } from "@/lib/constants";
import { DateRangeFilter, type DateRange, dateInRange } from "@/components/ui/date-range-filter";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

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

// ─── Saved Views (sticky filters + named presets) ───
//
// Both bits of state live in localStorage so they survive reloads
// without a backend round-trip. Per-browser only — moving to a new
// machine starts fresh. That's a conscious trade-off for the MVP;
// the alternative is a JobSavedView model in Prisma + endpoints,
// which we'll add when the team actually starts sharing presets.

const STORAGE_KEYS = {
  // Latest filter combo the user had on /jobs. Restored on mount.
  lastFilters: "recruitpro:jobs:lastFilters",
  // Array of SavedView. Shown in the Views dropdown.
  savedViews: "recruitpro:jobs:savedViews",
} as const;

type FilterSnapshot = {
  statusFilter: string[];
  workArrangementFilter: string[];
  locationFilter: string[];
  clientFilter: string[];
  recruiterFilter: string[];
  dateRange: DateRange;
};

type SavedView = {
  id: string;
  name: string;
  filters: FilterSnapshot;
};

type FilterSetters = {
  setStatusFilter: (v: string[]) => void;
  setWorkArrangementFilter: (v: string[]) => void;
  setLocationFilter: (v: string[]) => void;
  setClientFilter: (v: string[]) => void;
  setRecruiterFilter: (v: string[]) => void;
  setDateRange: (v: DateRange) => void;
};

function applySnapshot(snap: Partial<FilterSnapshot>, setters: FilterSetters) {
  setters.setStatusFilter(Array.isArray(snap.statusFilter) ? snap.statusFilter : []);
  setters.setWorkArrangementFilter(
    Array.isArray(snap.workArrangementFilter) ? snap.workArrangementFilter : [],
  );
  setters.setLocationFilter(Array.isArray(snap.locationFilter) ? snap.locationFilter : []);
  setters.setClientFilter(Array.isArray(snap.clientFilter) ? snap.clientFilter : []);
  setters.setRecruiterFilter(Array.isArray(snap.recruiterFilter) ? snap.recruiterFilter : []);
  setters.setDateRange(
    snap.dateRange && typeof snap.dateRange === "object"
      ? { from: snap.dateRange.from ?? null, to: snap.dateRange.to ?? null }
      : { from: null, to: null },
  );
}

function ViewSwitcher({
  views,
  onApply,
  onSave,
  onDelete,
  hasActiveFilters,
}: {
  views: SavedView[];
  onApply: (view: SavedView | null) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  hasActiveFilters: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:border-gray-300"
      >
        <span>Views</span>
        <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 right-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => {
              onApply(null);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
          >
            All jobs
            <span className="block text-[10px] text-gray-400">No filters applied</span>
          </button>
          {views.length > 0 && (
            <div className="border-t border-gray-100">
              {views.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onApply(v);
                      setOpen(false);
                    }}
                    className="flex-1 text-left text-sm text-gray-700 min-w-0 truncate"
                  >
                    {v.name}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete view "${v.name}"?`)) onDelete(v.id);
                    }}
                    className="ml-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                    title="Delete view"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSave();
              }}
              disabled={!hasActiveFilters}
              className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 disabled:text-gray-300 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Plus className="h-3 w-3" /> Save current as view…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function JobsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Bulk selection (checkbox column + action bar). Same pattern as
  // /candidates: per-id Set, clear on every fresh fetch so a delete
  // doesn't leave dangling ids.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [deletingJob, setDeletingJob] = useState<{ id: string; title: string } | null>(null);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible(checked: boolean, visibleIds: string[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }
  async function bulkDelete() {
    if (selectedIds.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/jobs/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        const dead = new Set(selectedIds);
        setJobs((arr) => arr.filter((j) => !dead.has(j.id)));
        setSelectedIds(new Set());
      }
    } catch {}
    setBulkDeleting(false);
  }

  // Multi-select filters. Default is "no filter" (all jobs) — the
  // user picks what they want and we remember it via localStorage
  // (see Views switcher below). Earlier defaults baked in
  // ["OPEN", "ACTIVE"] which surprised users who wanted the full
  // history.
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [workArrangementFilter, setWorkArrangementFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [recruiterFilter, setRecruiterFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });

  // Sticky filters — the page restores the last filter combo on
  // every reload. Storage shape lives under STORAGE_KEYS.lastFilters.
  // Hydration happens once on mount; subsequent state changes get
  // written back in the persistence effect below. The mountedRef
  // gate avoids writing the empty defaults over a stored snapshot
  // before hydration has happened.
  const mountedRef = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.lastFilters);
      if (raw) {
        const snap = JSON.parse(raw) as Partial<FilterSnapshot>;
        applySnapshot(snap, {
          setStatusFilter,
          setWorkArrangementFilter,
          setLocationFilter,
          setClientFilter,
          setRecruiterFilter,
          setDateRange,
        });
      }
    } catch {
      // Stored snapshot was malformed — fall back to the empty
      // defaults (= "All jobs"). Clear the bad blob so we don't
      // keep trying to parse it.
      try {
        localStorage.removeItem(STORAGE_KEYS.lastFilters);
      } catch {}
    }
    mountedRef.current = true;
  }, []);
  useEffect(() => {
    if (!mountedRef.current) return;
    const snap: FilterSnapshot = {
      statusFilter,
      workArrangementFilter,
      locationFilter,
      clientFilter,
      recruiterFilter,
      dateRange,
    };
    try {
      localStorage.setItem(STORAGE_KEYS.lastFilters, JSON.stringify(snap));
    } catch {}
  }, [statusFilter, workArrangementFilter, locationFilter, clientFilter, recruiterFilter, dateRange]);

  // Named saved views — same localStorage backing, separate key.
  // Each view is a snapshot of the filter state with a label. The
  // built-in "All jobs" preset is synthetic and not stored.
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.savedViews);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSavedViews(arr);
      }
    } catch {}
  }, []);
  function persistViews(next: SavedView[]) {
    setSavedViews(next);
    try {
      localStorage.setItem(STORAGE_KEYS.savedViews, JSON.stringify(next));
    } catch {}
  }
  function saveCurrentAsView() {
    const name = window.prompt("View name?");
    if (!name || !name.trim()) return;
    const view: SavedView = {
      id: `v_${Date.now()}`,
      name: name.trim(),
      filters: {
        statusFilter,
        workArrangementFilter,
        locationFilter,
        clientFilter,
        recruiterFilter,
        dateRange,
      },
    };
    persistViews([...savedViews, view]);
  }
  function applyView(view: SavedView | null) {
    // Null = "All jobs" → wipe everything.
    if (!view) {
      setStatusFilter([]);
      setWorkArrangementFilter([]);
      setLocationFilter([]);
      setClientFilter([]);
      setRecruiterFilter([]);
      setDateRange({ from: null, to: null });
      return;
    }
    applySnapshot(view.filters, {
      setStatusFilter,
      setWorkArrangementFilter,
      setLocationFilter,
      setClientFilter,
      setRecruiterFilter,
      setDateRange,
    });
  }
  function deleteView(id: string) {
    persistViews(savedViews.filter((v) => v.id !== id));
  }

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => {
        setJobs(data);
        setSelectedIds(new Set());
        setLoading(false);
      });
  }, []);

  async function deleteJob(id: string) {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setJobs(jobs.filter((j) => j.id !== id));
  }

  // Inline status change from the list. Optimistic update, rollback on
  // failure — the row is just a status badge so the recruiter doesn't
  // need to drop into the job detail just to flip Open → On Hold.
  async function changeStatus(id: string, status: string) {
    const previous = jobs;
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status } : j)));
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setJobs(previous);
      alert("Couldn't update status. Try again.");
    }
  }

  // Extract unique filter options with counts
  const filterOptions = useMemo(() => {
    const statuses = new Map<string, number>();
    const workArrangements = new Map<string, number>();
    const locations = new Map<string, number>();
    const clients = new Map<string, { name: string; count: number }>();
    const recruiters = new Map<string, { name: string; count: number }>();

    for (const j of jobs) {
      statuses.set(j.status, (statuses.get(j.status) || 0) + 1);

      const wm = j.workMode || "ON_SITE";
      workArrangements.set(wm, (workArrangements.get(wm) || 0) + 1);

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
      workArrangements: Array.from(workArrangements.entries())
        .map(([value, count]) => ({ value, label: WORK_ARRANGEMENT_LABELS[value] || value, count }))
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
      if (workArrangementFilter.length > 0 && !workArrangementFilter.includes(j.workMode || "ON_SITE")) return false;
      if (locationFilter.length > 0 && !locationFilter.includes(j.location?.trim())) return false;
      if (clientFilter.length > 0 && !clientFilter.includes(j.client.id)) return false;
      if (recruiterFilter.length > 0 && !(j.assignments || []).some((a: any) => recruiterFilter.includes(a.user.id))) return false;
      if (!dateInRange(j.createdAt, dateRange)) return false;
      return true;
    });
  }, [jobs, search, statusFilter, workArrangementFilter, locationFilter, clientFilter, recruiterFilter, dateRange]);

  const activeFilters = [
    ...statusFilter.map((v) => ({ type: "Status", value: v, label: JOB_STATUS_LABELS[v] || v, clear: () => setStatusFilter(statusFilter.filter((x) => x !== v)) })),
    ...workArrangementFilter.map((v) => ({ type: "Arrangement", value: v, label: WORK_ARRANGEMENT_LABELS[v] || v, clear: () => setWorkArrangementFilter(workArrangementFilter.filter((x) => x !== v)) })),
    ...clientFilter.map((v) => ({ type: "Client", value: v, label: filterOptions.clients.find((c) => c.value === v)?.label || v, clear: () => setClientFilter(clientFilter.filter((x) => x !== v)) })),
    ...locationFilter.map((v) => ({ type: "Location", value: v, label: v, clear: () => setLocationFilter(locationFilter.filter((x) => x !== v)) })),
    ...recruiterFilter.map((v) => ({ type: "Recruiter", value: v, label: filterOptions.recruiters.find((r) => r.value === v)?.label || v, clear: () => setRecruiterFilter(recruiterFilter.filter((x) => x !== v)) })),
  ];

  function clearAllFilters() {
    setStatusFilter([]);
    setWorkArrangementFilter([]);
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
        <div className="flex items-center gap-2">
          <ExportCsvButton type="jobs" disabled={jobs.length === 0} />
          <Link href="/jobs/new">
            <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create Job</Button>
          </Link>
        </div>
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
            label="Work Arrangement"
            selected={workArrangementFilter}
            options={filterOptions.workArrangements}
            onChange={setWorkArrangementFilter}
            colorMap={WORK_ARRANGEMENT_COLORS}
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
          <DateRangeFilter value={dateRange} onChange={setDateRange} label="Created" />
          <ViewSwitcher
            views={savedViews}
            onApply={applyView}
            onSave={saveCurrentAsView}
            onDelete={deleteView}
            hasActiveFilters={
              statusFilter.length +
                workArrangementFilter.length +
                locationFilter.length +
                clientFilter.length +
                recruiterFilter.length >
                0 ||
              !!dateRange.from ||
              !!dateRange.to
            }
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

      {/* Bulk action bar — same pattern as /candidates. Above the
          table so the user can see it without scrolling once a row
          is checked. */}
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
            <ExportCsvButton type="jobs" ids={Array.from(selectedIds)} variant="subtle" />
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowBulkDelete(true)}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {bulkDeleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
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
          <div className="grid grid-cols-[36px_1fr_1fr_90px_80px_130px_100px_70px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider items-center">
            <div>
              <input
                type="checkbox"
                aria-label="Select all visible jobs"
                checked={filtered.length > 0 && filtered.every((j: any) => selectedIds.has(j.id))}
                onChange={(e) => selectAllVisible(e.target.checked, filtered.map((j: any) => j.id))}
                className="rounded border-gray-300"
              />
            </div>
            <div>Title</div>
            <div>Client</div>
            <div>Status</div>
            <div>Mode</div>
            <div>Location</div>
            <div>Assigned</div>
            <div className="text-right">Cands</div>
          </div>

          {filtered.map((j: any, i: number) => (
            <div
              key={j.id}
              className={`group grid grid-cols-[36px_1fr_1fr_90px_80px_130px_100px_70px] gap-0 px-4 py-2.5 items-center hover:bg-indigo-50/50 transition-colors ${
                i < filtered.length - 1 ? "border-b border-gray-100" : ""
              } ${selectedIds.has(j.id) ? "bg-indigo-50/30" : ""}`}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${j.title}`}
                  checked={selectedIds.has(j.id)}
                  onChange={() => toggleSelected(j.id)}
                  className="rounded border-gray-300"
                />
              </div>
              <Link href={`/jobs/${j.id}`} className="contents">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{j.title}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-gray-500 truncate">{j.client.name}</p>
                </div>
                <div>
                  {/* Inline status — coloured to match the badge so the
                      list still scans like before, but you can change
                      it without leaving the page. preventDefault +
                      stopPropagation so the row Link doesn't fire when
                      the recruiter clicks the dropdown.

                      QA P2 (2026-06-16): el endpoint /api/jobs/[id] PUT
                      esta gateado a ADMIN. Para USER mostrabamos el
                      select pero al cambiarlo daba 403 con alert UX
                      dead-end. Para no-admin renderizamos badge readonly
                      con el mismo color para que la lista siga
                      escaneando igual. */}
                  {isAdmin ? (
                    <select
                      value={j.status}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                      onChange={(e) => { e.stopPropagation(); changeStatus(j.id, e.target.value); }}
                      className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer ${JOB_STATUS_COLORS[j.status]}`}
                      aria-label={`Status for ${j.title}`}
                    >
                      {JOB_STATUS_SELECTABLE.map((value) => (
                        <option key={value} value={value} className="bg-white text-gray-900">
                          {JOB_STATUS_LABELS[value]}
                        </option>
                      ))}
                      {/* Render the legacy CLOSED option only when this
                          specific row still has it — otherwise it stays
                          out of the picker. Once you flip it, it's gone. */}
                      {j.status === "CLOSED" && (
                        <option value="CLOSED" className="bg-white text-gray-900">
                          {JOB_STATUS_LABELS.CLOSED}
                        </option>
                      )}
                    </select>
                  ) : (
                    <span
                      className={`inline-block text-[10px] font-semibold rounded px-1.5 py-0.5 ${JOB_STATUS_COLORS[j.status]}`}
                    >
                      {JOB_STATUS_LABELS[j.status] || j.status}
                    </span>
                  )}
                </div>
                <div>
                  <Badge className={`${WORK_ARRANGEMENT_COLORS[j.workMode] || "bg-gray-100 text-gray-800"} text-[10px] px-1.5 py-0`}>
                    {WORK_ARRANGEMENT_LABELS[j.workMode] || "On-site"}
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
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletingJob({ id: j.id, title: j.title });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-0.5 rounded ml-1"
                      title="Delete job"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      <DeleteConfirmDialog
        open={showBulkDelete}
        onOpenChange={setShowBulkDelete}
        itemLabel={`${selectedIds.size} job${selectedIds.size === 1 ? "" : "s"}`}
        itemKind={selectedIds.size === 1 ? "job" : undefined}
        consequences={[
          "The full candidate pipeline",
          "Submissions, interviews and history",
          "Linked documents",
        ]}
        onConfirm={bulkDelete}
        confirmLabel="Yes, delete"
      />

      <DeleteConfirmDialog
        open={!!deletingJob}
        onOpenChange={(open) => { if (!open) setDeletingJob(null); }}
        itemLabel={deletingJob?.title || ""}
        itemKind="job"
        consequences={[
          "The full candidate pipeline",
          "Submissions, interviews and history",
          "Linked documents",
        ]}
        onConfirm={async () => {
          if (deletingJob) await deleteJob(deletingJob.id);
          setDeletingJob(null);
        }}
        confirmLabel="Yes, delete"
      />
    </div>
  );
}
