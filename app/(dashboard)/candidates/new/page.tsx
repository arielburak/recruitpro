"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, X, Upload, FileText, Sparkles, ExternalLink } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { CurrencyPicker, getCurrency } from "@/components/ui/currency-picker";
import { SourceInput } from "@/components/ui/source-input";
import Link from "next/link";

export default function NewCandidatePageWrapper() {
  return (
    <Suspense fallback={<div className="animate-pulse h-96 bg-gray-100 rounded-lg" />}>
      <NewCandidatePage />
    </Suspense>
  );
}

function NewCandidatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

  // Resume parsing state
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState("");

  // Attachments state
  const [attachments, setAttachments] = useState<File[]>([]);

  // Duplicate candidate detection — matches any of email / phone / LinkedIn
  type DuplicateMatch = {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    linkedIn: string | null;
    currentTitle: string | null;
    currentCompany: string | null;
    createdAt: string;
    owner: { id: string; name: string } | null;
  };
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  /**
   * For a given match, figure out which of the form's identifiers
   * actually triggered it — so the recruiter can see *why* it's flagged
   * as a duplicate, not just that it is one.
   */
  function getMatchedChannels(m: DuplicateMatch): string[] {
    const channels: string[] = [];
    const formEmail = formValues.email.trim().toLowerCase();
    if (formEmail && m.email && m.email.toLowerCase() === formEmail) {
      channels.push("email");
    }
    const formPhoneDigits = formValues.phone.replace(/\D/g, "");
    const matchPhoneDigits = m.phone?.replace(/\D/g, "") || "";
    if (formPhoneDigits && formPhoneDigits === matchPhoneDigits) {
      channels.push("phone");
    }
    const extractHandle = (v: string) => {
      if (!v) return "";
      const match = v
        .trim()
        .toLowerCase()
        .match(/(?:linkedin\.com\/in\/|^\/?in\/)([a-z0-9\-_.]+)/i);
      return match ? match[1].replace(/\/$/, "") : "";
    };
    const formHandle = extractHandle(formValues.linkedIn);
    const matchHandle = extractHandle(m.linkedIn || "");
    if (formHandle && formHandle === matchHandle) {
      channels.push("LinkedIn");
    }
    return channels;
  }

  // Union of channels that triggered any visible match — used to
  // highlight the specific form fields that collided with an existing
  // candidate, so the recruiter sees at a glance which input to rethink.
  const flaggedFields = new Set<string>();
  for (const m of duplicateMatches) {
    for (const c of getMatchedChannels(m)) flaggedFields.add(c);
  }

  /**
   * Check for duplicates across all three identifiers the form captures.
   * The backend dedupes by candidate id, so a single person matching on
   * more than one channel still appears once.
   */
  async function checkDuplicates(override?: {
    email?: string;
    phone?: string;
    linkedIn?: string;
  }): Promise<DuplicateMatch[]> {
    const email = (override?.email ?? formValues.email).trim();
    const phone = (override?.phone ?? formValues.phone).trim();
    const linkedIn = (override?.linkedIn ?? formValues.linkedIn).trim();
    if (!email && !phone && !linkedIn) {
      setDuplicateMatches([]);
      return [];
    }
    setCheckingDuplicate(true);
    try {
      const qs = new URLSearchParams();
      if (email) qs.set("email", email);
      if (phone) qs.set("phone", phone);
      if (linkedIn) qs.set("linkedIn", linkedIn);
      const res = await fetch(`/api/candidates/check-duplicate?${qs.toString()}`);
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

  // Form field state for pre-filling
  const [formValues, setFormValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    linkedIn: "",
    location: "",
    currentTitle: "",
    currentCompany: "",
    currentSalary: "",
    desiredSalary: "",
    salaryCurrency: "USD",
    source: "",
    summary: "",
  });

  // Pre-fill from URL search params (LinkedIn import redirect)
  useEffect(() => {
    const linkedIn = searchParams.get("linkedIn");
    const source = searchParams.get("source");
    if (linkedIn || source) {
      setFormValues((prev) => ({
        ...prev,
        ...(linkedIn ? { linkedIn } : {}),
        ...(source ? { source } : {}),
      }));
    }
  }, [searchParams]);

  function updateField(field: string, value: string) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  function addSkill() {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setSkillInput("");
    }
  }

  async function parseResume() {
    if (!resumeFile) return;
    setParsing(true);
    setParseMessage("");

    try {
      const formData = new FormData();
      formData.append("file", resumeFile);

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        setParseMessage(body.error || "Failed to parse resume");
        setParsing(false);
        return;
      }

      const parsed = await res.json();

      // Auto-fill form fields with parsed data
      setFormValues((prev) => ({
        ...prev,
        firstName: parsed.firstName || prev.firstName,
        lastName: parsed.lastName || prev.lastName,
        email: parsed.email || prev.email,
        phone: parsed.phone || prev.phone,
        linkedIn: parsed.linkedIn || prev.linkedIn,
        location: parsed.location || prev.location,
        currentTitle: parsed.currentTitle || prev.currentTitle,
        currentCompany: parsed.currentCompany || prev.currentCompany,
        summary: parsed.summary || prev.summary,
      }));

      if (parsed.skills && parsed.skills.length > 0) {
        setSkills((prev) => [...new Set([...prev, ...parsed.skills])]);
      }

      const fieldCount = Object.values(parsed).filter(
        (v) => v && (typeof v === "string" ? v.length > 0 : Array.isArray(v) && v.length > 0)
      ).length;
      setParseMessage(`Parsed successfully - filled ${fieldCount} fields from resume.`);

      // If the parser pulled any identifier, check for duplicates right
      // away so the recruiter sees the warning without having to blur.
      if (parsed.email || parsed.phone || parsed.linkedIn) {
        void checkDuplicates({
          email: parsed.email,
          phone: parsed.phone,
          linkedIn: parsed.linkedIn,
        });
      }
    } catch {
      setParseMessage("Failed to parse resume. Try a .txt file for best results.");
    }
    setParsing(false);
  }

  async function uploadAttachments(candidateId: string) {
    for (const file of attachments) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("candidateId", candidateId);
        await fetch("/api/documents", { method: "POST", body: formData });
      } catch {
        // Silently skip failed uploads - candidate is already created
      }
    }

    // Also upload the resume file if present
    if (resumeFile) {
      try {
        const formData = new FormData();
        formData.append("file", resumeFile);
        formData.append("candidateId", candidateId);
        await fetch("/api/documents", { method: "POST", body: formData });
      } catch {}
    }
  }

  async function actuallyCreate() {
    setLoading(true);
    setError("");

    const data = {
      firstName: formValues.firstName,
      lastName: formValues.lastName,
      email: formValues.email,
      phone: formValues.phone,
      linkedIn: formValues.linkedIn,
      location: formValues.location,
      currentTitle: formValues.currentTitle,
      currentCompany: formValues.currentCompany,
      currentSalary: formValues.currentSalary
        ? Number(formValues.currentSalary)
        : null,
      desiredSalary: formValues.desiredSalary
        ? Number(formValues.desiredSalary)
        : null,
      salaryCurrency: formValues.salaryCurrency,
      source: formValues.source,
      summary: formValues.summary,
      skills,
    };

    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to create candidate");
        setLoading(false);
        return;
      }

      const candidate = await res.json();

      // Upload attachments after candidate creation
      if (attachments.length > 0 || resumeFile) {
        await uploadAttachments(candidate.id);
      }

      router.push(`/candidates/${candidate.id}`);
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Require at least one way to contact the candidate. We don't force
    // all three, so recruiters sourcing from LinkedIn-only (or a networking
    // event with just an email) aren't forced to fabricate values — but we
    // do guarantee every candidate is reachable and dedupe-able.
    const hasContact =
      formValues.email.trim() ||
      formValues.phone.trim() ||
      formValues.linkedIn.trim();
    if (!hasContact) {
      setError("Add at least one way to contact this candidate — email, phone or LinkedIn URL.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Re-check duplicates across all three channels at submit time in
    // case the user typed past a field without blurring (e.g. submitted
    // via Enter). If any match, open the confirm dialog.
    const matches = await checkDuplicates();
    if (matches.length > 0) {
      setShowDuplicateDialog(true);
      return;
    }

    await actuallyCreate();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/candidates">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Add Candidate</h1>
      </div>

      {/* Resume Parse Section */}
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-5 w-5 text-indigo-600" />
            <h3 className="font-medium text-sm">Quick Add from Resume</h3>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex-1 flex items-center justify-center border-2 border-dashed border-indigo-200 rounded-lg p-4 cursor-pointer hover:border-indigo-400 transition">
              <div className="text-center">
                <Upload className="h-5 w-5 text-indigo-400 mx-auto mb-1" />
                <span className="text-xs text-indigo-600">
                  {resumeFile ? resumeFile.name : "Drop resume here or click to upload"}
                </span>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!resumeFile || parsing}
              onClick={parseResume}
              className="gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {parsing ? "Parsing..." : "Parse & Fill"}
            </Button>
          </div>
          {parseMessage && (
            <p className="text-xs text-indigo-600 mt-2">{parseMessage}</p>
          )}
        </CardContent>
      </Card>

      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Candidate Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  required
                  value={formValues.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  required
                  value={formValues.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center justify-between gap-2">
                  <span>Email</span>
                  <span className="text-[10.5px] font-normal text-gray-400 normal-case">
                    email, phone or LinkedIn required
                  </span>
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formValues.email}
                  className={
                    flaggedFields.has("email")
                      ? "border-indigo-400 ring-2 ring-indigo-100"
                      : ""
                  }
                  onChange={(e) => {
                    updateField("email", e.target.value);
                    // Clear any stale warning so the user can keep editing
                    // without seeing an outdated dupe match.
                    if (duplicateMatches.length > 0) setDuplicateMatches([]);
                  }}
                  onBlur={(e) => {
                    void checkDuplicates({ email: e.target.value });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <div
                  className={
                    flaggedFields.has("phone")
                      ? "rounded-md ring-2 ring-indigo-100 [&_input]:border-indigo-400 [&>div>button]:border-indigo-400"
                      : ""
                  }
                  onBlur={(e) => {
                    // Only check when focus leaves the phone input group
                    // entirely (prefix dropdown + number field).
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      void checkDuplicates({ phone: formValues.phone });
                    }
                  }}
                >
                  <PhoneInput
                    value={formValues.phone}
                    onChange={(val) => {
                      updateField("phone", val);
                      if (duplicateMatches.length > 0) setDuplicateMatches([]);
                    }}
                    name="phone"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedIn">LinkedIn URL</Label>
              <Input
                id="linkedIn"
                name="linkedIn"
                value={formValues.linkedIn}
                className={
                  flaggedFields.has("LinkedIn")
                    ? "border-indigo-400 ring-2 ring-indigo-100"
                    : ""
                }
                onChange={(e) => {
                  updateField("linkedIn", e.target.value);
                  if (duplicateMatches.length > 0) setDuplicateMatches([]);
                }}
                onBlur={(e) => {
                  void checkDuplicates({ linkedIn: e.target.value });
                }}
              />
            </div>

            {checkingDuplicate && (
              <p className="text-xs text-gray-400">Checking for duplicates…</p>
            )}
            {duplicateMatches.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2 space-y-1">
                <div className="flex items-center gap-1.5 px-1.5 pt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  <span className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wider">
                    Already in your database
                  </span>
                </div>
                {duplicateMatches.map((m) => {
                  const channels = getMatchedChannels(m);
                  return (
                    <Link
                      key={m.id}
                      href={`/candidates/${m.id}`}
                      target="_blank"
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white hover:shadow-sm transition group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {m.firstName} {m.lastName}
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
                          {[m.currentTitle, m.currentCompany].filter(Boolean).join(" · ") || m.email}
                        </p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-600 shrink-0 transition" />
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                placeholder="New York, NY"
                value={formValues.location}
                onChange={(e) => updateField("location", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentTitle">Current Title</Label>
                <Input
                  id="currentTitle"
                  name="currentTitle"
                  value={formValues.currentTitle}
                  onChange={(e) => updateField("currentTitle", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentCompany">Current Company</Label>
                <Input
                  id="currentCompany"
                  name="currentCompany"
                  value={formValues.currentCompany}
                  onChange={(e) => updateField("currentCompany", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <CurrencyPicker
                value={formValues.salaryCurrency}
                onChange={(c) => updateField("salaryCurrency", c)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentSalary">Current Salary ({getCurrency(formValues.salaryCurrency).symbol})</Label>
                <Input
                  id="currentSalary"
                  name="currentSalary"
                  type="number"
                  value={formValues.currentSalary}
                  onChange={(e) => updateField("currentSalary", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desiredSalary">Desired Salary ({getCurrency(formValues.salaryCurrency).symbol})</Label>
                <Input
                  id="desiredSalary"
                  name="desiredSalary"
                  type="number"
                  value={formValues.desiredSalary}
                  onChange={(e) => updateField("desiredSalary", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <SourceInput
                id="source"
                name="source"
                value={formValues.source}
                onChange={(v) => updateField("source", v)}
              />
            </div>

            <div className="space-y-2">
              <Label>Skills</Label>
              <div className="flex gap-2">
                <Input
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                  placeholder="Type a skill and press Enter"
                />
                <Button type="button" variant="outline" onClick={addSkill}>
                  Add
                </Button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-sm"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() =>
                          setSkills(skills.filter((x) => x !== s))
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">Summary / Notes</Label>
              <Textarea
                id="summary"
                name="summary"
                rows={4}
                placeholder="Background, qualifications, notes..."
                value={formValues.summary}
                onChange={(e) => updateField("summary", e.target.value)}
              />
            </div>

            {/* Attachments */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-medium">Attachments</h3>
                <p className="text-xs text-gray-400">
                  Attach resumes, cover letters, screening notes, etc. These will be uploaded after creating the candidate.
                </p>
                <label className="flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-4 cursor-pointer hover:border-gray-300 transition">
                  <div className="text-center">
                    <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                    <span className="text-xs text-gray-500">Click to add files</span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setAttachments((prev) => [...prev, ...files]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {attachments.length > 0 && (
                  <div className="space-y-1">
                    {attachments.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                          className="text-gray-400 hover:text-red-500 ml-2"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2 pt-4">
              <Link href="/candidates">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Candidate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">This candidate is already in your database</DialogTitle>
            <DialogDescription className="text-sm">
              Open the existing record to pick up where you left off, or create a new one anyway.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-1.5 space-y-1 max-h-64 overflow-y-auto">
            {duplicateMatches.map((m) => {
              const channels = getMatchedChannels(m);
              return (
                <Link
                  key={m.id}
                  href={`/candidates/${m.id}`}
                  target="_blank"
                  className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-white hover:shadow-sm transition group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.firstName} {m.lastName}
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
                      {[m.currentTitle, m.currentCompany].filter(Boolean).join(" · ") || m.email}
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
