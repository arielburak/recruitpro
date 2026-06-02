"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";

// Focused view of a single hiring client's engagement with this
// agency. Mirror of /client-portal/engagements/[firmId] from the
// other side — reuses the same /engagements/by-client aggregate the
// list page consumes, then filters client-side. One source of truth
// keeps both pages in sync.

type JobRow = {
  jobId: string;
  clientJobId: string;
  title: string;
  submitted: number;
  offers: number;
  placements: number;
  lastActivityAt: string | null;
};

type ClientAgg = {
  clientId: string;
  clientName: string;
  industry: string | null;
  jobsCount: number;
  submitted: number;
  offers: number;
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

function clientInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

export default function AgencyClientEngagementPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as string;
  const [client, setClient] = useState<ClientAgg | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/engagements/by-client")
      .then((r) => r.json())
      .then((data) => {
        const found = (data.clients || []).find(
          (c: ClientAgg) => c.clientId === clientId
        );
        if (!found) setNotFound(true);
        else setClient(found);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-32 bg-gray-100 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-600 font-medium mb-1">
          You&apos;re not engaged with this client (yet).
        </p>
        <Link href="/engagements">
          <Button variant="outline" size="sm" className="mt-3 gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Engagements
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/engagements"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Engagements
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-semibold shrink-0">
          {clientInitials(client.clientName)}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">
            {client.clientName}
          </h1>
          <p className="text-sm text-gray-500">
            Working on {client.jobsCount} job{client.jobsCount === 1 ? "" : "s"} for this client
            {client.lastActivityAt && ` · Last activity ${relativeDate(client.lastActivityAt)}`}
          </p>
        </div>
        {client.industry && (
          <Badge className="ml-auto bg-gray-100 text-gray-600 border border-gray-200 text-[11px]">
            {client.industry}
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
            {client.jobsCount}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            Submitted
          </div>
          <div className="text-xl font-semibold text-gray-900">
            {client.submitted}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            Offers
          </div>
          <div className="text-xl font-semibold text-amber-600">
            {client.offers}
          </div>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            Placements
          </div>
          <div className="text-xl font-semibold text-emerald-600">
            {client.placements}
          </div>
        </div>
      </div>

      {/* Per-job breakdown */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 inline-flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-gray-400" />
              Jobs with {client.clientName}
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {client.jobs.map((j) => (
              <button
                key={j.jobId}
                type="button"
                onClick={() => router.push(`/jobs/${j.jobId}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 group text-left"
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
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
