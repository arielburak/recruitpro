"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Inbox,
  Building2,
  MapPin,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Briefcase,
  Mail,
  Users,
  Share2,
  Trophy,
  ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

// Agency view of the engagements graph, the mirror of the client
// portal /engagements page. Same layout: aggregate strip, Pending
// section with Accept/Decline, Active engagements list (per-client
// cards with stats + click-through to /engagements/[clientId] for
// the per-job breakdown), Declined compact list. Same shape both
// sides so jumping between the agency and client perspective
// feels symmetric.

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

export default function EngagementsPage() {
  const router = useRouter();
  const [engagements, setEngagements] = useState<any[]>([]);
  const [clientGroups, setClientGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  useEffect(() => {
    // Two parallel fetches: the per-engagement list drives the
    // Pending and Declined sections (each invite is its own row with
    // Accept/Decline actions), and the per-Client rollup drives the
    // "Active engagements" cards so multiple Jobs at the same hiring
    // company collapse into one row with a drill-down detail page.
    Promise.all([
      fetch("/api/engagements").then((r) => r.json()),
      fetch("/api/engagements/by-client").then((r) => r.json()),
    ])
      .then(([list, grouped]) => {
        setEngagements(Array.isArray(list) ? list : []);
        setClientGroups(grouped?.clients || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function respond(id: string, action: "accept" | "decline") {
    setResponding(id);
    setSubscriptionError(null);
    try {
      const res = await fetch(`/api/engagements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (data.code === "SUBSCRIPTION_REQUIRED") {
        setSubscriptionError(data.error);
        setResponding(null);
        return;
      }

      if (action === "accept" && data.jobId) {
        router.push(`/jobs/${data.jobId}`);
        return;
      }

      // Refresh both lists so the just-actioned row moves into the
      // right bucket (declined → bottom; accepted → active card via
      // by-client rollup).
      const [updated, grouped] = await Promise.all([
        fetch("/api/engagements").then((r) => r.json()),
        fetch("/api/engagements/by-client").then((r) => r.json()),
      ]);
      setEngagements(Array.isArray(updated) ? updated : []);
      setClientGroups(grouped?.clients || []);
    } catch {}
    setResponding(null);
  }

  const pending = engagements.filter((e) => e.status === "PENDING");
  const declined = engagements.filter((e) => e.status === "DECLINED");

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const totals = clientGroups.reduce(
    (acc: any, c: any) => ({
      jobs: acc.jobs + c.jobsCount,
      submitted: acc.submitted + c.candidatesSubmitted,
      shared: acc.shared + c.candidatesShared,
      placements: acc.placements + c.placements,
    }),
    { jobs: 0, submitted: 0, shared: 0, placements: 0 }
  );

  const isEmpty = engagements.length === 0 && clientGroups.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <Inbox className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Engagements</h1>
          <p className="text-sm text-gray-500">
            {isEmpty
              ? "No engagement requests yet."
              : `${clientGroups.length} client${clientGroups.length === 1 ? "" : "s"} working across ${totals.jobs} job${totals.jobs === 1 ? "" : "s"}.`}
          </p>
        </div>
      </div>

      {subscriptionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-red-900 text-sm">{subscriptionError}</p>
              <p className="text-xs text-red-600 mt-0.5">You need an active subscription to accept engagement requests.</p>
            </div>
          </div>
          <button
            onClick={() => router.push("/admin/billing")}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition shrink-0"
          >
            Go to Billing
          </button>
        </div>
      )}

      {/* Aggregate strip */}
      {clientGroups.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Clients engaged
            </div>
            <div className="text-xl font-semibold text-gray-900">{clientGroups.length}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Candidates submitted
            </div>
            <div className="text-xl font-semibold text-gray-900">{totals.submitted}</div>
          </div>
          <div className="rounded-xl border bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
              Shared with client
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

      {/* Pending — incoming invites needing Accept / Decline */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Pending ({pending.length})
          </h2>
          {pending.map((eng) => (
            <Card key={eng.id} className="border-l-4 border-l-amber-400">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        New Request
                      </Badge>
                      <span className="text-xs text-gray-400">{formatDate(eng.invitedAt)}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">{eng.clientJob.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {eng.clientJob.client.name}
                      </span>
                      {eng.clientJob.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {eng.clientJob.location}
                        </span>
                      )}
                      {eng.clientJob.salaryRange && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {eng.clientJob.salaryRange}
                        </span>
                      )}
                      <span>{eng.clientJob.jobType}</span>
                    </div>
                    {eng.clientJob.description && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{eng.clientJob.description}</p>
                    )}
                    {eng.message && (
                      <div className="mt-2 bg-gray-50 rounded-lg p-2 text-sm text-gray-600 flex items-start gap-2">
                        <Mail className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                        {eng.message}
                      </div>
                    )}
                    {eng.clientJob.postedBy && (
                      <p className="text-xs text-gray-400 mt-2">
                        Contact: {eng.clientJob.postedBy.name} ({eng.clientJob.postedBy.email})
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                      disabled={responding === eng.id}
                      onClick={() => respond(eng.id, "accept")}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {responding === eng.id ? "..." : "Accept"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-gray-500"
                      disabled={responding === eng.id}
                      onClick={() => respond(eng.id, "decline")}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Decline
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Active engagements — per-Client cards with totals + drill-down
          to /engagements/[clientId] for the per-job breakdown. */}
      {clientGroups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Active engagements ({clientGroups.length} client{clientGroups.length === 1 ? "" : "s"})
          </h2>
          {clientGroups.map((c: any) => (
            <Link
              key={c.clientId}
              href={`/engagements/${c.clientId}`}
              className="block group"
            >
              <Card className="transition-colors group-hover:border-emerald-200 border-l-4 border-l-green-400">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold shrink-0">
                    {clientInitials(c.clientName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-emerald-700">
                        {c.clientName}
                      </h3>
                      {c.industry && (
                        <span className="text-xs font-normal text-gray-400">
                          {c.industry}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="h-3 w-3 text-gray-400" />
                        {c.jobsCount} job{c.jobsCount === 1 ? "" : "s"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3 text-gray-400" />
                        {c.candidatesSubmitted} submitted
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Share2 className="h-3 w-3 text-gray-400" />
                        {c.candidatesShared} shared
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Trophy className="h-3 w-3 text-gray-400" />
                        {c.placements} placement{c.placements === 1 ? "" : "s"}
                      </span>
                      {c.lastActivityAt && (
                        <span className="inline-flex items-center gap-1 ml-auto text-gray-400">
                          <Clock className="h-3 w-3" />
                          Last activity {relativeDate(c.lastActivityAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Declined */}
      {declined.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Declined
          </h2>
          {declined.map((eng) => (
            <Card key={eng.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium text-gray-900">{eng.clientJob.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {eng.clientJob.client.name}
                    <span>· {formatDate(eng.respondedAt || eng.invitedAt)}</span>
                  </div>
                </div>
                <Badge className="bg-gray-100 text-gray-500">
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
            <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No engagement requests yet</h3>
            <p className="text-gray-500 text-sm">
              When hiring companies invite your firm to work on their searches, they&apos;ll appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
