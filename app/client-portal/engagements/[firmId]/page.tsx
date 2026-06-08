"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Building2,
  Send,
  Handshake,
  Trophy,
  Clock,
  Briefcase,
  ChevronRight,
  Users,
} from "lucide-react";

// Focused view of a single recruiting firm's engagement with this
// client. Reuses the same /firms-engaged aggregate the list page
// consumes, then filters client-side — keeps one source of truth
// and avoids a parallel endpoint that could drift.

type JobRow = {
  clientJobId: string;
  jobId: string | null;
  title: string;
  submitted: number;
  offers: number;
  placements: number;
  lastActivityAt: string | null;
};

type Contact = {
  key: string;
  userId: string | null;
  name: string | null;
  email: string;
  title: string | null;
  lastInvitedAt: string;
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
  contacts?: Contact[];
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

export default function ClientFirmEngagementPage() {
  const params = useParams();
  const firmId = params.firmId as string;
  const [firm, setFirm] = useState<Firm | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/client-portal/firms-engaged")
      .then((r) => r.json())
      .then((data) => {
        const found = (data.firms || []).find(
          (f: Firm) => f.organizationId === firmId
        );
        if (!found) setNotFound(true);
        else setFirm(found);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [firmId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="h-6 w-32 bg-gray-100 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (notFound || !firm) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-600 font-medium mb-1">
          This firm isn&apos;t engaged with you (yet).
        </p>
        <Link href="/client-portal/engagements">
          <Button variant="outline" size="sm" className="mt-3 gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Recruiting Firms
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/client-portal/engagements"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Recruiting Firms
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-semibold shrink-0">
          {firm.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() || "")
            .join("")}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">
            {firm.name}
          </h1>
          <p className="text-sm text-gray-500">
            Working on {firm.jobsCount} job{firm.jobsCount === 1 ? "" : "s"} for
            you · Last activity {relativeDate(firm.lastActivityAt)}
          </p>
        </div>
        {firm.pendingCount > 0 && (
          <Badge className="ml-auto bg-amber-50 text-amber-700 border border-amber-200 text-[11px]">
            {firm.pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            Jobs
          </div>
          <div className="text-xl font-semibold text-gray-900">
            {firm.jobsCount}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            Submitted
          </div>
          <div className="text-xl font-semibold text-gray-900">
            {firm.submitted}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            Offers
          </div>
          <div className="text-xl font-semibold text-amber-600">
            {firm.offers}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            Placements
          </div>
          <div className="text-xl font-semibold text-emerald-600">
            {firm.placements}
          </div>
        </div>
      </div>

      {/* Contacts at this firm — the recruiters the client has been
          collaborating with. Pulls from FirmEngagement.invitedUser
          (registered) and invitedEmail (pending sign-up) so a single
          recruiter invited across multiple jobs shows as ONE row. */}
      {firm.contacts && firm.contacts.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 inline-flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                Contacts at {firm.name}
                <span className="text-xs font-normal text-gray-400">
                  ({firm.contacts.length})
                </span>
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {firm.contacts.map((c) => {
                // Same shape every row: display name on top + email
                // below. When we don't have a registered User yet,
                // derive the display name from the email local-part
                // ("nicolas.cuello@…" → "Nicolas Cuello") so the row
                // still looks like a person, not a raw email address.
                const displayName =
                  c.name ||
                  c.email
                    .split("@")[0]
                    .split(/[._-]+/)
                    .filter(Boolean)
                    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
                    .join(" ") ||
                  "Recruiter";
                const initial = displayName
                  .trim()
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "?";
                return (
                  <div key={c.key} className="flex items-start gap-3 px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate" title={displayName}>
                        {displayName}
                        {!c.userId && (
                          <span className="ml-2 text-[10px] font-normal text-amber-600 align-middle">
                            pending sign-up
                          </span>
                        )}
                      </p>
                      <a
                        href={`mailto:${c.email}`}
                        className="text-xs text-gray-500 break-all hover:text-emerald-600"
                        title={c.email}
                      >
                        {c.email}
                      </a>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {c.title ? `${c.title} · ` : ""}
                        Invited {relativeDate(c.lastInvitedAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-job breakdown */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 inline-flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-gray-400" />
              Jobs with {firm.name}
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {firm.jobs.map((j) => (
              <Link
                key={j.clientJobId}
                href={`/client-portal/jobs/${j.clientJobId}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-emerald-600">
                    {j.title}
                  </p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Send className="h-3 w-3 text-gray-400" />
                      {j.submitted} submitted
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Handshake className="h-3 w-3 text-gray-400" />
                      {j.offers} offer{j.offers === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Trophy className="h-3 w-3 text-gray-400" />
                      {j.placements} placement{j.placements === 1 ? "" : "s"}
                    </span>
                    {j.lastActivityAt && (
                      <span className="inline-flex items-center gap-1 ml-auto text-gray-400">
                        <Clock className="h-3 w-3" />
                        {relativeDate(j.lastActivityAt)}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 shrink-0" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
