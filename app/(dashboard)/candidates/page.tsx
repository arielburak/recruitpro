"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  X,
  Check,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";

// ─── Types ───

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  location: string | null;
  skills: string[];
  createdAt: string;
  owner: { id: string; name: string };
  _count: { submissions: number };
}

interface FilterOption {
  value: string;
  label: string;
  count: number;
}

interface FilterOptions {
  owners: FilterOption[];
  locations: FilterOption[];
  jobs: FilterOption[];
  clients: FilterOption[];
}

// ─── Notion-style Multi-Select Filter ───

function MultiFilter({
  label,
  selected,
  options,
  onChange,
}: {
  label: string;
  selected: string[];
  options: FilterOption[];
  onChange: (values: string[]) => void;
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
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""} ${
            hasSelection ? "text-indigo-400" : "text-gray-400"
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
                      isSelected ? "text-indigo-700" : "text-gray-700"
                    }`}
                    onClick={() => toggle(opt.value)}
                  >
                    <div
                      className={`flex items-center justify-center h-3.5 w-3.5 rounded border shrink-0 transition-colors ${
                        isSelected
                          ? "bg-indigo-600 border-indigo-600"
                          : "border-gray-300 bg-white"
                      }`}
                    >
                      {isSelected && (
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                      )}
                    </div>
                    <span className="flex-1 text-left truncate">{opt.label}</span>
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

// ─── Sort Selector ───

const SORT_OPTIONS = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A-Z" },
  { value: "name_desc", label: "Name Z-A" },
];

function SortSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const current = SORT_OPTIONS.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-all"
      >
        <ArrowUpDown className="h-3 w-3 text-gray-400" />
        <span>{current?.label || "Sort"}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-xl min-w-[160px] overflow-hidden py-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-gray-50 ${
                value === opt.value ? "text-indigo-700 font-medium" : "text-gray-700"
              }`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {value === opt.value && <Check className="h-3 w-3 text-indigo-600" />}
              {value !== opt.value && <div className="w-3" />}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Filter state
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState<string[]>([]);
  const [jobFilter, setJobFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [sort, setSort] = useState("created_desc");

  // Filter options from API
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    owners: [],
    locations: [],
    jobs: [],
    clients: [],
  });

  // Load filter options once
  useEffect(() => {
    fetch("/api/candidates/filters")
      .then((r) => r.json())
      .then((data) => setFilterOptions(data))
      .catch(() => {});
  }, []);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      search,
      mine: "false",
      sort,
    });
    if (ownerFilter.length > 0) params.set("ownerId", ownerFilter.join(","));
    if (locationFilter.length > 0) params.set("location", locationFilter.join(","));
    if (jobFilter.length > 0) params.set("jobId", jobFilter.join(","));
    if (clientFilter.length > 0) params.set("clientId", clientFilter.join(","));

    const res = await fetch(`/api/candidates?${params}`);
    const data = await res.json();
    setCandidates(data.candidates || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, search, sort, ownerFilter, locationFilter, jobFilter, clientFilter]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Reset to page 1 when filters change
  function updateFilter(setter: (v: string[]) => void, values: string[]) {
    setter(values);
    setPage(1);
  }

  const totalPages = Math.ceil(total / 20);

  // Active filter pills
  const activeFilters = [
    ...ownerFilter.map((v) => ({
      type: "Owner",
      value: v,
      label: filterOptions.owners.find((o) => o.value === v)?.label || v,
      clear: () => updateFilter(setOwnerFilter, ownerFilter.filter((x) => x !== v)),
    })),
    ...clientFilter.map((v) => ({
      type: "Client",
      value: v,
      label: filterOptions.clients.find((c) => c.value === v)?.label || v,
      clear: () => updateFilter(setClientFilter, clientFilter.filter((x) => x !== v)),
    })),
    ...jobFilter.map((v) => ({
      type: "Job",
      value: v,
      label: filterOptions.jobs.find((j) => j.value === v)?.label || v,
      clear: () => updateFilter(setJobFilter, jobFilter.filter((x) => x !== v)),
    })),
    ...locationFilter.map((v) => ({
      type: "Location",
      value: v,
      label: v,
      clear: () => updateFilter(setLocationFilter, locationFilter.filter((x) => x !== v)),
    })),
  ];

  function clearAllFilters() {
    setOwnerFilter([]);
    setLocationFilter([]);
    setJobFilter([]);
    setClientFilter([]);
    setPage(1);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Candidates</h1>
          <p className="text-sm text-gray-500">{total} total</p>
        </div>
        <Link href="/candidates/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Candidate
          </Button>
        </Link>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, title, company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10 h-[30px] text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <MultiFilter
            label="Owner"
            selected={ownerFilter}
            options={filterOptions.owners}
            onChange={(v) => updateFilter(setOwnerFilter, v)}
          />
          <MultiFilter
            label="Client"
            selected={clientFilter}
            options={filterOptions.clients}
            onChange={(v) => updateFilter(setClientFilter, v)}
          />
          <MultiFilter
            label="Job"
            selected={jobFilter}
            options={filterOptions.jobs}
            onChange={(v) => updateFilter(setJobFilter, v)}
          />
          <MultiFilter
            label="Location"
            selected={locationFilter}
            options={filterOptions.locations}
            onChange={(v) => updateFilter(setLocationFilter, v)}
          />
          <SortSelector value={sort} onChange={(v) => { setSort(v); setPage(1); }} />
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
            {total} matching
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-1">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <div className="text-center py-16">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {search || activeFilters.length > 0
              ? "No candidates match your filters"
              : "No candidates yet. Add your first candidate to get started."}
          </p>
          {(search || activeFilters.length > 0) && (
            <button
              onClick={() => {
                clearAllFilters();
                setSearch("");
              }}
              className="text-indigo-600 text-sm mt-2 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_140px_100px_80px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div>Name</div>
            <div>Title / Company</div>
            <div>Location</div>
            <div>Owner</div>
            <div className="text-right">Jobs</div>
          </div>

          {/* Rows */}
          {candidates.map((c, i) => (
            <Link key={c.id} href={`/candidates/${c.id}`}>
              <div
                className={`grid grid-cols-[1fr_1fr_140px_100px_80px] gap-0 px-4 py-2.5 items-center hover:bg-indigo-50/50 transition-colors cursor-pointer ${
                  i < candidates.length - 1 ? "border-b border-gray-100" : ""
                }`}
              >
                {/* Name + email */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                    {c.firstName[0]}
                    {c.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.firstName} {c.lastName}
                    </p>
                    {c.email && (
                      <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                    )}
                  </div>
                </div>

                {/* Title / Company */}
                <div className="min-w-0">
                  {c.currentTitle || c.currentCompany ? (
                    <p className="text-sm text-gray-600 truncate">
                      {c.currentTitle}
                      {c.currentTitle && c.currentCompany && (
                        <span className="text-gray-400"> at </span>
                      )}
                      {c.currentCompany && (
                        <span className="text-gray-500">{c.currentCompany}</span>
                      )}
                    </p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                {/* Location */}
                <div className="min-w-0">
                  {c.location ? (
                    <p className="text-xs text-gray-500 truncate">{c.location}</p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                {/* Owner */}
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">{c.owner.name}</p>
                </div>

                {/* Submissions count */}
                <div className="text-right">
                  {c._count.submissions > 0 ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {c._count.submissions}
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400">
            Showing {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-gray-500 px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
