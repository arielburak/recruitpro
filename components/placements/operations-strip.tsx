"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  ShieldAlert,
  CalendarClock,
  TrendingDown,
  ExternalLink,
  X,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

// Operational at-a-glance strip on the Placements page. Reuses the
// drill-down drawer pattern from the dashboard's Action Center —
// click a tile, see the underlying rows. MVP scope: four cash-flow /
// risk signals that belong here (and used to live on the dashboard
// where they didn't really fit).

type OperationsResponse = {
  paymentsOverdue: number;
  receivablesTotal: number;
  guaranteesExpiring: number;
  startingNext30Days: number;
  mrrAtRisk: number;
  mrrAtRiskAmount: number;
};

type TileKey =
  | "paymentsOverdue"
  | "guaranteesExpiring"
  | "startingNext30Days"
  | "mrrAtRisk";

type TileDef = {
  key: TileKey;
  label: string;
  sublabel: (data: OperationsResponse | null) => string;
  icon: any;
  accent: string;
};

const TILES: TileDef[] = [
  {
    key: "paymentsOverdue",
    label: "Payments overdue",
    sublabel: (d) =>
      d && d.receivablesTotal > 0
        ? `${formatCurrency(d.receivablesTotal, "USD")} outstanding`
        : "HH invoices past due",
    icon: DollarSign,
    accent: "bg-rose-50 text-rose-600",
  },
  {
    key: "guaranteesExpiring",
    label: "Guarantees expiring",
    sublabel: () => "Within 60 days",
    icon: ShieldAlert,
    accent: "bg-purple-50 text-purple-600",
  },
  {
    key: "startingNext30Days",
    label: "Starting in 60 days",
    sublabel: () => "First days · HH + OS",
    icon: CalendarClock,
    accent: "bg-blue-50 text-blue-600",
  },
  {
    key: "mrrAtRisk",
    label: "MRR at risk",
    sublabel: (d) =>
      d && d.mrrAtRiskAmount > 0
        ? `${formatCurrency(d.mrrAtRiskAmount, "USD")}/mo at stake`
        : "OS endings · next 60 days",
    icon: TrendingDown,
    accent: "bg-amber-50 text-amber-600",
  },
];

export function PlacementsOperationsStrip() {
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<TileKey | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/placements/operations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: OperationsResponse | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          const value = data ? (data as any)[t.key] as number : 0;
          const hasItems = value > 0;
          return (
            <Card
              key={t.key}
              className={`p-4 cursor-pointer transition-colors ${
                hasItems
                  ? "hover:border-indigo-200 hover:shadow-sm"
                  : "opacity-70 hover:opacity-100"
              }`}
              onClick={() => hasItems && setDrill(t.key)}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {hasItems && (
                  <ExternalLink className="h-3 w-3 text-gray-300" />
                )}
              </div>
              <p className="text-2xl font-semibold text-gray-900 leading-none">
                {loading ? (
                  <span className="text-gray-300">—</span>
                ) : t.key === "mrrAtRisk" && data && data.mrrAtRiskAmount > 0 ? (
                  // For MRR at risk, the $/mo number is the headline
                  // — the recruiter doesn't care that "1 engagement is
                  // ending", they care that "$10,000/mo is about to
                  // walk out". Count moves down as a secondary tag.
                  <span className="inline-flex items-baseline gap-1.5">
                    <span>{formatCurrency(data.mrrAtRiskAmount, "USD")}</span>
                    <span className="text-sm font-medium text-gray-500">/mo</span>
                  </span>
                ) : t.key === "paymentsOverdue" && data && data.receivablesTotal > 0 ? (
                  // Same rationale as mrrAtRisk: the dollar amount is
                  // what the recruiter chases, not the number of
                  // invoices. Count drops to the sublabel below.
                  <span>{formatCurrency(data.receivablesTotal, "USD")}</span>
                ) : (
                  value
                )}
              </p>
              <p className="text-xs font-medium text-gray-700 mt-2">{t.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {t.key === "mrrAtRisk" && data && data.mrrAtRiskAmount > 0
                  ? `${value} engagement${value === 1 ? "" : "s"} · next 60 days`
                  : t.key === "paymentsOverdue" && data && data.receivablesTotal > 0
                    ? `${value} invoice${value === 1 ? "" : "s"} past due`
                    : t.sublabel(data)}
              </p>
            </Card>
          );
        })}
      </div>

      {drill && <DrillDrawer tile={drill} onClose={() => setDrill(null)} />}
    </>
  );
}

