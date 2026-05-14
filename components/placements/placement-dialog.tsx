"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PartyPopper, ArrowRight, Building2, User } from "lucide-react";
import { CurrencyPicker, getCurrency, formatCurrencyValue } from "@/components/ui/currency-picker";

// Defaults that pre-fill the form. Anything we know from the candidate /
// job / client gets surfaced; the recruiter can still override.
type SalaryPeriod = "MONTHLY" | "ANNUAL";

type FormDefaults = {
  estimatedStartDate?: string; // ISO yyyy-mm-dd
  agreedSalary?: string;
  currency?: string; // ISO 4217 code, e.g. USD / ARS
  salaryPeriod?: SalaryPeriod;
  feeAmount?: string;
  feeType?: "PERCENTAGE" | "FLAT";
  paymentTerms?: number; // days
  guaranteePeriod?: number; // days
  notes?: string;
};

// LATAM currencies where salaries are typically quoted monthly. For
// everything else (USD, EUR, GBP, etc.) we default the placement form
// to annual since that's the convention in those markets. Always
// overrideable via the toggle.
const MONTHLY_DEFAULT_CURRENCIES = new Set([
  "ARS", "BRL", "CLP", "COP", "MXN", "PEN", "UYU", "PYG", "BOB", "VEF",
]);

function defaultSalaryPeriod(currency: string | undefined | null): SalaryPeriod {
  if (currency && MONTHLY_DEFAULT_CURRENCIES.has(currency)) return "MONTHLY";
  return "ANNUAL";
}

type CongratsProps = {
  mode: "congrats";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionId: string;
  candidateName: string;
  jobTitle: string;
  clientName?: string;
  defaults?: FormDefaults;
  onSuccess?: () => void;
};

type ManualProps = {
  mode: "manual";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobOptions: Array<{
    id: string;
    title: string;
    clientId: string;
    clientName: string;
    candidateDesiredSalary?: string | null;
    candidateSalaryCurrency?: string | null;
    jobCurrency?: string | null;
    clientPaymentTerms?: number | null;
    clientGuaranteePeriod?: number | null;
    clientFeeAmount?: string | null;
    clientFeeType?: "PERCENTAGE" | "FLAT" | null;
  }>;
  onSuccess?: () => void;
};

// Edit mode: open an existing placement and back-fill any of the fields
// the recruiter skipped (or fix what they entered before). Covers the
// "Skip / Complete later" flow — a near-empty placement gets created
// when the recruiter dismisses the congrats dialog, and this is how
// they finish it.
type EditProps = {
  mode: "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placementId: string;
  candidateName: string;
  jobTitle: string;
  clientName?: string;
  initial: {
    estimatedStartDate?: string | null;
    startDate?: string | null;
    agreedSalary?: string | number | null;
    currency?: string | null;
    salaryPeriod?: SalaryPeriod | null;
    feeAmount?: string | number | null;
    feePercentage?: string | number | null;
    feeType?: "PERCENTAGE" | "FLAT" | null;
    paymentTerms?: number | null;
    paymentDueDate?: string | null;
    guaranteePeriod?: number | null;
    notes?: string | null;
    invoiceStatus?: "DRAFT" | "SENT" | "PAID";
  };
  onSuccess?: () => void;
};

type Props = CongratsProps | ManualProps | EditProps;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Anchor on the best date available (actual start beats estimated) and
// add `days`. Pure function so the live preview stays in sync with what
// the server does on save.
function previewFromAnchor(
  actualStart: string,
  estimatedStart: string,
  days: number | "",
): string {
  const anchorStr = actualStart || estimatedStart;
  if (!anchorStr || days === "" || isNaN(Number(days))) return "";
  const anchor = new Date(anchorStr);
  if (isNaN(anchor.getTime())) return "";
  anchor.setDate(anchor.getDate() + Number(days));
  return anchor.toISOString().slice(0, 10);
}

