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
import { PartyPopper, ArrowRight, Building2, User, X, Search, ChevronDown } from "lucide-react";
import { CurrencyPicker, getCurrency, formatCurrencyValue } from "@/components/ui/currency-picker";
import { AR_NET_TO_GROSS, SALARY_KIND_CURRENCIES } from "@/lib/constants";

// Defaults that pre-fill the form. Anything we know from the candidate /
// job / client gets surfaced; the recruiter can still override.
type SalaryPeriod = "MONTHLY" | "ANNUAL";
type SalaryKind = "BRUTO" | "NETO";

type FormDefaults = {
  estimatedStartDate?: string; // ISO yyyy-mm-dd
  agreedSalary?: string;
  currency?: string; // ISO 4217 code, e.g. USD / ARS
  salaryPeriod?: SalaryPeriod;
  salaryKind?: SalaryKind;
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
    salaryKind?: SalaryKind | null;
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
// the server does on save. Uses UTC-only date math — local getDate /
// setDate flip the date back one day in timezones west of UTC, which
// previously surfaced as "I typed May 21 and the preview / saved value
// said May 20".
function previewFromAnchor(
  actualStart: string,
  estimatedStart: string,
  days: number | "",
): string {
  const anchorStr = actualStart || estimatedStart;
  if (!anchorStr || days === "" || isNaN(Number(days))) return "";
  const anchor = new Date(anchorStr + "T00:00:00.000Z");
  if (isNaN(anchor.getTime())) return "";
  anchor.setUTCDate(anchor.getUTCDate() + Number(days));
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
  // Gross vs net interpretation of the salary input. Only surfaced
  // for AR (and any future market in SALARY_KIND_CURRENCIES); other
  // markets always store BRUTO so US-flow users don't see a knob
  // that doesn't apply.
  const [salaryKind, setSalaryKind] = useState<SalaryKind>("BRUTO");
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

  // Manual-mode candidate picker. The recruiter has to choose an
  // existing candidate — if there are none, the empty state in the
  // dropdown nudges them to /candidates/new instead of letting them
  // submit an orphan placement.
  type CandidateOption = {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    currentTitle: string | null;
    currentCompany: string | null;
  };
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState<CandidateOption[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateOption | null>(null);
  const [candidateDropdownOpen, setCandidateDropdownOpen] = useState(false);
  const [searchingCandidates, setSearchingCandidates] = useState(false);

  // Resolve which "defaults" object to apply. Manual mode picks defaults off
  // the selected job; congrats mode uses the static defaults the caller passed.
  // Edit mode bypasses this entirely and hydrates from props.initial below.
  // IMPORTANT: deps deliberately don't include `props` (the whole object,
  // which is a new reference on every parent render). Including it caused
  // the hydration useEffect below to re-run on every parent re-render
  // (e.g. when exchange rates resolved in /placements/page.tsx),
  // wiping the user's in-flight form edits. Closure-captured props is
  // fine here because the parent doesn't reshape the props mid-edit.
  const activeDefaults: FormDefaults | undefined = useMemo(() => {
    if (isEdit) return undefined;
    if (isCongrats) return props.defaults;
    if (!selectedJobId) return undefined;
    const job = props.mode === "manual"
      ? props.jobOptions.find((j) => j.id === selectedJobId)
      : undefined;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCongrats, isEdit, selectedJobId]);

  // Hydrate the form whenever the dialog opens. Edit mode pulls from
  // props.initial (the existing placement record); the other two modes
  // pull from activeDefaults.
  useEffect(() => {
    if (!props.open) return;
    if (isEdit) {
      const i = props.initial;
      // Defensively coerce dates to YYYY-MM-DD strings — Prisma usually
      // serializes DateTime as ISO strings via fetch().json(), but if a
      // caller ever hands us a Date object directly we don't want
      // slice() to blow up and silently leave the date empty.
      const isoDate = (v: string | Date | null | undefined): string => {
        if (!v) return "";
        if (typeof v === "string") return v.slice(0, 10);
        try {
          return v.toISOString().slice(0, 10);
        } catch {
          return "";
        }
      };
      setEstimatedStartDate(isoDate(i.estimatedStartDate));
      setStartDate(isoDate(i.startDate));
      setAgreedSalary(i.agreedSalary != null ? String(i.agreedSalary) : "");
      const editCurrency = i.currency || "USD";
      setCurrency(editCurrency);
      setSalaryPeriod(i.salaryPeriod || defaultSalaryPeriod(editCurrency));
      setSalaryKind((i.salaryKind as SalaryKind) || "BRUTO");
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
      // Default to 30 (same as manual / congrats modes) when the
      // placement was created without payment terms — keeps the live
      // preview of Payment due working out of the box instead of
      // sitting blank because the multiplier is missing.
      const resolvedTerms = i.paymentTerms ?? 30;
      setPaymentTerms(resolvedTerms);
      const initialDue = isoDate(i.paymentDueDate);
      // Hydrate Payment due directly here: use the saved value if there
      // is one, otherwise compute it inline from the start + terms.
      // Setting it in the hydration step avoids effect-ordering races
      // that were leaving the field empty on edit-open even when start
      // and terms were present.
      const computedDue = initialDue
        || previewFromAnchor(isoDate(i.startDate), isoDate(i.estimatedStartDate), resolvedTerms);
      setPaymentDueDate(computedDue);
      // Manual override flag mirrors whether the placement was saved
      // with a paymentDueDate. A saved value sticks; computed-from-
      // anchors gets re-computed on start/terms edits.
      setPaymentDueDateTouched(Boolean(initialDue));
      setGuaranteePeriod(i.guaranteePeriod ?? 90);
      setNotes(i.notes || "");
      setInvoiceStatus(i.invoiceStatus || "DRAFT");
    } else {
      const initEst = activeDefaults?.estimatedStartDate || todayIso();
      const initTerms = activeDefaults?.paymentTerms ?? 30;
      setEstimatedStartDate(initEst);
      setStartDate("");
      setAgreedSalary(activeDefaults?.agreedSalary || "");
      const newCurrency = activeDefaults?.currency || "USD";
      setCurrency(newCurrency);
      setSalaryPeriod(activeDefaults?.salaryPeriod || defaultSalaryPeriod(newCurrency));
      setSalaryKind(activeDefaults?.salaryKind || "BRUTO");
      // activeDefaults.feeAmount semantically follows feeType — for
      // Recruiting it's the agreed %, for Staff Aug (FLAT jobs) it's
      // the agreed flat fee. We just bind it to the single input.
      setFeeInput(activeDefaults?.feeAmount || "");
      setFeeType(activeDefaults?.feeType || "PERCENTAGE");
      setPaymentTerms(initTerms);
      setGuaranteePeriod(activeDefaults?.guaranteePeriod ?? 90);
      setNotes(activeDefaults?.notes || "");
      setInvoiceStatus("DRAFT");
      // Belt-and-suspenders: don't rely on the live-recompute effect to
      // populate the due date on first open — set it explicitly from the
      // same anchor + terms the user is seeing.
      setPaymentDueDate(previewFromAnchor("", initEst, initTerms));
      setPaymentDueDateTouched(false);
    }
    setError("");
    setStep(isCongrats ? "intro" : "form");
    // IMPORTANT: `props` is deliberately NOT in the deps. The parent
    // recreates the props object on every render (most commonly when
    // /placements/page.tsx's usdRates state resolves async), and
    // including the full props here was causing this useEffect to fire
    // on every parent render — re-hydrating the form and wiping the
    // user's in-flight edits. We use closure-captured props.initial /
    // props.defaults, which are correct as long as the parent doesn't
    // swap out the placement being edited mid-dialog (it doesn't).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDefaults, isCongrats, isEdit, props.open]);

  // Reset the job picker ONLY when the dialog transitions to open.
  // Lives in its own effect so picking a job (which mutates
  // activeDefaults via the useMemo above) doesn't trip the main
  // hydration effect into clearing the just-selected job — that was
  // why "select a job" snapped back to blank.
  useEffect(() => {
    if (props.mode === "manual" && props.open) {
      setSelectedJobId("");
    }
  }, [props.open, props.mode]);

  // No live-preview useEffect for paymentDueDate — it caused a race
  // condition with the hydration step on dialog open (the effect
  // captured stale initial state and overwrote the hydrated computed
  // value with ""). Instead, paymentDueDate is computed inline in
  // hydration AND in each source input's onChange handler. Touched
  // flag still gates manual overrides, but it's set/reset
  // explicitly at those touch points.

  // Candidate search (manual mode only). Two trigger paths:
  //   - typing → debounced search, fires after 250 ms.
  //   - job selected with empty search → preload the whole list of
  //     candidates on that job so the chevron-open shows the roster
  //     without forcing the recruiter to type something first.
  useEffect(() => {
    if (props.mode !== "manual") return;
    if (!props.open) return;
    const hasSearch = candidateSearch.trim().length > 0;
    // Nothing to fetch — no job context AND no search text. Keep the
    // dropdown closed and bail.
    if (!hasSearch && !selectedJobId) {
      setCandidateResults([]);
      setCandidateDropdownOpen(false);
      return;
    }
    setSearchingCandidates(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          // Bigger list when we're scoping to a job, since the
          // recruiter expects to see the full roster, not paginate.
          limit: selectedJobId ? "50" : "8",
          mine: "false",
        });
        if (hasSearch) params.set("search", candidateSearch);
        if (selectedJobId) params.set("jobId", selectedJobId);
        const res = await fetch(`/api/candidates?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const list = (data.candidates || []) as CandidateOption[];
          setCandidateResults(list);
        }
      } catch {
        // ignore — recruiter will see "No matches" and the new-candidate link
      } finally {
        setSearchingCandidates(false);
      }
    }, hasSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [candidateSearch, props.mode, props.open, selectedJobId]);

  // When the user picks a candidate without a job already selected, we
  // peek at the candidate's active submissions:
  //   - 1 job        → auto-select that job, set the candidate, done.
  //   - 2+ jobs      → stash in pendingJobChoice so the UI can render
  //                    an inline "which one of these jobs?" picker.
  //   - 0 jobs       → just set the candidate; user picks from the Job
  //                    dropdown above; server will create a submission
  //                    server-side once they save.
  type PendingJobChoice = {
    candidate: CandidateOption;
    submissions: Array<{
      id: string;
      jobId: string;
      jobTitle: string;
      clientName: string;
    }>;
  };
  const [pendingJobChoice, setPendingJobChoice] = useState<PendingJobChoice | null>(null);

  async function pickCandidate(c: CandidateOption) {
    setCandidateDropdownOpen(false);
    setCandidateSearch("");

    // Job already known — accept the candidate as-is. The search already
    // filtered to candidates on that job, so we trust this.
    if (selectedJobId) {
      setSelectedCandidate(c);
      return;
    }

    // No job yet — fetch the candidate to see their active submissions.
    try {
      const res = await fetch(`/api/candidates/${c.id}`);
      if (!res.ok) {
        // Fallback: just set the candidate; user can pick a job manually.
        setSelectedCandidate(c);
        return;
      }
      const full = await res.json();
      // Surface only submissions whose job is in the dialog's jobOptions
      // (these are open, non-closed jobs — same set the Job dropdown
      // offers). Avoids steering the recruiter at a closed search.
      const knownJobIds = new Set(props.mode === "manual" ? props.jobOptions.map((j) => j.id) : []);
      const subs: PendingJobChoice["submissions"] = (full.submissions || [])
        .filter((s: any) => knownJobIds.has(s.job?.id))
        .map((s: any) => ({
          id: s.id,
          jobId: s.job.id,
          jobTitle: s.job.title,
          clientName: s.job.client?.name || "",
        }));

      if (subs.length === 1) {
        setSelectedJobId(subs[0].jobId);
        setSelectedCandidate(c);
      } else if (subs.length >= 2) {
        setPendingJobChoice({ candidate: c, submissions: subs });
      } else {
        // No active submissions — accept candidate, user picks job.
        setSelectedCandidate(c);
      }
    } catch {
      setSelectedCandidate(c);
    }
  }

  // Reset candidate picker when the dialog opens fresh.
  useEffect(() => {
    if (!props.open) return;
    if (props.mode === "manual") {
      setSelectedCandidate(null);
      setCandidateSearch("");
      setCandidateResults([]);
      setCandidateDropdownOpen(false);
    }
  }, [props.open, props.mode]);

  // Live preview of when the guarantee expires. Read-only — server
  // computes the persisted value on save with the same logic.
  const guaranteeExpiryPreview = previewFromAnchor(startDate, estimatedStartDate, guaranteePeriod);

  function close() {
    props.onOpenChange(false);
  }

  async function handleDeletePlacement() {
    if (props.mode !== "edit") return;
    if (
      !confirm(
        "Delete this placement? The candidate will move back to the previous stage on the pipeline. This cannot be undone."
      )
    )
      return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/placements/${props.placementId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete placement");
        setSubmitting(false);
        return;
      }
      props.onSuccess?.();
      close();
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
    }
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
    // Fees are calculated against the GROSS annual salary. When the
    // recruiter recorded a net (Neto) figure for AR, normalise back
    // to gross via the AR payroll ratio before applying the
    // percentage. The salary stored on the placement keeps the
    // original entered value + salaryKind so the row reads back the
    // way the recruiter typed it.
    const grossForFee =
      annualSalary != null && salaryKind === "NETO"
        ? annualSalary * AR_NET_TO_GROSS
        : annualSalary;
    let resolvedFeeAmount: number | null = null;
    let resolvedFeePercentage: number | null = null;
    if (feeInputNum != null) {
      if (feeType === "PERCENTAGE") {
        resolvedFeePercentage = feeInputNum;
        resolvedFeeAmount = grossForFee != null ? (grossForFee * feeInputNum) / 100 : null;
      } else {
        resolvedFeeAmount = feeInputNum;
      }
    }

    const payload: Record<string, unknown> = {
      estimatedStartDate: estimatedStartDate || null,
      salary: salaryNum,
      currency: currency || "USD",
      salaryPeriod,
      salaryKind,
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
    if (!selectedCandidate) {
      setError("Pick a candidate first");
      return;
    }
    payload.jobId = job.id;
    payload.clientId = job.clientId;
    payload.candidateId = selectedCandidate.id;
    await postPlacement(payload);
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
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
              <>
                <div className="space-y-2">
                  <Label className="text-xs">Job</Label>
                  <select
                    value={selectedJobId}
                    onChange={(e) => {
                      const newJobId = e.target.value;
                      setSelectedJobId(newJobId);
                      // Clear candidate selection / pending picker — the new
                      // job's submission list might not include the candidate
                      // we had selected. Recruiter re-picks from the now-
                      // narrowed list.
                      if (newJobId !== selectedJobId) {
                        setSelectedCandidate(null);
                        setPendingJobChoice(null);
                        setCandidateSearch("");
                        setCandidateResults([]);
                      }
                    }}
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
                <div className="space-y-2">
                  <Label className="text-xs">Candidate</Label>
                  {pendingJobChoice ? (
                    <div className="border border-amber-200 bg-amber-50 rounded-md p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {pendingJobChoice.candidate.firstName} {pendingJobChoice.candidate.lastName}
                          </p>
                          <p className="text-[11px] text-amber-700">
                            On {pendingJobChoice.submissions.length} active jobs. Pick the one this placement is for:
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingJobChoice(null)}
                          className="text-gray-400 hover:text-red-500 p-1"
                          aria-label="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {pendingJobChoice.submissions.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedJobId(s.jobId);
                              setSelectedCandidate(pendingJobChoice.candidate);
                              setPendingJobChoice(null);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-xs"
                          >
                            <span className="font-medium text-gray-900">{s.jobTitle}</span>
                            {s.clientName && (
                              <span className="text-gray-500"> · {s.clientName}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : selectedCandidate ? (
                    <div className="flex items-center justify-between gap-2 p-2.5 bg-indigo-50 border border-indigo-100 rounded-md">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {selectedCandidate.firstName} {selectedCandidate.lastName}
                        </p>
                        {(selectedCandidate.currentTitle || selectedCandidate.currentCompany) && (
                          <p className="text-[11px] text-gray-500 truncate">
                            {[selectedCandidate.currentTitle, selectedCandidate.currentCompany]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCandidate(null)}
                        className="text-gray-400 hover:text-red-500 p-1"
                        aria-label="Clear candidate"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                      <Input
                        placeholder={
                          selectedJobId
                            ? "Search or click to see all on this job…"
                            : "Search by name, email, or company…"
                        }
                        value={candidateSearch}
                        onChange={(e) => {
                          setCandidateSearch(e.target.value);
                          setCandidateDropdownOpen(true);
                        }}
                        onFocus={() => {
                          if (candidateResults.length > 0 || selectedJobId) {
                            setCandidateDropdownOpen(true);
                          }
                        }}
                        className={`text-sm pl-9 ${selectedJobId ? "pr-9" : ""}`}
                      />
                      {selectedJobId && (
                        <button
                          type="button"
                          onClick={() => setCandidateDropdownOpen((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
                          aria-label="Toggle candidate list"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${candidateDropdownOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                      {candidateDropdownOpen && (
                        <>
                          {/* Click-outside scrim closes the dropdown without
                              swallowing focus from the input itself. */}
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setCandidateDropdownOpen(false)}
                          />
                          <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                          {candidateResults.length === 0 && !searchingCandidates ? (
                            <div className="px-3 py-3 text-center">
                              <p className="text-xs text-gray-500">
                                {candidateSearch
                                  ? `No candidates match "${candidateSearch}".`
                                  : "No candidates on this job yet."}
                              </p>
                              <a
                                href="/candidates/new"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline"
                              >
                                Add a new candidate
                              </a>
                            </div>
                          ) : (
                            candidateResults.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => { void pickCandidate(c); }}
                                className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b last:border-b-0"
                              >
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {c.firstName} {c.lastName}
                                </p>
                                {(c.currentTitle || c.currentCompany || c.email) && (
                                  <p className="text-[11px] text-gray-500 truncate">
                                    {[c.currentTitle, c.currentCompany, c.email]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                )}
                              </button>
                            ))
                          )}
                          </div>
                        </>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">
                        Don&apos;t see them?{" "}
                        <a
                          href="/candidates/new"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          Add a new candidate
                        </a>{" "}
                        and come back.
                      </p>
                    </div>
                  )}
                </div>
              </>
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
                  onChange={(e) => {
                    const v = e.target.value;
                    setEstimatedStartDate(v);
                    setPaymentDueDateTouched(false);
                    // Inline recompute: avoids the race the useEffect-based
                    // version had on first render, and keeps the field
                    // visibly in sync with whatever the user just typed.
                    setPaymentDueDate(previewFromAnchor(startDate, v, paymentTerms));
                  }}
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
                    {salaryKind === "NETO" ? " · grossed up" : ""}
                  </p>
                </div>
                {SALARY_KIND_CURRENCIES.has(currency) && (
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border bg-white p-0.5">
                      {(["BRUTO", "NETO"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSalaryKind(k)}
                          className={`px-2 py-1 text-[11px] font-medium rounded ${
                            salaryKind === k
                              ? "bg-indigo-600 text-white"
                              : "text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {k === "BRUTO" ? "Bruto" : "Neto"}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400">
                      {salaryKind === "NETO"
                        ? "Take-home — fee uses gross (÷ 0.83)"
                        : "Gross — fee uses this figure directly"}
                    </p>
                  </div>
                )}
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
              </div>
            </div>

            {/* Fee calc preview — full-width below the salary + fee row so
                long numbers (e.g. ARS multipliers) don't bust the grid
                column they used to live inside. */}
            {feeType === "PERCENTAGE" && feeInput && (
              agreedSalary ? (
                (() => {
                  const monthly = Number(agreedSalary);
                  const annual = salaryPeriod === "MONTHLY" ? monthly * 12 : monthly;
                  const gross = salaryKind === "NETO" ? annual * AR_NET_TO_GROSS : annual;
                  const fee = (gross * Number(feeInput)) / 100;
                  return (
                    <p className="text-[10px] text-gray-500 -mt-2">
                      Fee = {formatCurrencyValue(fee, currency)}{" "}
                      <span className="text-gray-400">
                        ({Number(feeInput)}% of {formatCurrencyValue(gross, currency)} annual
                        {salaryPeriod === "MONTHLY" &&
                          ` · ${formatCurrencyValue(monthly, currency)} × 12`}
                        {salaryKind === "NETO" && " · grossed up from neto"}
                        )
                      </span>
                    </p>
                  );
                })()
              ) : (
                <p className="text-[10px] text-amber-600 -mt-2">
                  Fill the agreed salary to see the resolved fee amount.
                </p>
              )
            )}

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
                    const newTerms = v === "" ? "" : Number(v);
                    setPaymentTerms(newTerms);
                    setPaymentDueDateTouched(false);
                    setPaymentDueDate(previewFromAnchor(startDate, estimatedStartDate, newTerms));
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
                  const v = e.target.value;
                  setPaymentDueDate(v);
                  // Clearing the field reverts to auto-mode so the next
                  // edit to start / terms recomputes it. Only mark
                  // "touched" when the user actually picked a date.
                  setPaymentDueDateTouched(v !== "");
                }}
              />
              <p className="text-[10px] text-gray-400">
                Auto: actual start (if set) or estimated start + payment terms. Editable.
              </p>
            </div>

            {isEdit && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="placement-actual-start">Starting date</Label>
                  <Input
                    id="placement-actual-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartDate(v);
                      setPaymentDueDateTouched(false);
                      setPaymentDueDate(previewFromAnchor(v, estimatedStartDate, paymentTerms));
                    }}
                  />
                  <p className="text-[10px] text-gray-400">
                    Fill once the candidate starts. Anchors the guarantee.
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

            <div className="flex items-center justify-between gap-2">
              {isEdit ? (
                <Button
                  variant="ghost"
                  onClick={handleDeletePlacement}
                  disabled={submitting}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  Delete placement
                </Button>
              ) : (
                <span />
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
                  disabled={submitting || (props.mode === "manual" && (!selectedJobId || !selectedCandidate))}
                  className="bg-emerald-600 hover:bg-emerald-700"
              >
                {submitting ? "Saving..." : isEdit ? "Save changes" : "Save placement"}
              </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
