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

  // Revenue filter — defaults to the current year + quarter so the
  // recruiter sees today's number on page load. They can scope to any
  // year/quarter that has data via the dropdowns on the card.
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(
    (Math.floor(today.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  );

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

  // Revenue this quarter — bucketed by the placement's currency. We
  // normalize to USD using the open.er-api.com rates so the recruiter
  // sees one headline number across a mixed-currency book. Per-currency
  // amounts surface below as a sanity check so the conversion is
  // auditable at a glance.
  const quarterStart = new Date(selectedYear, (selectedQuarter - 1) * 3, 1);
  const quarterEnd = new Date(selectedYear, selectedQuarter * 3, 0, 23, 59, 59);

  function placementCurrency(p: any): string {
    return p.currency || p.job?.currency || "USD";
  }

  const quarterPlacements = placements.filter((p) => {
    const d = new Date(p.createdAt);
    return d >= quarterStart && d <= quarterEnd;
  });

  // Year dropdown options — derived from the actual data plus the
  // current year, so the recruiter only sees years that make sense.
  const placementYears = new Set<number>(
    placements.map((p) => new Date(p.createdAt).getFullYear()),
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
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 shrink-0">
              <DollarSign className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-gray-500">Revenue</p>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="h-7 px-2 rounded border border-gray-200 bg-white text-xs"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
                  className="h-7 px-2 rounded border border-gray-200 bg-white text-xs"
                >
                  <option value={1}>Q1</option>
                  <option value={2}>Q2</option>
                  <option value={3}>Q3</option>
                  <option value={4}>Q4</option>
                </select>
              </div>
              {usdRates ? (
                <>
                  <p className="text-2xl font-bold text-indigo-600">
                    {formatCurrency(revenueUsd, "USD")}
                  </p>
                  {currencyCount > 1 && breakdownEntries.length > 0 && (
                    <p className="text-[11px] text-gray-400 truncate">
                      ≈ {breakdownEntries
                        .map(([c, amt]) => formatCurrency(amt, c))
                        .join(" · ")} converted at today&apos;s rates
                    </p>
                  )}
                  {currencyCount === 1 && breakdownEntries[0]?.[0] !== "USD" && (
                    <p className="text-[11px] text-gray-400 truncate">
                      = {formatCurrency(breakdownEntries[0][1], breakdownEntries[0][0])} converted
                    </p>
                  )}
                  {unconverted.length > 0 && (
                    <p className="text-[11px] text-amber-600 truncate">
                      Couldn&apos;t convert: {unconverted
                        .map(([c, amt]) => formatCurrency(amt, c))
                        .join(" · ")}
                    </p>
                  )}
                </>
              ) : (
                // Fallback while rates load (or if the fetch fails):
                // show the per-currency breakdown raw so the recruiter
                // sees their numbers anyway.
                <>
                  {breakdownEntries.length === 0 ? (
                    <p className="text-2xl font-bold text-indigo-600">
                      {formatCurrency(0, "USD")}
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {breakdownEntries.map(([c, amt]) => (
                        <p key={c} className="text-lg font-semibold text-indigo-600">
                          {formatCurrency(amt, c)}
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400">Loading conversion rates…</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {placements.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No placements yet. Placements are created when candidates are placed on jobs.</p>
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
                {placements.map((p) => {
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
                        {p.feeAmount ? formatCurrency(Number(p.feeAmount), p.currency || p.job?.currency || "USD") : "-"}
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