export function PlacementDialog(props: Props) {
  const isCongrats = props.mode === "congrats";
  const isEdit = props.mode === "edit";

  // Two-step flow only matters in the congrats variant — in manual / edit
  // mode we jump straight to the form because there is nothing to "skip".
  const [step, setStep] = useState<"intro" | "form">(isCongrats ? "intro" : "form");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [skipping, setSkipping] = useState(false);

  // Manual-mode-only: which job the recruiter is back-filling.
  const [selectedJobId, setSelectedJobId] = useState("");

  // Form fields — controlled so the live due-date preview stays accurate.
  const [estimatedStartDate, setEstimatedStartDate] = useState("");
  const [startDate, setStartDate] = useState(""); // edit mode only
  const [agreedSalary, setAgreedSalary] = useState("");
  // ISO 4217 currency code. Falls back to USD by default — the most common
  // case for our target market (US recruiting firms) — and gets overridden
  // by the job/client default when the dialog opens.
  const [currency, setCurrency] = useState<string>("USD");
  const [salaryPeriod, setSalaryPeriod] = useState<SalaryPeriod>("ANNUAL");
  // Fee uses a single input value whose meaning flips with feeType:
  //   - PERCENTAGE: feeInput is the % (e.g. 15) and the real fee in $
  //     is computed as salary × % / 100 on save.
  //   - FLAT: feeInput is the fee in $ directly.
  // This avoids the old bug where the percentage value (15) was being
  // saved into feeAmount and showed up as "$15" in the placements list.
  const [feeInput, setFeeInput] = useState("");
  const [feeType, setFeeType] = useState<"PERCENTAGE" | "FLAT">("PERCENTAGE");
  const [paymentTerms, setPaymentTerms] = useState<number | "">("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [paymentDueDateTouched, setPaymentDueDateTouched] = useState(false);
  const [guaranteePeriod, setGuaranteePeriod] = useState<number | "">(90);
  const [notes, setNotes] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<"DRAFT" | "SENT" | "PAID">("DRAFT");

  // Resolve which "defaults" object to apply. Manual mode picks defaults off
  // the selected job; congrats mode uses the static defaults the caller passed.
  // Edit mode bypasses this entirely and hydrates from props.initial below.
  const activeDefaults: FormDefaults | undefined = useMemo(() => {
    if (isEdit) return undefined;
    if (isCongrats) return props.defaults;
    if (!selectedJobId) return undefined;
    const job = props.jobOptions.find((j) => j.id === selectedJobId);
    if (!job) return undefined;
    return {
      estimatedStartDate: todayIso(),
      agreedSalary: job.candidateDesiredSalary || undefined,
      currency: job.jobCurrency || job.candidateSalaryCurrency || undefined,
      feeAmount: job.clientFeeAmount || undefined,
      feeType: job.clientFeeType || undefined,
      paymentTerms: job.clientPaymentTerms ?? undefined,
      guaranteePeriod: job.clientGuaranteePeriod ?? undefined,
    };
  }, [isCongrats, isEdit, props, selectedJobId]);

  // Hydrate the form whenever the dialog opens. Edit mode pulls from
  // props.initial (the existing placement record); the other two modes
  // pull from activeDefaults.
  useEffect(() => {
    if (!props.open) return;
    if (isEdit) {
      const i = props.initial;
      const isoDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
      setEstimatedStartDate(isoDate(i.estimatedStartDate));
      setStartDate(isoDate(i.startDate));
      setAgreedSalary(i.agreedSalary != null ? String(i.agreedSalary) : "");
      const editCurrency = i.currency || "USD";
      setCurrency(editCurrency);
      setSalaryPeriod(i.salaryPeriod || defaultSalaryPeriod(editCurrency));
      // Infer feeType from the stored values since Placement doesn't
      // persist the type directly: feePercentage set → PERCENTAGE; else
      // feeAmount with no percentage → FLAT; else fall back to whatever
      // the caller passed (or default to PERCENTAGE for empty rows).
      const inferredType: "PERCENTAGE" | "FLAT" =
        i.feeType ||
        (i.feePercentage != null
          ? "PERCENTAGE"
          : i.feeAmount != null
            ? "FLAT"
            : "PERCENTAGE");
      // For PERCENTAGE we show the percent; for FLAT the $ amount.
      // Legacy fallback to feeAmount when feePercentage is missing
      // covers rows from before this fix (where the percent was
      // mistakenly stored into feeAmount).
      const initialFee =
        inferredType === "PERCENTAGE"
          ? (i.feePercentage ?? i.feeAmount)
          : i.feeAmount;
      setFeeInput(initialFee != null ? String(initialFee) : "");
      setFeeType(inferredType);
      setPaymentTerms(i.paymentTerms ?? "");
      const initialDue = isoDate(i.paymentDueDate);
      setPaymentDueDate(initialDue);
      // Only respect a previously-saved due date — if the placement was
      // skipped on creation, the field is empty and we want the live
      // preview to fill it from start + terms as the recruiter completes
      // the form.
      setPaymentDueDateTouched(Boolean(initialDue));
      setGuaranteePeriod(i.guaranteePeriod ?? 90);
      setNotes(i.notes || "");
      setInvoiceStatus(i.invoiceStatus || "DRAFT");
    } else {
      setEstimatedStartDate(activeDefaults?.estimatedStartDate || todayIso());
      setStartDate("");
      setAgreedSalary(activeDefaults?.agreedSalary || "");
      const newCurrency = activeDefaults?.currency || "USD";
      setCurrency(newCurrency);
      setSalaryPeriod(activeDefaults?.salaryPeriod || defaultSalaryPeriod(newCurrency));
      // activeDefaults.feeAmount semantically follows feeType — for
      // Recruiting it's the agreed %, for Staff Aug (FLAT jobs) it's
      // the agreed flat fee. We just bind it to the single input.
      setFeeInput(activeDefaults?.feeAmount || "");
      setFeeType(activeDefaults?.feeType || "PERCENTAGE");
      setPaymentTerms(activeDefaults?.paymentTerms ?? 30);
      setGuaranteePeriod(activeDefaults?.guaranteePeriod ?? 90);
      setNotes(activeDefaults?.notes || "");
      setInvoiceStatus("DRAFT");
      setPaymentDueDateTouched(false);
    }
    setError("");
    setStep(isCongrats ? "intro" : "form");
    if (props.mode === "manual") setSelectedJobId("");
  }, [props, activeDefaults, isCongrats, isEdit]);

  // Live recompute paymentDueDate from the anchor + terms unless the user
  // has manually edited the date field.
  useEffect(() => {
    if (paymentDueDateTouched) return;
    setPaymentDueDate(previewFromAnchor(startDate, estimatedStartDate, paymentTerms));
  }, [startDate, estimatedStartDate, paymentTerms, paymentDueDateTouched]);

  // Live preview of when the guarantee expires. Read-only — server
  // computes the persisted value on save with the same logic.
  const guaranteeExpiryPreview = previewFromAnchor(startDate, estimatedStartDate, guaranteePeriod);

  function close() {
    props.onOpenChange(false);
  }

  async function postPlacement(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to create placement");
        setSubmitting(false);
        return false;
      }
      props.onSuccess?.();
      close();
      return true;
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function putPlacement(placementId: string, payload: Record<string, unknown>) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/placements/${placementId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to update placement");
        setSubmitting(false);
        return false;
      }
      props.onSuccess?.();
      close();
      return true;
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  // "Skip / Complete later" — create a near-empty placement so the
  // submission flips to Placed and the row exists for follow-up editing.
  async function handleSkip() {
    if (props.mode !== "congrats") return;
    setSkipping(true);
    await postPlacement({ submissionId: props.submissionId });
    setSkipping(false);
  }

  async function handleSubmitForm() {
    // Resolve fee depending on feeType.
    // PERCENTAGE: store the % in feePercentage, compute the real $ from
    //   the candidate's ANNUAL salary × % / 100 and store it in
    //   feeAmount. When salaryPeriod=MONTHLY we multiply by 12 first
    //   (this is the common LATAM convention — salaries quoted monthly,
    //   recruiting fees calculated against the annual).
    // FLAT: feeAmount is the input directly; feePercentage stays null.
    const feeInputNum = feeInput ? Number(feeInput) : null;
    const salaryNum = agreedSalary ? Number(agreedSalary) : null;
    const annualSalary =
      salaryNum != null
        ? salaryPeriod === "MONTHLY"
          ? salaryNum * 12
          : salaryNum
        : null;
    let resolvedFeeAmount: number | null = null;
    let resolvedFeePercentage: number | null = null;
    if (feeInputNum != null) {
      if (feeType === "PERCENTAGE") {
        resolvedFeePercentage = feeInputNum;
        resolvedFeeAmount = annualSalary != null ? (annualSalary * feeInputNum) / 100 : null;
      } else {
        resolvedFeeAmount = feeInputNum;
      }
    }

    const payload: Record<string, unknown> = {
      estimatedStartDate: estimatedStartDate || null,
      salary: salaryNum,
      currency: currency || "USD",
      salaryPeriod,
      feeAmount: resolvedFeeAmount,
      feePercentage: resolvedFeePercentage,
      paymentTerms: paymentTerms === "" ? null : Number(paymentTerms),
      paymentDueDate: paymentDueDate || null,
      guaranteePeriod: guaranteePeriod === "" ? 90 : Number(guaranteePeriod),
      notes: notes || null,
    };

    if (props.mode === "congrats") {
      payload.submissionId = props.submissionId;
      await postPlacement(payload);
      return;
    }

    if (props.mode === "edit") {
      // Edit can additionally touch actual startDate and invoiceStatus —
      // fields that don't make sense on create.
      payload.startDate = startDate || null;
      payload.invoiceStatus = invoiceStatus;
      await putPlacement(props.placementId, payload);
      return;
    }

    // Manual create
    const job = props.jobOptions.find((j) => j.id === selectedJobId);
    if (!job) {
      setError("Pick a job first");
      return;
    }
    payload.jobId = job.id;
    payload.clientId = job.clientId;
    await postPlacement(payload);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCongrats && step === "intro" ? (
              <>
                <PartyPopper className="h-5 w-5 text-emerald-600" />
                Congratulations!
              </>
            ) : isCongrats ? (
              <>Placement details</>
            ) : isEdit ? (
              <>Edit placement</>
            ) : (
              <>New placement</>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1 — congrats intro */}
        {isCongrats && step === "intro" && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm text-emerald-900 space-y-2">
              <p className="font-medium">
                {props.candidateName} placed on {props.jobTitle}
                {props.clientName ? ` at ${props.clientName}` : ""}.
              </p>
              <p className="text-emerald-800 text-xs">
                As a next step, please complete the placement info — agreed salary,
                start date, payment terms — so the placement record matches the deal.
                You can fill it in now or later.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-xs p-2 rounded">{error}</div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleSkip}
                disabled={submitting || skipping}
              >
                {skipping ? "Saving..." : "Skip / Complete later"}
              </Button>
              <Button
                onClick={() => setStep("form")}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              >
                Fill placement form
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — form (also entry point for manual / edit modes) */}
        {(step === "form" || !isCongrats) && (
          <div className="space-y-4">
            {props.mode === "manual" && (
              <div className="space-y-2">
                <Label className="text-xs">Job</Label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <option value="">Select a job…</option>
                  {props.jobOptions.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.clientName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(isCongrats || isEdit) && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 flex items-center gap-3">
                <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="font-medium text-gray-900 truncate">{props.candidateName}</span>
                <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="truncate">{props.jobTitle}{props.clientName ? ` · ${props.clientName}` : ""}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="placement-est-start">Estimated start</Label>
                <Input
                  id="placement-est-start"
                  type="date"
                  value={estimatedStartDate}
                  onChange={(e) => setEstimatedStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <CurrencyPicker
                  compact
                  value={currency}
                  onChange={setCurrency}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="placement-salary">Agreed salary</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                    {getCurrency(currency)?.symbol || "$"}
                  </span>
                  <Input
                    id="placement-salary"
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    className="pl-7"
                    value={agreedSalary}
                    onChange={(e) => setAgreedSalary(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex rounded-md border bg-white p-0.5">
                    {(["MONTHLY", "ANNUAL"] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSalaryPeriod(p)}
                        className={`px-2 py-1 text-[11px] font-medium rounded ${
                          salaryPeriod === p
                            ? "bg-indigo-600 text-white"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {p === "MONTHLY" ? "/mo" : "/yr"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 text-right">
                    Fee % uses annual{salaryPeriod === "MONTHLY" ? " (monthly × 12)" : ""}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fee</Label>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                      {feeType === "FLAT" ? (getCurrency(currency)?.symbol || "$") : "%"}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      className="pl-7"
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                    />
                  </div>
                  <select
                    value={feeType}
                    onChange={(e) => setFeeType(e.target.value as "PERCENTAGE" | "FLAT")}
                    className="h-10 px-2 rounded-md border border-gray-200 bg-white text-sm shrink-0"
                  >
                    <option value="PERCENTAGE">%</option>
                    <option value="FLAT">flat</option>
                  </select>
                </div>
                {feeType === "PERCENTAGE" && feeInput && (
                  agreedSalary ? (
                    (() => {
                      const monthly = Number(agreedSalary);
                      const annual = salaryPeriod === "MONTHLY" ? monthly * 12 : monthly;
                      const fee = (annual * Number(feeInput)) / 100;
                      return (
                        <p className="text-[10px] text-gray-500">
                          = {formatCurrencyValue(fee, currency)}{" "}
                          of {formatCurrencyValue(annual, currency)} annual
                          {salaryPeriod === "MONTHLY" && (
                            <span className="text-gray-400">
                              {" "}({formatCurrencyValue(monthly, currency)} × 12)
                            </span>
                          )}
                        </p>
                      );
                    })()
                  ) : (
                    <p className="text-[10px] text-amber-600">
                      Fill the agreed salary to see the resolved fee amount.
                    </p>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="placement-terms">Payment terms (days)</Label>
                <Input
                  id="placement-terms"
                  type="number"
                  inputMode="numeric"
                  placeholder="30"
                  value={paymentTerms}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPaymentTerms(v === "" ? "" : Number(v));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="placement-guarantee">Guarantee (days)</Label>
                <Input
                  id="placement-guarantee"
                  type="number"
                  inputMode="numeric"
                  placeholder="90"
                  value={guaranteePeriod}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGuaranteePeriod(v === "" ? "" : Number(v));
                  }}
                />
                {guaranteeExpiryPreview ? (
                  <p className="text-[10px] text-gray-400">
                    Expires {guaranteeExpiryPreview}
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400">
                    Expiry shows once start date is filled.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="placement-due">Payment due</Label>
              <Input
                id="placement-due"
                type="date"
                value={paymentDueDate}
                onChange={(e) => {
                  setPaymentDueDate(e.target.value);
                  setPaymentDueDateTouched(true);
                }}
              />
              <p className="text-[10px] text-gray-400">
                Auto: actual start (if set) or estimated start + payment terms. Editable.
              </p>
            </div>

            {isEdit && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="placement-actual-start">Actual start date</Label>
                  <Input
                    id="placement-actual-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400">
                    Fill when the candidate has actually started. Anchors the guarantee.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="placement-invoice-status">Invoice status</Label>
                  <select
                    id="placement-invoice-status"
                    value={invoiceStatus}
                    onChange={(e) =>
                      setInvoiceStatus(e.target.value as "DRAFT" | "SENT" | "PAID")
                    }
                    className="w-full h-10 px-3 rounded-md border border-gray-200 bg-white text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="SENT">Sent</option>
                    <option value="PAID">Paid</option>
                  </select>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="placement-notes">Notes (optional)</Label>
              <Textarea
                id="placement-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-xs p-2 rounded">{error}</div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={isCongrats ? () => setStep("intro") : close}
                disabled={submitting}
              >
                {isCongrats ? "Back" : "Cancel"}
              </Button>
              <Button
                onClick={handleSubmitForm}
                disabled={submitting || (props.mode === "manual" && !selectedJobId)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {submitting ? "Saving..." : isEdit ? "Save changes" : "Save placement"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
