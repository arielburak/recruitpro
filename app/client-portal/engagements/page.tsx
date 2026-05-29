"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  Share2,
  Trophy,
  Clock,
  Briefcase,
  ChevronRight,
} from "lucide-react";

// Client portal view of the engagements graph from the OTHER side:
// every recruiting firm this client has accepted, with per-firm
// collaboration aggregates and a drill-down to the Jobs each firm
// is on. Mirrors what the agency-side /engagements page surfaces
// per Job, but rolled up by Organization here because the client
// thinks "Acme Recruiting" first and "Sales VP search" second.

type JobRow = {
  clientJobId: string;
  jobId: string | null;
  title: string;
  submissions: number;
  shared: number;
  placements: number;
  lastActivityAt: string | null;
};

type Firm = {
  organizationId: string;
  name: string;
  jobsCount: number;
  pendingCount: number;
  candidatesShared: number;
  candidatesSubmitted: number;
  placements: number;
  lastActivityAt: string | null;
  jobs: JobRow[];
};

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ClientEngagementsPage() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/client-portal/firms-engaged")
      .then((r) => r.json())
      .then((data) => setFirms(data.firms || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const totals = firms.reduce(
    (acc, f) => ({
      jobs: acc.jobs + f.jobsCount,
      submitted: acc.submitted + f.candidatesSubmitted,
      shared: acc.shared + f.candidatesShared,
      placements: acc.placements + f.placements,
    }),
    { jobs: 0, submitted: 0, shared: 0, placements: 0 }
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engagements</h1>
          <p className="text-sm text-gray-500">
            {firms.length === 0
              ? "No recruiting firms engaged yet."
              : `${firms.length} firm${firms.length === 1 ? "" : "s"} working across ${totals.jobs} job${totals.jobs === 1 ? "" : "s"}.`}
          </p>
        </div>
      </div>

      {/* Aggregate strip */}
      {firms.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Firms engaged
            </div>
            <div className="text-xl font-semibold text-gray-900">{firms.length}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Candidates submitted
            </div>
            <div className="text-xl font-semibold text-gray-900">{totals.submitted}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Shared with team
            </div>
            <div className="text-xl font-semibold text-emerald-600">{totals.shared}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Placements
            </div>
            <div className="text-xl font-semibold text-emerald-600">{totals.placements}</div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {firms.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600 font-medium mb-1">
              No engagements yet
            </p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Invite a recruiting firm from any of your Jobs to start collaborating.
              They&apos;ll show up here once they accept.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {firms.map((firm) => {
            const isOpen = expanded === firm.organizationId;
            return (
              <Card key={firm.organizationId}>
                <CardContent className="p-4">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : firm.organizationId)}
                    className="w-full flex items-center gap-3 text-left"
                  >
                    {/* Firm avatar */}
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                      {firm.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase() || "")
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {firm.name}
                        </h3>
                        {firm.pendingCount > 0 && (
                          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                            {firm.pendingCount} pending
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="h-3 w-3 text-gray-400" />
                          {firm.jobsCount} job{firm.jobsCount === 1 ? "" : "s"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3 text-gray-400" />
                          {firm.candidatesSubmitted} submitted
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Share2 className="h-3 w-3 text-gray-400" />
                          {firm.candidatesShared} shared
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Trophy className="h-3 w-3 text-gray-400" />
                          {firm.placements} placement{firm.placements === 1 ? "" : "s"}
                        </span>
                        <span className="inline-flex items-center gap-1 ml-auto text-gray-400">
                          <Clock className="h-3 w-3" />
                          Last activity {relativeDate(firm.lastActivityAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {/* Per-job breakdown — only when expanded so the
                      default firm list stays scannable. */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      {firm.jobs.map((j) => (
                        <Link
                          key={j.clientJobId}
                          href={`/client-portal/jobs/${j.clientJobId}`}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 group"
                        >
                          <Briefcase className="h-4 w-4 text-gray-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate group-hover:text-emerald-600">
                              {j.title}
                            </p>
                            <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                              <span>{j.submissions} submitted</span>
                              <span>{j.shared} shared</span>
                              <span>
                                {j.placements} placement{j.placements === 1 ? "" : "s"}
                              </span>
                              {j.lastActivityAt && (
                                <span className="ml-auto text-gray-400">
                                  {relativeDate(j.lastActivityAt)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 shrink-0" />
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
