"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Users, Search, Briefcase, Filter, Building2 } from "lucide-react";
import {
  CandidateTableRow,
  type CandidateRow,
} from "@/components/client-portal/candidate-row";

type Filters = {
  jobs: { id: string; title: string }[];
  firms: { id: string; name: string }[];
  stagesByJob: Record<string, { id: string; name: string; order: number; color: string }[]>;
};

export default function ClientCandidatesPage() {
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [filters, setFilters] = useState<Filters>({ jobs: [], firms: [], stagesByJob: {} });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [firmFilter, setFirmFilter] = useState<string>("all");

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
    if (stageFilter !== "all") params.set("stageId", stageFilter);
    if (firmFilter !== "all") params.set("firmId", firmFilter);

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
  }, [search, jobFilter, stageFilter, firmFilter]);

  // Stages available given selected job
  const availableStages = useMemo(() => {
    if (jobFilter === "all") {
      // Aggregate all stages, dedupe by name
      const seen = new Map<string, { id: string; name: string; order: number; color: string }>();
      Object.values(filters.stagesByJob).forEach((arr) => {
        arr.forEach((s) => {
          // Use name as de-dupe key across jobs
          if (!seen.has(s.name)) seen.set(s.name, s);
        });
      });
      return Array.from(seen.values()).sort((a, b) => a.order - b.order);
    }
    return filters.stagesByJob[jobFilter] || [];
  }, [filters.stagesByJob, jobFilter]);

  // Reset stage filter if current selection is not available for the new job
  useEffect(() => {
    if (stageFilter === "all") return;
    if (!availableStages.some((s) => s.id === stageFilter)) {
      setStageFilter("all");
    }
  }, [availableStages, stageFilter]);

  const activeFilterCount =
    (jobFilter !== "all" ? 1 : 0) +
    (stageFilter !== "all" ? 1 : 0) +
    (firmFilter !== "all" ? 1 : 0);

  function clearFilters() {
    setJobFilter("all");
    setStageFilter("all");
    setFirmFilter("all");
    setSearch("");
  }

  const refetch = () => {
    // Re-run effect by touching a filter value (no-op but triggers). Simpler: re-fetch inline.
    const params = new URLSearchParams();
    params.set("flat", "true");
    if (search.trim().length >= 2) params.set("search", search.trim());
    if (jobFilter !== "all") params.set("jobId", jobFilter);
    if (stageFilter !== "all") params.set("stageId", stageFilter);
    if (firmFilter !== "all") params.set("firmId", firmFilter);
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
              {loading ? "Loading..." : `${rows.length} candidate${rows.length === 1 ? "" : "s"} shared with you`}
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

        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[160px]"
        >
          <option value="all">All Jobs</option>
          {filters.jobs.map((j) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[140px]"
        >
          <option value="all">All Stages</option>
          {availableStages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {filters.firms.length > 1 && (
          <select
            value={firmFilter}
            onChange={(e) => setFirmFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[140px]"
          >
            <option value="all">All Firms</option>
            {filters.firms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
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
                  <TableHead>Rating</TableHead>
                  <TableHead>Shared</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <CandidateTableRow
                    key={row.submissionId}
                    row={row}
                    onRated={refetch}
                  />
                ))}
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
            Your recruiter&apos;s pipeline stage for this candidate
          </span>
          <span>Click a candidate to view full profile, rate, and leave feedback.</span>
        </div>
      )}
    </div>
  );
}
