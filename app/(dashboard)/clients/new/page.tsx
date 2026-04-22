"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, ExternalLink } from "lucide-react";
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

  const [formValues, setFormValues] = useState({
    name: prefillName,
    industry: "",
    website: "",
    notes: "",
    defaultCurrency: "USD",
    defaultFeeAmount: "",
  });

  function updateField(field: string, value: string) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
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
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formValues.name,
        industry: formValues.industry,
        website: formValues.website,
        notes: formValues.notes,
        defaultCurrency: formValues.defaultCurrency || "USD",
        defaultFeeType,
        defaultFeeAmount: formValues.defaultFeeAmount
          ? Number(formValues.defaultFeeAmount)
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

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                name="name"
                required
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
                <Input
                  name="industry"
                  placeholder="Technology, Finance, etc."
                  value={formValues.industry}
                  onChange={(e) => updateField("industry", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  name="website"
                  placeholder="https://"
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

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Default Fee Terms</h3>
              <p className="text-xs text-gray-400 mb-3">These terms will auto-fill when creating a Job Order for this client.</p>
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
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                      {defaultFeeType === "FLAT" ? "$" : "%"}
                    </span>
                    <Input
                      name="defaultFeeAmount"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 15"
                      className="pl-7"
                      value={formValues.defaultFeeAmount}
                      onChange={(e) => updateField("defaultFeeAmount", e.target.value)}
                    />
                  </div>
                </div>
              </div>
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
