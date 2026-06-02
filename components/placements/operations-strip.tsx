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
  mrrLost: number;
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
    sublabel: () => "Within 30 days",
    icon: ShieldAlert,
    accent: "bg-purple-50 text-purple-600",
  },
  {
    key: "startingNext30Days",
    label: "Starting in 30 days",
    sublabel: () => "Draft invoices · prep ahead",
    icon: CalendarClock,
    accent: "bg-blue-50 text-blue-600",
  },
  {
    key: "mrrAtRisk",
    label: "MRR at risk",
    sublabel: (d) =>
      d && d.mrrLost > 0
        ? `${formatCurrency(d.mrrLost, "USD")}/mo lost in last 30d`
        : "OS endings · last 30 days",
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
                {loading ? <span className="text-gray-300">—</span> : value}
              </p>
              <p className="text-xs font-medium text-gray-700 mt-2">{t.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {t.sublabel(data)}
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
                return (
                  <ActionRow
                    key={p.id}
                    href={href}
                    title={title}
                    subtitle={subtitle}
                    meta={meta}
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
    return [
      `Due ${fmtDate(p.paymentDueDate)}`,
      p.feeAmount
        ? formatCurrency(Number(p.feeAmount), p.currency || "USD")
        : "—",
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
    return [
      `Starts ${fmtDate(p.startDate)}`,
      p.feeAmount
        ? formatCurrency(Number(p.feeAmount), p.currency || "USD")
        : "—",
      p.invoiceStatus,
    ];
  }
  // mrrAtRisk
  return [
    `Ended ${fmtDate(p.endDate)}`,
    p.monthlyFee
      ? `${formatCurrency(Number(p.monthlyFee), p.currency || "USD")}/mo`
      : "—",
  ];
}

function ActionRow({
  href,
  title,
  subtitle,
  meta,
}: {
  href: string;
  title: string;
  subtitle: string;
  meta: string[];
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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
