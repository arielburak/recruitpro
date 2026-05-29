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
import { formatCurrency, formatDate, formatDateOnly } from "@/lib/utils";
import { PlacementDialog } from "@/components/placements/placement-dialog";
// Currency conversion (fetchUsdRates / convertToUsd) was removed for
// MVP — every placement is treated as already in USD. If multi-
// currency reporting comes back later, see lib/exchange-rates.

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

  // Split the book by kind. HH (headhunting / contingent) is a flat
  // fee booked at close; OS (staff aug) is a recurring MRR that
  // accrues over the months the engagement is active. Mixing them
  // into a single "Revenue" number (and especially a single "Avg
  // Fee") is the exact bug that produced the absurd $3.15M average
  // earlier — keep them separate.
  const hhPlacements = placements.filter((p) => (p.kind || "HH") === "HH");
  const osPlacements = placements.filter((p) => p.kind === "OS");

  // HH placements that booked in the selected period (anchor on
  // startDate / estimatedStartDate / createdAt, same as before).
  const hhInPeriod = hhPlacements.filter((p) => {
    const d = placementDate(p);
    return d >= periodStart && d <= periodEnd;
  });

  // Total placements (HH + OS) signed in period — used for the
  // "Placements" count tile so the recruiter sees overall activity.
  const placementsInPeriod = placements.filter((p) => {
    const d = placementDate(p);
    return d >= periodStart && d <= periodEnd;
  });

  // OS revenue accrued during the period: monthlyFee × calendar
  // months the engagement was active inside [periodStart, periodEnd].
  // Uses whole-month overlap, not days — keeps the math
  // understandable and matches how MRR is typically tracked.
  function osMonthsInPeriod(p: any): number {
    const start = p.startDate
      ? new Date(p.startDate)
      : p.estimatedStartDate
        ? new Date(p.estimatedStartDate)
        : new Date(p.createdAt);
    const end = p.endDate ? new Date(p.endDate) : new Date();
    const s = start > periodStart ? start : periodStart;
    const e = end < periodEnd ? end : periodEnd;
    if (e < s) return 0;
    return (
      (e.getFullYear() - s.getFullYear()) * 12 +
      (e.getMonth() - s.getMonth()) +
      1
    );
  }
  let osRevenueInPeriod = 0;
  for (const p of osPlacements) {
    const m = osMonthsInPeriod(p);
    osRevenueInPeriod += m * (Number(p.monthlyFee) || 0);
  }

  // Active MRR = sum of monthlyFee for OS placements whose endDate
  // is null (or in the future). Matches the "Active" badge in the OS
  // table below — a signed engagement counts as active even if
  // billing hasn't started yet ("committed MRR"). Conflating it with
  // a stricter started-and-not-ended predicate was the bug that made
  // Karen's $6.5k/mo show as $0 the day before her start date.
  const todayMs = today.getTime();
  let activeMrr = 0;
  let activeOsCount = 0;
  for (const p of osPlacements) {
    const ended = p.endDate ? new Date(p.endDate).getTime() < todayMs : false;
    if (!ended) {
      activeMrr += Number(p.monthlyFee) || 0;
      activeOsCount += 1;
    }
  }

  // HH bookings (period) = sum of feeAmount on HH placements in period.
  let hhBookingsInPeriod = 0;
  for (const p of hhInPeriod) {
    hhBookingsInPeriod += Number(p.feeAmount) || 0;
  }

  // Year dropdown options — the contiguous range from the earliest
  // placement through the current year. We deliberately include
  // years with zero placements (e.g. an agency that paused
  // operations one year, or historical data where one calendar year
  // happens to be empty) so the user can navigate to them and
  // confirm "yes, this year was empty" rather than wondering why
  // the dropdown skipped a gap.
  const placementYearValues = placements.map((p) => placementDate(p).getFullYear());
  const currentYear = today.getFullYear();
  const earliestYear = placementYearValues.length > 0
    ? Math.min(...placementYearValues, currentYear)
    : currentYear;
  const yearOptions: number[] = [];
  for (let y = currentYear; y >= earliestYear; y--) yearOptions.push(y);

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
            salaryKind: editingPlacement.salaryKind,
            feeAmount: editingPlacement.feeAmount,
            feePercentage: editingPlacement.feePercentage,
            feeType: editingPlacement.feeType,
            paymentTerms: editingPlacement.paymentTerms,
            paymentDueDate: editingPlacement.paymentDueDate,
            guaranteePeriod: editingPlacement.guaranteePeriod,
            notes: editingPlacement.notes,
            invoiceStatus: editingPlacement.invoiceStatus,
            kind: editingPlacement.kind,
            monthlyFee: editingPlacement.monthlyFee,
            endDate: editingPlacement.endDate,
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

      {/* Year + quarter filter — applies to both HH revenue and OS
          accrued revenue below. Lives on its own row so the two
          revenue cards underneath can each stand on their own. */}
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[11px] text-gray-400 mr-1">Period</span>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="h-7 px-2 rounded-md border border-gray-200 bg-white text-xs font-medium hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
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
          className="h-7 px-2 rounded-md border border-gray-200 bg-white text-xs font-medium hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          aria-label="Quarter"
        >
          <option value="ALL">All quarters</option>
          <option value={1}>Q1</option>
          <option value={2}>Q2</option>
          <option value={3}>Q3</option>
          <option value={4}>Q4</option>
        </select>
      </div>

      {/* HH and OS as two side-by-side panels so the two revenue
          shapes are visually segmented, not crammed into one strip.
          HH numbers are period-scoped (Year + Quarter above); OS
          mixes period revenue with point-in-time MRR because that's
          what an agency owner actually wants to see. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <div className="border-b bg-indigo-50/60 px-4 py-2.5 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 shrink-0">
              <DollarSign className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-xs font-semibold text-indigo-900">Headhunting (HH)</p>
            <span className="text-[11px] text-indigo-700/70 ml-auto">
              {selectedYear}{selectedQuarter === "ALL" ? "" : ` · Q${selectedQuarter}`}
            </span>
          </div>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="pr-4">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                  Revenue
                </p>
                <p className="text-2xl font-semibold text-indigo-600 tracking-tight mt-1">
                  {formatCurrency(hhBookingsInPeriod, "USD")}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">fees in period</p>
              </div>
              <div className="pl-4">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                  Placements
                </p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">
                  {hhInPeriod.length}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">closed in period</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b bg-emerald-50/60 px-4 py-2.5 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 shrink-0">
              <DollarSign className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-xs font-semibold text-emerald-900">Staff Aug (OS)</p>
            <span className="text-[11px] text-emerald-700/70 ml-auto">recurring · MRR</span>
          </div>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              <div className="pr-4">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                  Active MRR
                </p>
                <p className="text-2xl font-semibold text-emerald-600 mt-1">
                  {formatCurrency(activeMrr, "USD")}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">today</p>
              </div>
              <div className="px-4">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                  Engagements
                </p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">
                  {activeOsCount}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">active now</p>
              </div>
              <div className="pl-4">
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                  Accrued
                </p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">
                  {formatCurrency(osRevenueInPeriod, "USD")}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {selectedYear}{selectedQuarter === "ALL" ? "" : ` · Q${selectedQuarter}`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {placements.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Trophy className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No placements yet. Placements are created when candidates are placed on jobs.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* HH Placements — filtered by Year + Quarter so the table
              matches the HH Bookings tile above. Each row is the
              traditional one-time-fee placement with guarantee +
              invoice tracking. */}
          <Card>
            <div className="border-b bg-gray-50/60 px-4 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-700">HH Placements</p>
                <p className="text-[11px] text-gray-400">
                  {hhInPeriod.length} in {selectedYear}{selectedQuarter === "ALL" ? "" : ` · Q${selectedQuarter}`}
                </p>
              </div>
            </div>
            <CardContent className="p-0">
              {hhInPeriod.length === 0 ? (
                <div className="p-8 text-center">
                  <Trophy className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No HH placements in this period.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate Name</TableHead>
                      <TableHead>Recruiter</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Fee Amount</TableHead>
                      <TableHead>Invoice Status</TableHead>
                      <TableHead>Guarantee Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hhInPeriod.map((p) => {
                      const candidateName = p.submission?.candidate
                        ? `${p.submission.candidate.firstName} ${p.submission.candidate.lastName}`
                        : "Unknown";
                      const guaranteeExpiry = p.guaranteeExpiry;
                      const expiringSoon = isWithin30Days(guaranteeExpiry);
                      const expired = isExpired(guaranteeExpiry);
                      const recruiterName = p.submission?.candidate?.owner?.name || "—";

                      return (
                        <TableRow
                          key={p.id}
                          onClick={() => setEditingPlacement(p)}
                          className="cursor-pointer hover:bg-gray-50"
                        >
                          <TableCell className="font-medium">{candidateName}</TableCell>
                          <TableCell className="text-sm text-gray-700">{recruiterName}</TableCell>
                          <TableCell>{p.job?.title || "-"}</TableCell>
                          <TableCell>{p.client?.name || "-"}</TableCell>
                          <TableCell>
                            {p.startDate ? formatDateOnly(p.startDate, "en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"}
                          </TableCell>
                          <TableCell>
                            {p.feeAmount
                              ? formatCurrency(Number(p.feeAmount), "USD")
                              : "-"}
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
                                {formatDateOnly(guaranteeExpiry, "en-US", { month: "short", day: "numeric", year: "numeric" })}
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
              )}
            </CardContent>
          </Card>

          {/* OS Engagements — staff-aug placements with recurring
              monthlyFee. NOT filtered by period: the recruiter wants
              the full active book at a glance, with ended engagements
              flagged. Sorted active-first, then by most-recent start. */}
          <Card>
            <div className="border-b bg-gray-50/60 px-4 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-700">OS Engagements</p>
                <p className="text-[11px] text-gray-400">
                  {activeOsCount} active · {osPlacements.length} total
                </p>
              </div>
            </div>
            <CardContent className="p-0">
              {osPlacements.length === 0 ? (
                <div className="p-8 text-center">
                  <Trophy className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    No staff-aug engagements yet.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Candidate Name</TableHead>
                      <TableHead>Recruiter</TableHead>
                      <TableHead>Job Title</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Monthly Fee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>End Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...osPlacements]
                      .sort((a, b) => {
                        const aActive = !a.endDate || new Date(a.endDate).getTime() >= todayMs;
                        const bActive = !b.endDate || new Date(b.endDate).getTime() >= todayMs;
                        if (aActive !== bActive) return aActive ? -1 : 1;
                        return placementDate(b).getTime() - placementDate(a).getTime();
                      })
                      .map((p) => {
                        const candidateName = p.submission?.candidate
                          ? `${p.submission.candidate.firstName} ${p.submission.candidate.lastName}`
                          : "Unknown";
                        const recruiterName = p.submission?.candidate?.owner?.name || "—";
                        const ended = p.endDate && new Date(p.endDate).getTime() < todayMs;
                        return (
                          <TableRow
                            key={p.id}
                            onClick={() => setEditingPlacement(p)}
                            className="cursor-pointer hover:bg-gray-50"
                          >
                            <TableCell className="font-medium">{candidateName}</TableCell>
                            <TableCell className="text-sm text-gray-700">{recruiterName}</TableCell>
                            <TableCell>{p.job?.title || "-"}</TableCell>
                            <TableCell>{p.client?.name || "-"}</TableCell>
                            <TableCell>
                              {p.startDate ? formatDateOnly(p.startDate, "en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"}
                            </TableCell>
                            <TableCell>
                              {p.monthlyFee
                                ? `${formatCurrency(Number(p.monthlyFee), "USD")}/mo`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {ended ? (
                                <Badge className="bg-gray-100 text-gray-600">Ended</Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-700">Active</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {p.endDate
                                ? formatDateOnly(p.endDate, "en-US", { month: "short", day: "numeric", year: "numeric" })
                                : "Ongoing"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
