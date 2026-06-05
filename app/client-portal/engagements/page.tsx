"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Send,
  Handshake,
  Trophy,
  Clock,
  Briefcase,
  ChevronRight,
  XCircle,
  Mail,
} from "lucide-react";

// Client portal view of the engagements graph from the OTHER side:
// every recruiting firm this client has invited, with per-firm
// collaboration aggregates and a drill-down to the Jobs each firm
// is on. Mirrors what the agency-side /engagements page surfaces —
// same Pending / Active / Declined sections, same aggregate strip,
// same click-through to a per-firm detail page. The recruiter
// thinks "how is this firm doing?" first and "which Job?" second,
// same way the agency thinks about clients.

type JobRow = {
  clientJobId: string;
  jobId: string | null;
  title: string;
  submitted: number;
  offers: number;
  placements: number;
  lastActivityAt: string | null;
};

type Firm = {
  organizationId: string;
  name: string;
  jobsCount: number;
  pendingCount: number;
  submitted: number;
  offers: number;
  placements: number;
  lastActivityAt: string | null;
  jobs: JobRow[];
};

type InviteRow = {
  organizationId: string;
  organizationName: string;
  clientJobId: string;
  clientJobTitle: string;
  invitedAt: string;
  respondedAt: string | null;
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

function firmInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export default function ClientEngagementsPage() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [pending, setPending] = useState<InviteRow[]>([]);
  const [declined, setDeclined] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/client-portal/firms-engaged")
      .then((r) => r.json())
      .then((data) => {
        setFirms(data.firms || []);
        setPending(data.pending || []);
        setDeclined(data.declined || []);
      })
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
      submitted: acc.submitted + f.submitted,
      offers: acc.offers + f.offers,
      placements: acc.placements + f.placements,
    }),
    { jobs: 0, submitted: 0, offers: 0, placements: 0 }
  );

  const isEmpty = firms.length === 0 && pending.length === 0 && declined.length === 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recruiting Firms</h1>
          <p className="text-sm text-gray-500">
            {isEmpty
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
              Submitted
            </div>
            <div className="text-xl font-semibold text-gray-900">{totals.submitted}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Offers
            </div>
            <div className="text-xl font-semibold text-amber-600">{totals.offers}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Placements
            </div>
            <div className="text-xl font-semibold text-emerald-600">{totals.placements}</div>
          </div>
        </div>
      )}

      {/* Pending — firms invited that haven't accepted yet. Symmetrical
          to agency-side "Pending" (incoming invites). Here the wait is
          on the firm. No actions, just visibility. */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Pending ({pending.length})
          </h2>
          {pending.map((p) => (
            <Card key={`${p.organizationId}-${p.clientJobId}`} className="border-l-4 border-l-amber-400">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {firmInitials(p.organizationName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {p.organizationName}
                    </h3>
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">
                      <Mail className="h-3 w-3 mr-1" />
                      Awaiting response
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <Link
                      href={`/client-portal/jobs/${p.clientJobId}`}
                      className="inline-flex items-center gap-1 hover:text-emerald-600"
                    >
                      <Briefcase className="h-3 w-3 text-gray-400" />
                      {p.clientJobTitle}
                    </Link>
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <Clock className="h-3 w-3" />
                      Invited {relativeDate(p.invitedAt)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Active engagements list */}
      {firms.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Active firms ({firms.length})
          </h2>
          {firms.map((firm) => (
            <Link
              key={firm.organizationId}
              href={`/client-portal/engagements/${firm.organizationId}`}
              className="block group"
            >
              <Card className="transition-colors group-hover:border-emerald-200 border-l-4 border-l-green-400">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                    {firmInitials(firm.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-emerald-700">
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
                        <Send className="h-3 w-3 text-gray-400" />
                        {firm.submitted} submitted
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Handshake className="h-3 w-3 text-gray-400" />
                        {firm.offers} offer{firm.offers === 1 ? "" : "s"}
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
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Declined — firms that turned down the invite. Compact so it
          doesn't dilute the active signal but visible so the client
          knows who said no. */}
      {declined.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Declined
          </h2>
          {declined.map((d) => (
            <Card key={`${d.organizationId}-${d.clientJobId}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">
                    {d.organizationName}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    <Link
                      href={`/client-portal/jobs/${d.clientJobId}`}
                      className="hover:text-emerald-600 truncate"
                    >
                      {d.clientJobTitle}
                    </Link>
                    <span>· {relativeDate(d.respondedAt || d.invitedAt)}</span>
                  </div>
                </div>
                <Badge className="bg-gray-100 text-gray-500 shrink-0">
                  <XCircle className="h-3 w-3 mr-1" /> Declined
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600 font-medium mb-1">
              No recruiting firms yet
            </p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Invite a recruiting firm from any of your Jobs to start collaborating.
              They&apos;ll show up here once they accept.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
