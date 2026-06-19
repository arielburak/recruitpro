"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Search, Briefcase, Filter } from "lucide-react";
import {
  CandidateTableRow,
  type CandidateRow,
} from "@/components/client-portal/candidate-row";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type Stage = { id: string; name: string; order: number; color: string; isTerminal: boolean; kind: string | null };
type Filters = {
  jobs: { id: string; title: string }[];
  firms: { id: string; name: string }[];
  stages: Stage[];
};

export default function ClientCandidatesPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-md animate-pulse" />
            ))}
          </div>
        </div>
      }
    >
      <ClientCandidatesPageInner />
    </Suspense>
  );
}

function ClientCandidatesPageInner() {
  const searchParams = useSearchParams();
  // The portal job-detail page links here with ?clientJobId=… so the user
  // sees just the candidates from that one search. Resolved server-side via
  // FirmEngagement → firm Job.id; the page itself just passes it through.
  const initialClientJobId = searchParams.get("clientJobId") || "";
  // The dashboard "Active Searches" cards (agency-side Jobs running under
  // this client) deep-link here with ?jobId=… to scope down to that one
  // search's candidates without round-tripping through ClientJob.
  const initialJobId = searchParams.get("jobId") || "";

  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [filters, setFilters] = useState<Filters>({ jobs: [], firms: [], stages: [] });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState<string>(initialJobId || "all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [firmFilter, setFirmFilter] = useState<string>("all");
  const [clientJobIdFilter, setClientJobIdFilter] = useState<string>(initialClientJobId);

  useEffect(() => {
    fetch("/api/client-portal/candidates/filters")
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) setFilters(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("flat", "true");
    if (search.trim().length >= 2) params.set("search", search.trim());
    if (jobFilter !== "all") params.set("jobId", jobFilter);
    if (stageFilter !== "all") params.set("clientStageId", stageFilter);
    if (firmFilter !== "all") params.set("firmId", firmFilter);
    if (clientJobIdFilter) params.set("clientJobId", clientJobIdFilter);

    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/client-portal/candidates?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setRows(data);
          else setRows([]);
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [search, jobFilter, stageFilter, firmFilter, clientJobIdFilter]);

  const jobOptions: SearchableSelectOption[] = useMemo(
    () => filters.jobs.map((j) => ({ value: j.id, label: j.title })),
    [filters.jobs]
  );

  const stageOptions: SearchableSelectOption[] = useMemo(
    () =>
      filters.stages.map((s) => ({
        value: s.id,
        label: s.name,
        color: s.color,
      })),
    [filters.stages]
  );

  const firmOptions: SearchableSelectOption[] = useMemo(
    () => filters.firms.map((f) => ({ value: f.id, label: f.name })),
    [filters.firms]
  );

  const activeFilterCount =
    (jobFilter !== "all" ? 1 : 0) +
    (stageFilter !== "all" ? 1 : 0) +
    (firmFilter !== "all" ? 1 : 0) +
    (clientJobIdFilter ? 1 : 0);

  // Group submissions by candidate. The same candidate shared into N
  // jobs used to render as N rows in the table (e.g. "Bob — Backend",
  // "Bob — SWE 2.0", "Bob — Associate"); the header count also
  // double-counted. We now keep the server-side flat list (the table
  // logic stays simple) but collapse it into one row per candidate at
  // render time. Additional submissions live behind an expand
  // toggle so the recruiter can drill in when needed without us
  // shouting "3 candidates" when it's really 1.
  type Grouped = { candidateId: string; rows: CandidateRow[] };
  const groupedRows = useMemo<Grouped[]>(() => {
    const map = new Map<string, Grouped>();
    for (const r of rows) {
      const id = r.candidate.id;
      const g = map.get(id);
      if (g) g.rows.push(r);
      else map.set(id, { candidateId: id, rows: [r] });
    }
    return Array.from(map.values());
  }, [rows]);

  function clearFilters() {
    setJobFilter("all");
    setStageFilter("all");
    setFirmFilter("all");
    setClientJobIdFilter("");
    setSearch("");
  }

  const refetch = () => {
    const params = new URLSearchParams();
    params.set("flat", "true");
    if (search.trim().length >= 2) params.set("search", search.trim());
    if (jobFilter !== "all") params.set("jobId", jobFilter);
    if (stageFilter !== "all") params.set("clientStageId", stageFilter);
    if (firmFilter !== "all") params.set("firmId", firmFilter);
    if (clientJobIdFilter) params.set("clientJobId", clientJobIdFilter);
    fetch(`/api/client-portal/candidates?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRows(data);
      })
      .catch(() => {});
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
            <p className="text-gray-500 text-sm">
              {loading
                ? "Loading..."
                : `${groupedRows.length} candidate${groupedRows.length === 1 ? "" : "s"} shared with you`}
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
            placeholder="Search name, title, company..."
            className="pl-9"
          />
        </div>

        <SearchableSelect
          value={jobFilter}
          onChange={setJobFilter}
          options={jobOptions}
          allLabel="All Jobs"
          searchPlaceholder="Search jobs..."
          placeholder="Jobs"
        />

        <SearchableSelect
          value={stageFilter}
          onChange={setStageFilter}
          options={stageOptions}
          allLabel="All Stages"
          searchPlaceholder="Search stages..."
          placeholder="Stages"
          minWidth={140}
        />

        {filters.firms.length > 1 && (
          <SearchableSelect
            value={firmFilter}
            onChange={setFirmFilter}
            options={firmOptions}
            allLabel="All Firms"
            searchPlaceholder="Search firms..."
            placeholder="Firms"
            minWidth={140}
          />
        )}

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 h-9 px-2"
          >
            <Filter className="h-3 w-3" /> Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Content */}
      {loading && rows.length === 0 ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-md animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            {filters.jobs.length === 0 ? (
              <>
                <p className="text-sm text-gray-500 mb-2">No candidates shared with you yet.</p>
                <p className="text-xs text-gray-400 mb-4">
                  Your recruiting firms will share candidates here as they find them. You&apos;ll be able to review, rate and give feedback.
                </p>
                <Link href="/client-portal/jobs" className="text-sm text-emerald-600 hover:underline inline-flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> View your jobs
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">No candidates match your filters.</p>
                <button onClick={clearFilters} className="text-xs text-emerald-600 hover:underline mt-2">
                  Clear filters
                </button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Firm</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Shared</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedRows.map((group) => {
                  // Single-submission candidate → un solo CandidateTableRow.
                  // Multi-submission → tantas CandidateTableRow como rows,
                  // todas usando las mismas TableCells de la tabla (Job,
                  // Stage, Firm, Location, Shared). La primera lleva el
                  // pill "in N searches"; las subsiguientes van con
                  // asSecondary=true para mostrar la L-line indent en la
                  // cell de candidato. Asi:
                  //   · cada sub-row usa el ancho que la tabla asigna a
                  //     cada columna (no hay grid hardcodeado);
                  //   · si manana sumamos una columna al header, los
                  //     sub-rows la heredan sin tocar nada;
                  //   · si un candidato pasa a tener 5 jobs en vez de 2,
                  //     el formato sigue prolijo.
                  if (group.rows.length === 1) {
                    return (
                      <CandidateTableRow
                        key={group.rows[0].submissionId}
                        row={group.rows[0]}
                        onRated={refetch}
                      />
                    );
                  }
                  return group.rows.map((r, idx) => (
                    <CandidateTableRow
                      key={r.submissionId}
                      row={r}
                      asSecondary={idx > 0}
                      totalSearches={idx === 0 ? group.rows.length : undefined}
                      onRated={refetch}
                    />
                  ));
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      {!loading && rows.length > 0 && (
        <div className="text-xs text-gray-400 flex flex-wrap items-center gap-4 px-1">
          <span className="flex items-center gap-1.5">
            <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">Stage</Badge>
            Current pipeline stage. Moves happen on your recruiting firm&apos;s side.
          </span>
        </div>
      )}
    </div>
  );
}
