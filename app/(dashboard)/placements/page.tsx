"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, DollarSign, Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PlacementDialog } from "@/components/placements/placement-dialog";
import { fetchUsdRates, convertToUsd } from "@/lib/exchange-rates";

type JobOption = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  clientPaymentTerms: number | null;
  clientFeeAmount: string | null;
  clientFeeType: "PERCENTAGE" | "FLAT" | null;
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  SENT: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-800",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
};

function isWithin30Days(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const expiry = new Date(dateStr);
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 30;
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function PlacementsPage() {
  const [placements, setPlacements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [jobOptions, setJobOptions] = useState<JobOption[]>([]);
  const [editingPlacement, setEditingPlacement] = useState<any | null>(null);
  const [usdRates, setUsdRates] = useState<Record<string, number> | null>(null);

  // Revenue filter — defaults to the full current year ("ALL" quarters)
  // since the recruiter usually wants the headline number for the year
  // and drills down to a specific Q only when asked.
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<"ALL" | 1 | 2 | 3 | 4>("ALL");

  function reloadPlacements() {
    fetch("/api/placements")
      .then((r) => r.json())
      .then((data) => {
        setPlacements(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load placements");
        setLoading(false);
      });
  }

  useEffect(() => {
    reloadPlacements();
    // Fire-and-forget — page renders the per-currency breakdown if rates
    // don't show up; the USD-normalized headline only appears once they do.
    fetchUsdRates().then(setUsdRates).catch(() => setUsdRates(null));
  }, []);

  function openNewDialog() {
    // Lazy-load job options the first time the dialog opens — keeps the
    // initial /placements render light.
    if (jobOptions.length === 0) {
      fetch("/api/placements/job-options")
        .then((r) => r.json())
        .then((data) => Array.isArray(data) && setJobOptions(data))
        .catch(() => {});
    }
    setShowNewDialog(true);
  }

  // Revenue for the selected period — bucketed by the placement's
  // currency, then normalized to USD using the open.er-api.com rates so
  // the recruiter sees one headline number across a mixed-currency
  // book. Per-currency amounts surface below as a sanity check so the
  // conversion is auditable at a glance.
  // Date range resolves Year + Quarter; "ALL" means the full year.
  const periodStart =
    selectedQuarter === "ALL"
      ? new Date(selectedYear, 0, 1)
      : new Date(selectedYear, (selectedQuarter - 1) * 3, 1);
  const periodEnd =
    selectedQuarter === "ALL"
      ? new Date(selectedYear, 12, 0, 23, 59, 59)
      : new Date(selectedYear, selectedQuarter * 3, 0, 23, 59, 59);

  function placementCurrency(p: any): string {
    return p.currency || p.job?.currency || "USD";
  }

  // The date a placement "belongs to" for revenue reporting. We anchor
  // on the actual start date when the candidate has already started,
  // fall back to the estimated start when not, and only fall back to
  // the record's createdAt as a last resort. This is what the recruiter
  // expects when they edit a placement's date — the row should move to
  // the right Q immediately, not stay pinned to whenever they happened
  // to click "New placement".
  function placementDate(p: any): Date {
    if (p.startDate) return new Date(p.startDate);
    if (p.estimatedStartDate) return new Date(p.estimatedStartDate);
    return new Date(p.createdAt);
  }

  // Placements that fall in the selected period. Drives BOTH the
  // Revenue card and the table below, so the recruiter sees a
  // matching view across both.
  const filteredPlacements = placements.filter((p) => {
    const d = placementDate(p);
    return d >= periodStart && d <= periodEnd;
  });

  // Alias kept readable for the bucketing logic below.
  const quarterPlacements = filteredPlacements;

  // Year dropdown options — derived from each placement's effective
  // date (same anchor as the filter) plus the current year, so the
  // recruiter only sees years that make sense.
  const placementYears = new Set<number>(
    placements.map((p) => placementDate(p).getFullYear()),
  );
  placementYears.add(today.getFullYear());
  const yearOptions = Array.from(placementYears).sort((a, b) => b - a);

  const revenueByCurrency: Record<string, number> = {};
  for (const p of quarterPlacements) {
    const c = placementCurrency(p);
    revenueByCurrency[c] = (revenueByCurrency[c] || 0) + (Number(p.feeAmount) || 0);
  }

  // Sum normalized to USD. If a currency is missing from the rates
  // table (rare) we fall back to leaving it out of the USD total and
  // surfacing it in `unconverted` so the recruiter knows.
  let revenueUsd = 0;
  const unconverted: Array<[string, number]> = [];
  for (const [ccy, amount] of Object.entries(revenueByCurrency)) {
    const usd = convertToUsd(amount, ccy, usdRates);
    if (usd != null) {
      revenueUsd += usd;
    } else if (ccy !== "USD") {
      unconverted.push([ccy, amount]);
    }
  }
  const currencyCount = Object.keys(revenueByCurrency).length;
  const breakdownEntries = Object.entries(revenueByCurrency);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Placements</h1>
          <p className="text-gray-500">
            {placements.length} placement{placements.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openNewDialog} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" />
          New Placement
        </Button>
      </div>

      <PlacementDialog
        mode="manual"
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        jobOptions={jobOptions}
        onSuccess={reloadPlacements}
      />

      {editingPlacement && (
        <PlacementDialog
          mode="edit"
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingPlacement(null);
          }}
          placementId={editingPlacement.id}
          candidateName={
            editingPlacement.submission?.candidate
              ? `${editingPlacement.submission.candidate.firstName} ${editingPlacement.submission.candidate.lastName}`
              : "Candidate"
          }
          jobTitle={editingPlacement.job?.title || "—"}
          clientName={editingPlacement.client?.name}
          initial={{
            estimatedStartDate: editingPlacement.estimatedStartDate,
            startDate: editingPlacement.startDate,
            agreedSalary: editingPlacement.salary,
            currency: editingPlacement.currency ?? editingPlacement.job?.currency ?? "USD",
            salaryPeriod: editingPlacement.salaryPeriod,
            feeAmount: editingPlacement.feeAmount,
            feePercentage: editingPlacement.feePercentage,
            feeType: editingPlacement.feeType,
            paymentTerms: editingPlacement.paymentTerms,
            paymentDueDate: editingPlacement.paymentDueDate,
            guaranteePeriod: editingPlacement.guaranteePeriod,
            notes: editingPlacement.notes,
            invoiceStatus: editingPlacement.invoiceStatus,
          }}
          onSuccess={() => {
            setEditingPlacement(null);
            reloadPlacements();
          }}
        />
      )}

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
      )}

      {/* Revenue for the selected Year + Quarter — normalized to USD
          when we have rates, with the per-currency breakdown shown
          below for auditability. */}
      <Card className="overflow-hidden">
        <div className="border-b bg-gray-50/60 px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 shrink-0">
              <DollarSign className="h-4 w-4 text-white" />
            </div>
            <p className="text-sm font-semibold text-gray-700">Revenue</p>
            <span className="text-xs text-gray-400">
              · {selectedYear}{selectedQuarter === "ALL" ? "" : ` Q${selectedQuarter}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="h-8 px-2 rounded-md border border-gray-200 bg-white text-xs font-medium hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              aria-label="Year"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={selectedQuarter}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedQuarter(v === "ALL" ? "ALL" : (Number(v) as 1 | 2 | 3 | 4));
              }}
              className="h-8 px-2 rounded-md border border-gray-200 bg-white text-xs font-medium hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              aria-label="Quarter"
            >
              <option value="ALL">All quarters</option>
              <option value={1}>Q1</option>
              <option value={2}>Q2</option>
              <option value={3}>Q3</option>
              <option value={4}>Q4</option>
            </select>
          </div>
        </div>
        <CardContent className="p-5">
          {usdRates ? (
            <div className="space-y-1.5">
              <p className="text-4xl font-bold text-indigo-600 tracking-tight">
                {formatCurrency(revenueUsd, "USD")}
              </p>
              <p className="text-xs text-gray-500 font-medium">
                {filteredPlacements.length} placement{filteredPlacements.length === 1 ? "" : "s"}
              </p>
              {unconverted.length > 0 && (
                <p className="text-[11px] text-amber-600">
                  Couldn&apos;t convert: {unconverted
                    .map(([c, amt]) => formatCurrency(amt, c))
                    .join(" · ")}
                </p>
              )}
            </div>
          ) : (
            // Fallback while rates load (or if the fetch fails): show
            // the per-currency breakdown raw so the recruiter sees their
            // numbers anyway.
            <div className="space-y-1.5">
              {breakdownEntries.length === 0 ? (
                <p className="text-4xl font-bold text-indigo-600 tracking-tight">
                  {formatCurrency(0, "USD")}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {breakdownEntries.map(([c, amt]) => (
                    <p key={c} className="text-2xl font-bold text-indigo-600 tracking-tight">
                      {formatCurrency(amt, c)}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium">
                  {filteredPlacements.length} placement{filteredPlacements.length === 1 ? "" : "s"}
                </span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-400">Loading conversion rates…</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {placements.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No placements yet. Placements are created when candidates are placed on jobs.</p>
          </CardContent>
        </Card>
      ) : filteredPlacements.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Trophy className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              No placements in {selectedYear}{selectedQuarter === "ALL" ? "" : ` · Q${selectedQuarter}`}.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedYear(today.getFullYear());
                setSelectedQuarter("ALL");
              }}
              className="mt-3 text-xs text-indigo-600 hover:underline"
            >
              Reset to {today.getFullYear()} · all quarters
            </button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate Name</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Fee Amount</TableHead>
                  <TableHead>Invoice Status</TableHead>
                  <TableHead>Guarantee Expiry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlacements.map((p) => {
                  const candidateName = p.submission?.candidate
                    ? `${p.submission.candidate.firstName} ${p.submission.candidate.lastName}`
                    : "Unknown";
                  const guaranteeExpiry = p.guaranteeExpiry;
                  const expiringSoon = isWithin30Days(guaranteeExpiry);
                  const expired = isExpired(guaranteeExpiry);

                  return (
                    <TableRow
                      key={p.id}
                      onClick={() => setEditingPlacement(p)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <TableCell className="font-medium">{candidateName}</TableCell>
                      <TableCell>{p.job?.title || "-"}</TableCell>
                      <TableCell>{p.client?.name || "-"}</TableCell>
                      <TableCell>
                        {p.startDate ? formatDate(p.startDate) : "-"}
                      </TableCell>
                      <TableCell>
                        {p.feeAmount ? (() => {
                          const ccy = p.currency || p.job?.currency || "USD";
                          const amount = Number(p.feeAmount);
                          const local = formatCurrency(amount, ccy);
                          if (ccy === "USD") return <span>{local}</span>;
                          const usd = convertToUsd(amount, ccy, usdRates);
                          return (
                            <div className="leading-tight">
                              <p className="font-medium">{local}</p>
                              {usd != null && (
                                <p className="text-[11px] text-gray-400">
                                  ≈ {formatCurrency(usd, "USD")}
                                </p>
                              )}
                            </div>
                          );
                        })() : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={INVOICE_STATUS_COLORS[p.invoiceStatus]}>
                          {INVOICE_STATUS_LABELS[p.invoiceStatus] || p.invoiceStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {guaranteeExpiry ? (
                          <span
                            className={
                              expired
                                ? "text-gray-400 line-through"
                                : expiringSoon
                                  ? "text-red-600 font-semibold"
                                  : ""
                            }
                          >
                            {formatDate(guaranteeExpiry)}
                            {expiringSoon && !expired && (
                              <span className="ml-1 text-xs">(expiring soon)</span>
                            )}
                            {expired && (
                              <span className="ml-1 text-xs text-gray-400">(expired)</span>
                            )}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
