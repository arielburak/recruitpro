"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/ui/money-input";
import { INDUSTRY_OPTIONS } from "@/lib/constants";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, ExternalLink, Upload, FileText, X, Paperclip, Target, UsersRound, Check } from "lucide-react";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import Link from "next/link";

// Whitelist of in-app paths we accept as a `returnTo` target. Stops anyone
// from rigging a link that bounces the user to an external site after
// creating a client.
const RETURN_TO_ALLOWLIST = ["/jobs/new"];

type DuplicateMatch = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  contactName: string | null;
  // contactEmail/contactPhone are still returned by the check-duplicate
  // API for legacy clients, but the new Create Client form no longer
  // surfaces those fields — contacts are managed in the dedicated
  // Contacts section where you pick the primary one.
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
};

function websiteHost(value: string): string {
  if (!value) return "";
  const trimmed = value.trim().toLowerCase();
  const withoutScheme = trimmed.replace(/^https?:\/\//, "");
  const withoutWww = withoutScheme.replace(/^www\./, "");
  return withoutWww.split("/")[0].replace(/[.,;]+$/, "");
}

function NewClientContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToParam = searchParams.get("returnTo");
  const returnTo = returnToParam && RETURN_TO_ALLOWLIST.includes(returnToParam) ? returnToParam : null;
  const prefillName = searchParams.get("name") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [defaultFeeType, setDefaultFeeType] = useState("PERCENTAGE");
  // How this client is engaged. "RECRUITING" = traditional headhunting
  // (fee terms live on the client, auto-fill per search). "STAFF_AUG" =
  // outsourcing / per-search economics — we hide the Default Fee Terms
  // section entirely, every Job for this client fills fee separately.
  const [engagementType, setEngagementType] = useState<"RECRUITING" | "STAFF_AUG">("RECRUITING");

  const [formValues, setFormValues] = useState({
    name: prefillName,
    industry: "",
    website: "",
    notes: "",
    defaultCurrency: "USD",
    defaultFeeAmount: "",
    defaultPaymentTerms: "30",
    defaultGuaranteePeriod: "90",
  });
  // Attachments staged before the client exists. We can't upload until
  // we have a clientId from the POST response, so they live in memory
  // here and we flush them right after creation.
  const [attachments, setAttachments] = useState<File[]>([]);

  function updateField(field: string, value: string) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  function addAttachments(files: FileList | null) {
    if (!files) return;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    const next: File[] = [];
    for (const f of Array.from(files)) {
      if (f.size === 0) continue;
      if (f.size > MAX_FILE_SIZE) continue;
      next.push(f);
    }
    if (next.length === 0) return;
    setAttachments((prev) => [...prev, ...next]);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  /**
   * For a given match, return which of the form's identifiers actually
   * collided — so the UI can show "matched by website" next to the name
   * and highlight just the offending fields.
   */
  function getMatchedChannels(m: DuplicateMatch): string[] {
    const channels: string[] = [];
    const formName = formValues.name.trim().toLowerCase();
    if (formName && m.name.toLowerCase() === formName) channels.push("name");
    const formHost = websiteHost(formValues.website);
    if (formHost && m.website && websiteHost(m.website) === formHost) {
      channels.push("website");
    }
    return channels;
  }

  const flaggedFields = new Set<string>();
  for (const m of duplicateMatches) {
    for (const c of getMatchedChannels(m)) flaggedFields.add(c);
  }

  async function checkDuplicates(override?: {
    name?: string;
    website?: string;
  }): Promise<DuplicateMatch[]> {
    const name = (override?.name ?? formValues.name).trim();
    const website = (override?.website ?? formValues.website).trim();
    if (!name && !website) {
      setDuplicateMatches([]);
      return [];
    }
    setCheckingDuplicate(true);
    try {
      const qs = new URLSearchParams();
      if (name) qs.set("name", name);
      if (website) qs.set("website", website);
      const res = await fetch(`/api/clients/check-duplicate?${qs.toString()}`);
      if (!res.ok) {
        setDuplicateMatches([]);
        return [];
      }
      const data = await res.json();
      const matches: DuplicateMatch[] = data.matches || [];
      setDuplicateMatches(matches);
      return matches;
    } catch {
      setDuplicateMatches([]);
      return [];
    } finally {
      setCheckingDuplicate(false);
    }
  }

  async function actuallyCreate() {
    setLoading(true);
    setError("");
    // For STAFF_AUG clients every search negotiates its own economics,
    // so the client-level fee defaults aren't meaningful. We send null/
    // unset values to keep the row clean.
    const isRecruiting = engagementType === "RECRUITING";
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formValues.name,
        industry: formValues.industry,
        website: formValues.website,
        notes: formValues.notes,
        engagementType,
        defaultCurrency: isRecruiting ? (formValues.defaultCurrency || "USD") : null,
        defaultFeeType: isRecruiting ? defaultFeeType : null,
        defaultFeeAmount:
          isRecruiting && formValues.defaultFeeAmount
            ? Number(formValues.defaultFeeAmount)
            : null,
        defaultPaymentTerms:
          isRecruiting && formValues.defaultPaymentTerms
            ? Number(formValues.defaultPaymentTerms)
            : null,
        defaultGuaranteePeriod:
          isRecruiting && formValues.defaultGuaranteePeriod
            ? Number(formValues.defaultGuaranteePeriod)
            : null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to create client");
      setLoading(false);
      return;
    }

    const client = await res.json();

    // Flush any staged attachments. Upload failures are logged but
    // shouldn't block the creation flow — the client already exists
    // and the user can re-upload from the detail page.
    if (attachments.length > 0) {
      await Promise.all(
        attachments.map(async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          try {
            await fetch(`/api/clients/${client.id}/documents`, {
              method: "POST",
              body: fd,
            });
          } catch (e) {
            console.error("[client create] attachment upload failed:", e);
          }
        })
      );
    }

    if (returnTo) {
      // Hand control back to the original flow (e.g. Job creation) with the
      // new client id so it can re-select and absorb the fee defaults.
      router.push(`${returnTo}?clientId=${client.id}`);
    } else {
      router.push(`/clients/${client.id}`);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const matches = await checkDuplicates();
    if (matches.length > 0) {
      setShowDuplicateDialog(true);
      return;
    }

    await actuallyCreate();
  }

  const backHref = returnTo || "/clients";
  const backLabel = returnTo === "/jobs/new" ? "Back to Job" : "Back";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backHref}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> {backLabel}
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Add Client</h1>
      </div>
      {returnTo === "/jobs/new" && (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-700">
          You&apos;re creating this client as part of a Job. Once you save, you&apos;ll be sent back to the Job form with this client selected and its fee defaults applied.
        </div>
      )}

      {/* autoComplete="off" on the form (and again on each text input
          below) tells the browser to stop offering its own history-
          based suggestions. The screenshots showed "Nicolas Cuello /
          Paul Rakovich / Merge IT" dropping into the Company Name
          input — those are Chrome remembering values from same-name
          inputs across other sites, not anything from the app. */}
      <form onSubmit={onSubmit} autoComplete="off">
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}

            {/* Engagement type picker — drives whether the rest of the
                form asks for fee defaults (RECRUITING) or skips them
                entirely (STAFF_AUG, every search negotiates its own). */}
            <div className="space-y-2">
              <Label>Engagement type</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {([
                  {
                    value: "RECRUITING" as const,
                    icon: Target,
                    title: "Headhunting / Recruiting",
                    desc: "Traditional contingent/retained search. You set default fee terms for this client and every search picks them up.",
                    tone: "indigo",
                  },
                  {
                    value: "STAFF_AUG" as const,
                    icon: UsersRound,
                    title: "Staff Augmentation / Outsourcing",
                    desc: "Every search negotiates its own economics. No defaults saved at the client level — you'll set fee + terms per search.",
                    tone: "emerald",
                  },
                ]).map((opt) => {
                  const selected = engagementType === opt.value;
                  const ring = opt.tone === "indigo"
                    ? "border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-100"
                    : "border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-100";
                  const iconBg = opt.tone === "indigo"
                    ? "bg-indigo-100 text-indigo-600"
                    : "bg-emerald-100 text-emerald-600";
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEngagementType(opt.value)}
                      className={`text-left rounded-xl border p-3.5 transition-all ${
                        selected ? ring : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                          <opt.icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className="text-sm font-semibold text-gray-900">{opt.title}</p>
                            {selected && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{opt.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                name="name"
                required
                autoComplete="off"
                value={formValues.name}
                className={
                  flaggedFields.has("name")
                    ? "border-indigo-400 ring-2 ring-indigo-100"
                    : ""
                }
                onChange={(e) => {
                  updateField("name", e.target.value);
                  if (duplicateMatches.length > 0) setDuplicateMatches([]);
                }}
                onBlur={(e) => void checkDuplicates({ name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Combobox
                  value={formValues.industry}
                  onChange={(v) => updateField("industry", v)}
                  options={INDUSTRY_OPTIONS}
                  placeholder="Technology, Finance, etc."
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  name="website"
                  placeholder="https://"
                  autoComplete="off"
                  value={formValues.website}
                  className={
                    flaggedFields.has("website")
                      ? "border-indigo-400 ring-2 ring-indigo-100"
                      : ""
                  }
                  onChange={(e) => {
                    updateField("website", e.target.value);
                    if (duplicateMatches.length > 0) setDuplicateMatches([]);
                  }}
                  onBlur={(e) => void checkDuplicates({ website: e.target.value })}
                />
              </div>
            </div>
            {/* Main contact is intentionally managed from the dedicated
                Contacts section on the client detail page. You add
                contacts there and mark one as Primary. Keeps the create
                form focused on company-level info. */}

            {checkingDuplicate && (
              <p className="text-xs text-gray-400">Checking for duplicates…</p>
            )}
            {duplicateMatches.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2 space-y-1">
                <div className="flex items-center gap-1.5 px-1.5 pt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  <span className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wider">
                    Already in your clients
                  </span>
                </div>
                {duplicateMatches.map((m) => {
                  const channels = getMatchedChannels(m);
                  return (
                    <Link
                      key={m.id}
                      href={`/clients/${m.id}`}
                      target="_blank"
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white hover:shadow-sm transition group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {m.name}
                          </p>
                          {channels.map((c) => (
                            <span
                              key={c}
                              className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded"
                            >
                              matched by {c}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {[m.industry, m.contactName, m.website].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-600 shrink-0 transition" />
                    </Link>
                  );
                })}
              </div>
            )}

            {engagementType === "RECRUITING" ? (
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Default Fee Terms</h3>
                <p className="text-xs text-gray-400 mb-3">These terms will auto-fill when creating a Job Order or Placement for this client.</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <CurrencyPicker
                      name="defaultCurrency"
                      defaultValue="USD"
                      value={formValues.defaultCurrency}
                      onChange={(c) => updateField("defaultCurrency", c)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fee Type</Label>
                    <select
                      name="defaultFeeType"
                      value={defaultFeeType}
                      onChange={(e) => setDefaultFeeType(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="PERCENTAGE">Percentage</option>
                      <option value="FLAT">Flat Fee</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fee Amount</Label>
                    <MoneyInput
                      prefix={defaultFeeType === "FLAT" ? "$" : "%"}
                      placeholder="e.g. 15"
                      value={formValues.defaultFeeAmount}
                      onChange={(v) => updateField("defaultFeeAmount", v)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-2">
                    <Label>Payment terms (days)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="30"
                      value={formValues.defaultPaymentTerms}
                      onChange={(e) => updateField("defaultPaymentTerms", e.target.value)}
                    />
                    <p className="text-[10px] text-gray-400">Days from start date to invoice due (Net 30 = 30).</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Guarantee period (days)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="90"
                      value={formValues.defaultGuaranteePeriod}
                      onChange={(e) => updateField("defaultGuaranteePeriod", e.target.value)}
                    />
                    <p className="text-[10px] text-gray-400">Replacement window after the candidate starts.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-t pt-4 mt-4">
                <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-3 text-xs text-emerald-800 leading-relaxed">
                  <p className="font-medium mb-1">No fee defaults on Staff Augmentation clients</p>
                  <p className="text-emerald-700">
                    You&apos;ll set the fee terms directly on each search when you create it. This keeps client-level terms blank when they don&apos;t apply across the whole relationship.
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                Attachments
              </Label>
              <p className="text-xs text-gray-400 -mt-0.5">
                MSA, fee schedule, NDAs, anything you want to pin on this client. Max 10MB each.
              </p>
              {attachments.length > 0 && (
                <div className="space-y-1.5">
                  {attachments.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{f.name}</p>
                          <p className="text-[11px] text-gray-400">{(f.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-5 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                <Upload className="h-5 w-5 text-gray-400 mb-1.5" />
                <span className="text-xs text-gray-500">
                  {attachments.length === 0 ? "Add files" : "Add more files"}
                </span>
                <span className="text-[11px] text-gray-400 mt-0.5">PDF, DOCX, XLSX, CSV, TXT, images</span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    addAttachments(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                name="notes"
                rows={3}
                value={formValues.notes}
                onChange={(e) => updateField("notes", e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Link href={backHref}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Client"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">This client may already exist</DialogTitle>
            <DialogDescription className="text-sm">
              Open the existing record to avoid duplicating your pipeline, or create a new one anyway.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-1.5 space-y-1 max-h-64 overflow-y-auto">
            {duplicateMatches.map((m) => {
              const channels = getMatchedChannels(m);
              return (
                <Link
                  key={m.id}
                  href={`/clients/${m.id}`}
                  target="_blank"
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-white hover:shadow-sm transition group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.name}
                      </p>
                      {channels.map((c) => (
                        <span
                          key={c}
                          className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded"
                        >
                          matched by {c}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {[m.industry, m.contactName, m.website].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-600 shrink-0 transition" />
                </Link>
              );
            })}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDuplicateDialog(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setShowDuplicateDialog(false);
                await actuallyCreate();
              }}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NewClientPage() {
  return (
    <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
      <NewClientContent />
    </Suspense>
  );
}
