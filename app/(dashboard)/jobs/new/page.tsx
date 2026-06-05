"use client";

import { useEffect, useState, useRef, Suspense } from "react";
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
import { Upload, FileText, X, Loader2, Search, Check, ExternalLink, Plus } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import { JOB_STATUS_LABELS, JOB_STATUS_SELECTABLE } from "@/lib/constants";
import {
  saveJobDraft,
  loadJobDraft,
  clearJobDraft,
  saveJdFile,
  loadJdFile,
  clearJdFile,
} from "@/lib/job-draft-storage";
import Link from "next/link";

type JobDuplicateMatch = {
  id: string;
  title: string;
  location: string | null;
  status: string;
  createdAt: string;
  client: { id: string; name: string };
};

function NewJobContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get("clientId") || "";
  // ?fromJobId=<uuid> triggers "Duplicate this job": fetch the source
  // job and pre-fill the form. Source label sticks around in a
  // dismissible banner so the recruiter knows where the data came from.
  const fromJobId = searchParams.get("fromJobId") || "";
  const [sourceJob, setSourceJob] = useState<{ id: string; title: string; status: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  // True only after a JD upload has populated the fields for the user.
  // Lets us hide the "Auto-filled from document" hint when the recruiter
  // typed the field themselves; cleared on any manual edit.
  const [titleFromDoc, setTitleFromDoc] = useState(false);
  const [descriptionFromDoc, setDescriptionFromDoc] = useState(false);
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState("ON_SITE");
  const [status, setStatus] = useState("OPEN");
  // Stored as `number | ""` so the user can wipe the field while
  // typing without us snapping it back to 1 mid-keystroke. Submit
  // coerces empty → 1 below.
  const [openings, setOpenings] = useState<number | "">(1);
  const [salary, setSalary] = useState("");
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Fee terms state (auto-filled from client defaults)
  const [currency, setCurrency] = useState("USD");
  const [feeType, setFeeType] = useState("PERCENTAGE");
  const [feeAmount, setFeeAmount] = useState("");
  const [termsAutoFilled, setTermsAutoFilled] = useState(false);

  // Client search combobox state
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId);
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);

  // Client mode used to be a toggle between "quick-share by email"
  // (which auto-created a stub Client + invited the hiring contact)
  // and "pick existing client." That mixed creating-a-job with
  // inviting-a-contact, which read as confusing in the create flow —
  // recruiters expected to JUST create the job and worry about who
  // gets access later. The Invite Client flow lives on /jobs/[id]
  // post-creation now. Here we only let you pick an existing Client.

  // Duplicate-job detection: matches existing jobs with the same
  // (client, title) within the firm.
  const [jobDuplicates, setJobDuplicates] = useState<JobDuplicateMatch[]>([]);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  async function checkJobDuplicate(override?: {
    title?: string;
    clientId?: string;
  }): Promise<JobDuplicateMatch[]> {
    const t = (override?.title ?? title).trim();
    const cid = (override?.clientId ?? selectedClientId).trim();
    if (!t || !cid) {
      setJobDuplicates([]);
      return [];
    }
    setCheckingDuplicate(true);
    try {
      const qs = new URLSearchParams({ title: t, clientId: cid });
      const res = await fetch(`/api/jobs/check-duplicate?${qs.toString()}`);
      if (!res.ok) {
        setJobDuplicates([]);
        return [];
      }
      const data = await res.json();
      const matches: JobDuplicateMatch[] = data.matches || [];
      setJobDuplicates(matches);
      return matches;
    } catch {
      setJobDuplicates([]);
      return [];
    } finally {
      setCheckingDuplicate(false);
    }
  }

  const filteredClients = clientSearch
    ? clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectClient(clientId: string) {
    setSelectedClientId(clientId);
    setClientDropdownOpen(false);
    setClientSearch("");
    // Auto-fill fee terms from client defaults
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      if (client.defaultCurrency) setCurrency(client.defaultCurrency);
      if (client.defaultFeeType) setFeeType(client.defaultFeeType);
      if (client.defaultFeeAmount) {
        setFeeAmount(String(Number(client.defaultFeeAmount)));
        setTermsAutoFilled(true);
      }
    }
    // If a title is already set, re-check duplicates with the new client.
    if (title.trim()) {
      void checkJobDuplicate({ clientId });
    }
  }

  // Hand off to the full Create Client form so the recruiter can set fee
  // Quick-create dialog state. We used to navigate to /clients/new
  // here and store a JobDraft in sessionStorage, but the navigation
  // forced the user to re-upload the JD file on return (File objects
  // can't be serialized to localStorage/sessionStorage). Opening a
  // dialog instead keeps /jobs/new mounted so the File survives.
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickClientName, setQuickClientName] = useState("");
  const [quickClientIndustry, setQuickClientIndustry] = useState("");
  const [quickClientType, setQuickClientType] = useState<"RECRUITING" | "STAFF_AUG">("RECRUITING");
  // Default fee terms — only used + sent when engagement type is
  // RECRUITING (Staff Aug negotiates per job, so the client-level
  // defaults stay null). Kept in dialog-local state so cancelling
  // doesn't pollute anything.
  const [quickClientCurrency, setQuickClientCurrency] = useState("USD");
  const [quickClientFeeType, setQuickClientFeeType] = useState<"PERCENTAGE" | "FLAT">("PERCENTAGE");
  const [quickClientFeeAmount, setQuickClientFeeAmount] = useState("");
  const [quickClientPaymentTerms, setQuickClientPaymentTerms] = useState("");
  const [quickClientGuarantee, setQuickClientGuarantee] = useState("");
  const [quickClientSaving, setQuickClientSaving] = useState(false);
  const [quickClientError, setQuickClientError] = useState<string>("");

  function openQuickClient(name: string) {
    setQuickClientName(name.trim());
    setQuickClientIndustry("");
    setQuickClientType("RECRUITING");
    setQuickClientCurrency("USD");
    setQuickClientFeeType("PERCENTAGE");
    setQuickClientFeeAmount("");
    setQuickClientPaymentTerms("");
    setQuickClientGuarantee("");
    setQuickClientError("");
    setQuickClientOpen(true);
  }

  async function saveQuickClient() {
    const name = quickClientName.trim();
    if (!name) {
      setQuickClientError("Company name is required");
      return;
    }
    setQuickClientSaving(true);
    setQuickClientError("");
    try {
      // Only forward fee defaults for Recruiting clients. Staff Aug
      // intentionally leaves them null so the per-job form is the
      // authoritative place — sending values here would seed a
      // misleading client-level default.
      const isRecruiting = quickClientType === "RECRUITING";
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          industry: quickClientIndustry.trim() || undefined,
          engagementType: quickClientType,
          defaultCurrency: isRecruiting ? quickClientCurrency : null,
          defaultFeeType: isRecruiting ? quickClientFeeType : null,
          defaultFeeAmount:
            isRecruiting && quickClientFeeAmount.trim() !== ""
              ? Number(quickClientFeeAmount)
              : null,
          defaultPaymentTerms:
            isRecruiting && quickClientPaymentTerms.trim() !== ""
              ? Number(quickClientPaymentTerms)
              : null,
          defaultGuaranteePeriod:
            isRecruiting && quickClientGuarantee.trim() !== ""
              ? Number(quickClientGuarantee)
              : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuickClientError(data.error || "Could not create client");
        return;
      }
      // Insert the new client into the local list and select it. No
      // refetch needed — the API returns the full row.
      setClients((cur) => [...cur, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedClientId(data.id);
      setClientSearch("");
      setClientDropdownOpen(false);
      setQuickClientOpen(false);
    } catch (e: any) {
      setQuickClientError(e.message || "Could not create client");
    } finally {
      setQuickClientSaving(false);
    }
  }

  // On mount: either pre-fill from a source job (?fromJobId, Duplicate
  // flow) or restore from the persistent draft. Skipping the draft when
  // duplicating avoids the surprise of an old half-edit overwriting
  // the source data the recruiter just chose to clone.
  useEffect(() => {
    if (fromJobId) {
      fetch(`/api/jobs/${fromJobId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((source) => {
          if (!source) return;
          setSourceJob({ id: source.id, title: source.title, status: source.status });
          if (source.title) setTitle(source.title);
          if (source.description) setDescription(source.description);
          if (source.location) setLocation(source.location);
          if (source.workMode) setWorkMode(source.workMode);
          if (source.currency) setCurrency(source.currency);
          if (source.feeType) setFeeType(source.feeType);
          if (source.feeAmount !== null && source.feeAmount !== undefined) {
            setFeeAmount(String(Number(source.feeAmount)));
            setTermsAutoFilled(true);
          }
          if (source.salary) setSalary(source.salary);
          if (source.clientId) setSelectedClientId(source.clientId);
        })
        .catch(() => {});
      return;
    }
    const draft = loadJobDraft();
    if (draft) {
      if (draft.title) setTitle(draft.title);
      if (draft.titleFromDoc) setTitleFromDoc(draft.titleFromDoc);
      if (draft.description) setDescription(draft.description);
      if (draft.descriptionFromDoc) setDescriptionFromDoc(draft.descriptionFromDoc);
      if (draft.location) setLocation(draft.location);
      if (draft.workMode) setWorkMode(draft.workMode);
      if (draft.currency) setCurrency(draft.currency);
      if (draft.feeType) setFeeType(draft.feeType as any);
      if (draft.feeAmount) setFeeAmount(draft.feeAmount);
      if (draft.termsAutoFilled) setTermsAutoFilled(draft.termsAutoFilled);
      if (draft.parseStatus) setParseStatus(draft.parseStatus);
      if (draft.salary) setSalary(draft.salary);
    }
    // JD File lives in IndexedDB — it's binary, can't share storage
    // with the JSON draft. Best-effort: if there's no saved file we
    // just leave jdFile null.
    loadJdFile().then((file) => {
      if (file) setJdFile(file);
    });
  }, [fromJobId]);

  // Auto-save the field draft on every change. localStorage writes are
  // cheap so debouncing isn't worth the complexity.
  useEffect(() => {
    saveJobDraft({
      title,
      titleFromDoc,
      description,
      descriptionFromDoc,
      location,
      workMode,
      currency,
      feeType,
      feeAmount,
      termsAutoFilled,
      parseStatus,
      jdFileName: jdFile?.name || null,
      salary,
    });
  }, [
    title,
    titleFromDoc,
    description,
    descriptionFromDoc,
    location,
    workMode,
    currency,
    feeType,
    feeAmount,
    termsAutoFilled,
    parseStatus,
    jdFile,
    salary,
  ]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => {
        setClients(data);
        // Auto-fill if preselected client (covers both ?clientId from
        // navigation and the round-trip from /clients/new).
        if (preselectedClientId) {
          const client = data.find((c: any) => c.id === preselectedClientId);
          if (client) {
            if (client.defaultCurrency) setCurrency(client.defaultCurrency);
            if (client.defaultFeeType) setFeeType(client.defaultFeeType);
            if (client.defaultFeeAmount) {
              setFeeAmount(String(Number(client.defaultFeeAmount)));
              setTermsAutoFilled(true);
            }
          }
        }
      });
  }, []);

  async function handleFileUpload(file: File) {
    setJdFile(file);
    // Persist the binary so a refresh / tab-close doesn't drop it.
    // Fire-and-forget — failure here doesn't block the parse flow.
    void saveJdFile(file);
    setParsing(true);
    setParseStatus("Extracting text...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-document", { method: "POST", body: formData });
      const data = await res.json();

      if (data.text && data.text.trim()) {
        setDescription(data.text.trim());
        setDescriptionFromDoc(true);
        // On the create flow the recruiter explicitly uploaded a JD —
        // treat the document as the source of truth for everything the
        // extractor can pull out, including the title, even if there
        // was already a value in the field. (Edit-mode re-parse still
        // skips title — that's a different intent.)
        if (data.fields) {
          if (data.fields.title) {
            setTitle(data.fields.title);
            setTitleFromDoc(true);
          }
          if (data.fields.location) setLocation(data.fields.location);
          if (data.fields.workMode) setWorkMode(data.fields.workMode);
        }
        setParseStatus(`Text extracted (${data.text.trim().length} characters)`);

        // Run the duplicate check against whatever title we now have
        // (parsed or typed), as long as a client is selected.
        const titleForCheck = (data.fields?.title || title).trim();
        if (titleForCheck && selectedClientId) {
          void checkJobDuplicate({ title: titleForCheck });
        }
      } else if (data.error) {
        setParseStatus(`Could not extract text: ${data.error}`);
      } else {
        setParseStatus("No text could be extracted from this file");
      }
    } catch {
      setParseStatus("Failed to parse file");
    } finally {
      setParsing(false);
    }
  }

  async function actuallyCreate(fd: FormData) {
    setLoading(true);
    setError("");

    if (!selectedClientId) {
      setError("Pick a client first");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || fd.get("description"),
        clientId: selectedClientId,
        location,
        workMode,
        status,
        openings: openings === "" ? 1 : openings,
        currency,
        salary,
        feeType,
        feeAmount: feeAmount ? Number(feeAmount) : null,
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error || "Failed to create job");
      setLoading(false);
      return;
    }

    const job = await res.json();

    // Upload JD file if one was selected (to keep it as a downloadable document too)
    if (jdFile) {
      try {
        const docForm = new FormData();
        docForm.append("file", jdFile);
        docForm.append("category", "JOB_DESCRIPTION");
        await fetch(`/api/jobs/${job.id}/documents`, { method: "POST", body: docForm });
      } catch (e) {
        console.error("JD upload failed:", e);
      }
    }

    // The Job is created — drop the persistent draft so the next
    // /jobs/new visit starts fresh. Fire-and-forget; navigation
    // shouldn't wait on the IndexedDB delete.
    clearJobDraft();
    void clearJdFile();

    router.push(`/jobs/${job.id}`);
  }

  const pendingFormData = useRef<FormData | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    // Re-check for duplicates at submit time in case the user never
    // blurred the title field.
    {
      const matches = await checkJobDuplicate();
      if (matches.length > 0) {
        pendingFormData.current = fd;
        setShowDuplicateDialog(true);
        return;
      }
    }

    await actuallyCreate(fd);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <BackButton fallback="/jobs" />
        <h1 className="text-2xl font-bold">Create Job</h1>
      </div>

      {sourceJob && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="text-sm text-indigo-900 min-w-0">
            <span className="font-medium">Cloning from</span>{" "}
            <Link
              href={`/jobs/${sourceJob.id}`}
              className="underline hover:no-underline truncate inline-block max-w-xs align-bottom"
            >
              {sourceJob.title}
            </Link>{" "}
            <span className="text-indigo-700">({JOB_STATUS_LABELS[sourceJob.status] || sourceJob.status})</span>
            <span className="block text-xs text-indigo-700 mt-0.5">
              All fields pre-filled — edit anything before creating.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSourceJob(null);
              router.replace("/jobs/new");
            }}
            className="text-indigo-700 hover:text-indigo-900 shrink-0"
            aria-label="Clear source job"
            title="Start fresh"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={onSubmit} autoComplete="off">
        <Card>
          <CardHeader><CardTitle>Job Order Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}

            {/* JD File Upload — first, so it fills description below */}
            <div className="space-y-2">
              <Label>Job Description File</Label>
              {jdFile ? (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium truncate max-w-xs">{jdFile.name}</p>
                      <p className="text-xs text-gray-400">
                        {(jdFile.size / 1024).toFixed(1)} KB
                        {parsing && <span className="ml-2 text-indigo-500"><Loader2 className="inline h-3 w-3 animate-spin mr-1" />Parsing...</span>}
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setJdFile(null); setParseStatus(""); void clearJdFile(); }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                  <Upload className="h-6 w-6 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">Upload Job Description</span>
                  <span className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT (max 10MB) — text will be extracted and fill the description</span>
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }} />
                </label>
              )}
              {parseStatus && !parsing && (
                <p className={`text-xs ${parseStatus.startsWith("Text extracted") ? "text-green-600" : "text-amber-600"}`}>
                  {parseStatus}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                Job Title *
                {titleFromDoc && (
                  <span className="text-xs text-green-600 font-normal ml-2">
                    Auto-filled from document
                  </span>
                )}
              </Label>
              <Input
                name="title"
                placeholder="Senior Software Engineer"
                required
                value={title}
                className={
                  jobDuplicates.length > 0
                    ? "border-indigo-400 ring-2 ring-indigo-100"
                    : ""
                }
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleFromDoc) setTitleFromDoc(false);
                  if (jobDuplicates.length > 0) setJobDuplicates([]);
                }}
                onBlur={(e) => void checkJobDuplicate({ title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <input type="hidden" name="clientId" value={selectedClientId} />
              <div ref={clientRef} className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Search clients..."
                  value={clientDropdownOpen ? clientSearch : selectedClient?.name || ""}
                  onChange={(e) => { setClientSearch(e.target.value); setClientDropdownOpen(true); }}
                  onFocus={() => {
                    if (!clientDropdownOpen) {
                      setClientSearch("");
                      setClientDropdownOpen(true);
                    }
                  }}
                />
                {selectedClientId && !clientDropdownOpen && (
                  <button
                    type="button"
                    aria-label="Clear client"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClientId("");
                      setClientSearch("");
                      setCurrency("USD");
                      setFeeType("PERCENTAGE");
                      setFeeAmount("");
                      setTermsAutoFilled(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {clientDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                    {filteredClients.length === 0 && !clientSearch.trim() && clients.length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-500">No clients yet — add one below.</div>
                    )}
                    {filteredClients.length === 0 && clientSearch.trim() && (
                      <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
                    )}
                    {filteredClients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-indigo-50 transition-colors ${c.id === selectedClientId ? "bg-indigo-50 text-indigo-700" : ""}`}
                        onClick={() => selectClient(c.id)}
                      >
                        <span>{c.name}</span>
                        {c.id === selectedClientId && <Check className="h-4 w-4 text-indigo-600" />}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => openQuickClient(clientSearch)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left border-t border-gray-100 bg-gray-50 hover:bg-emerald-50 text-emerald-700 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>
                        {clientSearch.trim() && !filteredClients.some((c) => c.name.toLowerCase() === clientSearch.trim().toLowerCase()) ? (
                          <>Create &ldquo;<span className="font-semibold">{clientSearch.trim()}</span>&rdquo; as a new client</>
                        ) : (
                          <>Add a new client</>
                        )}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {checkingDuplicate && (
              <p className="text-xs text-gray-400">Checking for duplicates…</p>
            )}
            {jobDuplicates.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2 space-y-1">
                <div className="flex items-center gap-1.5 px-1.5 pt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  <span className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wider">
                    This client already has a job with this title
                  </span>
                </div>
                {jobDuplicates.map((m) => (
                  <Link
                    key={m.id}
                    href={`/jobs/${m.id}`}
                    target="_blank"
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white hover:shadow-sm transition group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {m.title}
                        </p>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                          {m.status.toLowerCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {m.client.name}
                        {m.location ? ` · ${m.location}` : ""}
                        {" · opened "}
                        {new Date(m.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-600 shrink-0 transition" />
                  </Link>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  name="location"
                  placeholder="New York, NY"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Work Arrangement</Label>
                <select
                  name="workMode"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value)}
                >
                  <option value="ON_SITE">On-site</option>
                  <option value="REMOTE">Remote</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {JOB_STATUS_SELECTABLE.map((v) => (
                    <option key={v} value={v}>
                      {JOB_STATUS_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Openings</Label>
                <Input
                  type="number"
                  min={1}
                  value={openings}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Allow empty while typing; coerce + clamp only
                    // when there's a real value. Onblur snaps back to
                    // 1 if the user leaves the field blank.
                    setOpenings(v === "" ? "" : Math.max(1, Number(v) || 1));
                  }}
                  onBlur={() => {
                    if (openings === "" || (typeof openings === "number" && openings < 1)) {
                      setOpenings(1);
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Salary Range</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                    $
                  </span>
                  <Input
                    name="salary"
                    placeholder="150K - 180K"
                    className="pl-7"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <CurrencyPicker value={currency} onChange={setCurrency} />
              </div>
            </div>
            {termsAutoFilled && (
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                <span>
                  Fee terms pre-filled from client defaults — edit any to override
                </span>
              </div>
            )}
            {selectedClient?.engagementType === "STAFF_AUG" && (
              <div className="flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded-md px-2.5 py-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span>
                  <span className="font-medium">{selectedClient.name}</span> is a Staff Augmentation client — set the fee terms for this specific search below.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fee Type</Label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" value={feeType} onChange={(e) => setFeeType(e.target.value)}>
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FLAT">Flat Fee</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Fee Amount</Label>
                <MoneyInput
                  prefix={feeType === "FLAT" ? "$" : "%"}
                  placeholder="25"
                  value={feeAmount}
                  onChange={setFeeAmount}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Description
                {descriptionFromDoc && (
                  <span className="text-xs text-green-600 font-normal ml-2">
                    Auto-filled from document
                  </span>
                )}
              </Label>
              <Textarea
                ref={descRef}
                name="description"
                rows={description ? 12 : 4}
                placeholder="Job description, requirements..."
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (descriptionFromDoc) setDescriptionFromDoc(false);
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // Hitting Cancel == "I'm done with this draft". The
                  // user reported that without clearing here, the
                  // next open of /jobs/new restored the abandoned
                  // form ("se guarda toda la info del anterior que
                  // borraste"). The draft hook persists on every
                  // keystroke, so the explicit signal we get is the
                  // Cancel click — that's where the draft dies.
                  clearJobDraft();
                  void clearJdFile();
                  router.push("/jobs");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || parsing}>
                {loading ? "Creating..." : "Create Job"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">This client already has a job with this title</DialogTitle>
            <DialogDescription className="text-sm">
              Open the existing job to reuse its pipeline, or create a new one anyway if this is a separate search.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-1.5 space-y-1 max-h-64 overflow-y-auto">
            {jobDuplicates.map((m) => (
              <Link
                key={m.id}
                href={`/jobs/${m.id}`}
                target="_blank"
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md hover:bg-white hover:shadow-sm transition group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {m.title}
                    </p>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                      {m.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {m.client.name}
                    {m.location ? ` · ${m.location}` : ""}
                    {" · opened "}
                    {new Date(m.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-indigo-600 shrink-0 transition" />
              </Link>
            ))}
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
                if (pendingFormData.current) {
                  await actuallyCreate(pendingFormData.current);
                  pendingFormData.current = null;
                }
              }}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-create client. Captures everything the recruiter
          normally fills at the client level: name, industry,
          engagement type, and — for Recruiting — the default fee
          terms that will pre-fill every Job and Placement at this
          client. Staff Aug clients skip the terms section because
          those clients negotiate fees per-job, so a client-level
          default would be misleading. Website / contacts / notes
          stay on the full /clients/[id] page. */}
      <Dialog open={quickClientOpen} onOpenChange={(open) => {
        if (!quickClientSaving) setQuickClientOpen(open);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quick-create client</DialogTitle>
            <DialogDescription>
              Add the company and (for Recruiting) the default fee terms. Website, contacts and other details live on the client page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
            {quickClientError && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{quickClientError}</div>
            )}
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input
                autoFocus
                autoComplete="off"
                value={quickClientName}
                onChange={(e) => setQuickClientName(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Industry</Label>
                <Combobox
                  value={quickClientIndustry}
                  onChange={setQuickClientIndustry}
                  options={INDUSTRY_OPTIONS}
                  placeholder="Technology, Finance, etc."
                />
              </div>
              <div className="space-y-2">
                <Label>Engagement type</Label>
                <select
                  value={quickClientType}
                  onChange={(e) => setQuickClientType(e.target.value as "RECRUITING" | "STAFF_AUG")}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="RECRUITING">Recruiting</option>
                  <option value="STAFF_AUG">Staff Aug</option>
                </select>
              </div>
            </div>

            {quickClientType === "RECRUITING" && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Default fee terms</h3>
                <p className="text-xs text-gray-400 mb-3">Pre-fill every Job and Placement at this client. Override per-job as needed.</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Currency</Label>
                    <CurrencyPicker
                      value={quickClientCurrency}
                      onChange={(c) => setQuickClientCurrency(c)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Fee Type</Label>
                    <select
                      value={quickClientFeeType}
                      onChange={(e) => setQuickClientFeeType(e.target.value as "PERCENTAGE" | "FLAT")}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="PERCENTAGE">Percentage</option>
                      <option value="FLAT">Flat Fee</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Fee Amount</Label>
                    <MoneyInput
                      prefix={quickClientFeeType === "FLAT" ? "$" : "%"}
                      placeholder="e.g. 15"
                      value={quickClientFeeAmount}
                      onChange={setQuickClientFeeAmount}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Payment terms (days)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="30"
                      value={quickClientPaymentTerms}
                      onChange={(e) => setQuickClientPaymentTerms(e.target.value)}
                    />
                    <p className="text-[10px] text-gray-400">Days from start date to invoice due (Net 30 = 30).</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Guarantee period (days)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="90"
                      value={quickClientGuarantee}
                      onChange={(e) => setQuickClientGuarantee(e.target.value)}
                    />
                    <p className="text-[10px] text-gray-400">Replacement window after the candidate starts.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setQuickClientOpen(false)}
              disabled={quickClientSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={saveQuickClient}
              disabled={quickClientSaving || !quickClientName.trim()}
            >
              {quickClientSaving ? "Saving..." : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NewJobPage() {
  return (
    <Suspense fallback={<div className="h-96 bg-gray-100 rounded-lg animate-pulse" />}>
      <NewJobContent />
    </Suspense>
  );
}
