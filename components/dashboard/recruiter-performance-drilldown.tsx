"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  Send,
  Video,
  Handshake,
  Trophy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// Drill-down drawer for the Recruiter Performance widget. The
// aggregate table only surfaces COUNTS (Nicolás · 3 placements);
// this drawer answers "which 3?" — list of the underlying rows with
// links into the candidate / job / interview detail pages so the
// operator can keep clicking through without re-running filters.
//
// The drawer slides in from the right and reuses the same fetch
// shape as the aggregate, plus a `metric` discriminator. Heavy
// lifting lives server-side at /api/dashboard/recruiter-performance
// /details — this component is presentation only.

export type DrilldownMetric = "submissions" | "interviews" | "offers" | "placements";

type Recruiter = { id: string; name: string; email: string };

type SubmissionItem = {
  id: string;
  createdAt: string;
  isSharedWithClient: boolean;
  candidate: { id: string; firstName: string; lastName: string };
  job: { id: string; title: string; client: { name: string } | null };
  stage: { name: string } | null;
};
type InterviewItem = {
  id: string;
  title: string;
  startTime: string;
  status: string;
  type: string;
  candidate: { id: string; firstName: string; lastName: string };
  job: { id: string; title: string; client: { name: string } | null };
};
type OfferItem = {
  id: string;
  updatedAt: string;
  candidate: { id: string; firstName: string; lastName: string };
  job: { id: string; title: string; client: { name: string } | null };
};
type PlacementItem = {
  id: string;
  kind: string;
  startDate: string | null;
  updatedAt: string;
  feeAmount: string | null;
  monthlyFee: string | null;
  currency: string | null;
  submission: { candidate: { id: string; firstName: string; lastName: string } | null } | null;
  job: { id: string; title: string };
  client: { id: string; name: string };
};

type ApiPayload =
  | { metric: "submissions"; recruiter: Recruiter; items: SubmissionItem[] }
  | { metric: "interviews"; recruiter: Recruiter; items: InterviewItem[] }
  | { metric: "offers"; recruiter: Recruiter; items: OfferItem[] }
  | { metric: "placements"; recruiter: Recruiter; items: PlacementItem[] };

const METRIC_META: Record<
  DrilldownMetric,
  { label: string; icon: any; accent: string }
> = {
  submissions: { label: "Submissions", icon: Send, accent: "text-indigo-600 bg-indigo-50" },
  interviews: { label: "Interviews", icon: Video, accent: "text-blue-600 bg-blue-50" },
  offers: { label: "Offers", icon: Handshake, accent: "text-amber-600 bg-amber-50" },
  placements: { label: "Placements", icon: Trophy, accent: "text-emerald-600 bg-emerald-50" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtRangeShort(from: Date, to: Date) {
  const sameYear = from.getFullYear() === to.getFullYear();
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  };
  return `${from.toLocaleDateString("en-US", opts)} – ${to.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

export function RecruiterPerformanceDrilldown({
  metric,
  recruiterId,
  from,
  to,
  onClose,
}: {
  metric: DrilldownMetric;
  recruiterId: string;
  from: Date;
  to: Date;
  onClose: () => void;
}) {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      metric,
      recruiterId,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    setLoading(true);
    fetch(`/api/dashboard/recruiter-performance/details?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [metric, recruiterId, from.getTime(), to.getTime()]);

  // Close drawer on Esc — common UX pattern for slide-out panels.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = METRIC_META[metric];
  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close drawer"
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative w-full sm:w-[520px] bg-white shadow-2xl flex flex-col h-full">
        <div className="border-b border-gray-100 px-5 py-4 flex items-start gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${meta.accent}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900 leading-tight">
              {meta.label}
              {data?.recruiter ? (
                <span className="text-gray-400 font-normal"> · {data.recruiter.name}</span>
              ) : null}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {fmtRangeShort(from, to)} · {data ? data.items.length : "—"} item
              {data && data.items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-5 py-6 space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 text-gray-300" />
              No {meta.label.toLowerCase()} in this period for this recruiter.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.metric === "submissions" &&
                (data.items as SubmissionItem[]).map((r) => (
                  <DrilldownRow
                    key={r.id}
                    title={`${r.candidate.firstName} ${r.candidate.lastName}`}
                    subtitle={`${r.job.title}${r.job.client?.name ? ` · ${r.job.client.name}` : ""}`}
                    meta={[
                      fmtDate(r.createdAt),
                      r.stage?.name || "—",
                      r.isSharedWithClient ? "Shared" : "Internal",
                    ]}
                    href={`/candidates/${r.candidate.id}`}
                  />
                ))}
              {data.metric === "interviews" &&
                (data.items as InterviewItem[]).map((r) => (
                  <DrilldownRow
                    key={r.id}
                    title={`${r.candidate.firstName} ${r.candidate.lastName}`}
                    subtitle={`${r.job.title}${r.job.client?.name ? ` · ${r.job.client.name}` : ""}`}
                    meta={[
                      fmtDate(r.startTime),
                      r.type,
                      r.status,
                    ]}
                    href={`/candidates/${r.candidate.id}`}
                  />
                ))}
              {data.metric === "offers" &&
                (data.items as OfferItem[]).map((r) => (
                  <DrilldownRow
                    key={r.id}
                    title={`${r.candidate.firstName} ${r.candidate.lastName}`}
                    subtitle={`${r.job.title}${r.job.client?.name ? ` · ${r.job.client.name}` : ""}`}
                    meta={[`Moved ${fmtDate(r.updatedAt)}`]}
                    href={`/candidates/${r.candidate.id}`}
                  />
                ))}
              {data.metric === "placements" &&
                (data.items as PlacementItem[]).map((r) => {
                  const candidateName = r.submission?.candidate
                    ? `${r.submission.candidate.firstName} ${r.submission.candidate.lastName}`
                    : "—";
                  const feeBits: string[] = [];
                  if (r.kind === "OS" && r.monthlyFee) {
                    feeBits.push(`${formatCurrency(Number(r.monthlyFee), r.currency || "USD")}/mo · OS`);
                  } else if (r.kind === "HH" && r.feeAmount) {
                    feeBits.push(`${formatCurrency(Number(r.feeAmount), r.currency || "USD")} · HH`);
                  } else {
                    feeBits.push(r.kind || "HH");
                  }
                  return (
                    <DrilldownRow
                      key={r.id}
                      title={candidateName}
                      subtitle={`${r.job.title} · ${r.client.name}`}
                      meta={[fmtDate(r.startDate), ...feeBits]}
                      href={
                        r.submission?.candidate
                          ? `/candidates/${r.submission.candidate.id}`
                          : `/placements`
                      }
                    />
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DrilldownRow({
  title,
  subtitle,
  meta,
  href,
}: {
  title: string;
  subtitle: string;
  meta: string[];
  href: string;
}) {
  return (
    <Link
      href={href}
      className="block px-5 py-3 hover:bg-gray-50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate group-hover:text-indigo-700">
            {title}
          </p>
          <p className="text-xs text-gray-500 truncate">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {meta.filter(Boolean).map((m, i) => (
              <span
                key={i}
                className="text-[10px] uppercase tracking-wider text-gray-400 font-medium"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-500 shrink-0 mt-1" />
      </div>
    </Link>
  );
}