function DrillDrawer({ tile, onClose }: { tile: TileKey; onClose: () => void }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/placements/operations/details?tile=${tile}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [tile]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const meta = TILES.find((t) => t.key === tile)!;
  const Icon = meta.icon;
  const items = data?.items || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
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
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {items.length} item{items.length === 1 ? "" : "s"}
              {tile === "mrrAtRisk" && items.length > 0
                ? (() => {
                    const total = items.reduce(
                      (s: number, p: any) =>
                        s + (p.monthlyFee ? Number(p.monthlyFee) : 0),
                      0,
                    );
                    return total > 0
                      ? ` · ${formatCurrency(total, "USD")}/mo at stake`
                      : "";
                  })()
                : ""}
              {tile === "paymentsOverdue" && items.length > 0
                ? (() => {
                    const total = items.reduce(
                      (s: number, p: any) =>
                        s + (p.feeAmount ? Number(p.feeAmount) : 0),
                      0,
                    );
                    return total > 0
                      ? ` · ${formatCurrency(total, "USD")} outstanding`
                      : "";
                  })()
                : ""}
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
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5 text-gray-300" />
              Nothing here. Good job.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((p: any) => {
                const cand = p.submission?.candidate;
                const title = cand
                  ? `${cand.firstName} ${cand.lastName}`
                  : "Placement";
                const href = cand ? `/candidates/${cand.id}` : "/placements";
                const subtitle = `${p.job?.title || "—"} · ${p.client?.name || "—"}`;
                const meta = buildMeta(tile, p);
                // Surface the dollar amount as a prominent pill on
                // the right of the row for the two money-shaped tiles
                // (mrrAtRisk in amber, paymentsOverdue in rose). The
                // recruiter reads the number at a glance instead of
                // chasing it through the meta strip below.
                let amountBadge: string | null = null;
                let amountBadgeAccent: "amber" | "rose" | null = null;
                if (tile === "mrrAtRisk" && p.monthlyFee) {
                  amountBadge = `${formatCurrency(Number(p.monthlyFee), p.currency || "USD")}/mo`;
                  amountBadgeAccent = "amber";
                } else if (tile === "paymentsOverdue" && p.feeAmount) {
                  amountBadge = formatCurrency(Number(p.feeAmount), p.currency || "USD");
                  amountBadgeAccent = "rose";
                }
                return (
                  <ActionRow
                    key={p.id}
                    href={href}
                    title={title}
                    subtitle={subtitle}
                    meta={meta}
                    amountBadge={amountBadge}
                    amountBadgeAccent={amountBadgeAccent}
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

function buildMeta(tile: TileKey, p: any): string[] {
  if (tile === "paymentsOverdue") {
    // feeAmount surfaces in the amountBadge pill (rose) on the
    // right of the row — no need to repeat it in the meta strip.
    return [
      `Due ${fmtDate(p.paymentDueDate)}`,
      p.invoiceStatus,
    ];
  }
  if (tile === "guaranteesExpiring") {
    return [
      `Expires ${fmtDate(p.guaranteeExpiry)}`,
      p.startDate ? `Started ${fmtDate(p.startDate)}` : "",
    ];
  }
  if (tile === "startingNext30Days") {
    // Estimated start is a soft fallback: shown when the firm date
    // isn't set yet so the row still has a date to anchor on.
    const effective = p.startDate || p.estimatedStartDate;
    const datePrefix = p.startDate ? "Starts" : "Est. start";
    const meta = [`${datePrefix} ${fmtDate(effective)}`, p.kind === "OS" ? "OS" : "HH"];
    if (p.kind === "OS" && p.monthlyFee) {
      meta.push(`${formatCurrency(Number(p.monthlyFee), p.currency || "USD")}/mo`);
    } else if (p.feeAmount) {
      meta.push(formatCurrency(Number(p.feeAmount), p.currency || "USD"));
    }
    return meta;
  }
  // mrrAtRisk — engagement is about to end, not already ended. The
  // monthly fee is surfaced as the amountBadge on the right of the
  // row instead of inline here, so it reads at a glance.
  return [`Ends ${fmtDate(p.endDate)}`];
}

function ActionRow({
  href,
  title,
  subtitle,
  meta,
  amountBadge,
  amountBadgeAccent,
}: {
  href: string;
  title: string;
  subtitle: string;
  meta: string[];
  // Headline-style number on the right of the row. Used by
  // mrrAtRisk to surface $/mo at risk and by paymentsOverdue to
  // surface $ outstanding. Null hides it.
  amountBadge?: string | null;
  amountBadgeAccent?: "amber" | "rose" | null;
}) {
  const badgeClasses =
    amountBadgeAccent === "rose"
      ? "text-rose-700 bg-rose-50"
      : "text-amber-700 bg-amber-50";
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
        <div className="flex items-center gap-2 shrink-0">
          {amountBadge && (
            <span className={`text-sm font-semibold px-2 py-1 rounded-md whitespace-nowrap ${badgeClasses}`}>
              {amountBadge}
            </span>
          )}
          <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-500 mt-1" />
        </div>
      </div>
    </Link>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
