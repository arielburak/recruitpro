"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Share2, Check, Mail, Trash2, Send, Users, X, Upload, FileText, Download, Pencil, ExternalLink, Phone } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS, JOB_STATUS_SELECTABLE, WORK_ARRANGEMENT_LABELS, WORK_ARRANGEMENT_COLORS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { SubmissionsListView } from "@/components/pipeline/submissions-list-view";
import { ShareCandidateDialog } from "@/components/pipeline/share-candidate-dialog";
import { PlacementDialog } from "@/components/placements/placement-dialog";
import { QuickInterviewDialog } from "@/components/calendar/quick-interview-dialog";
import { OfferNotesPrompt } from "@/components/pipeline/offer-notes-prompt";
import { InterviewDialog } from "@/components/interviews/interview-dialog";
import { InterviewsList } from "@/components/interviews/interviews-list";
import { InterviewsCalendar } from "@/components/interviews/interviews-calendar";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import { PhoneInput } from "@/components/ui/phone-input";
import { ChatNotes } from "@/components/chat-notes";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type TeamMember = { id: string; name: string; email: string };

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id || "";
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // "Add Candidate" dialog — inline create mode
  const [addMode, setAddMode] = useState<"search" | "create">("search");
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([]);
  const [showCompanySuggestions, setShowCompanySuggestions] = useState(false);
  const emptyNewCandidate = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    linkedIn: "",
    currentTitle: "",
    currentCompany: "",
    ownerId: "",
  };
  const [newCandidate, setNewCandidate] = useState(emptyNewCandidate);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Team picker for the Owner field on the inline "Create new" tab.
  // Hits the same endpoint /candidates/new uses, with no jobId scope
  // so the picker shows every workspace member (a candidate's owner
  // is org-level, not job-level). Loaded once on mount.
  useEffect(() => {
    fetch("/api/users/search?q=")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((data) => setTeamMembers(Array.isArray(data.users) ? data.users : []))
      .catch(() => setTeamMembers([]));
  }, []);

  // Default Owner = whoever is logged in. We only set it once and
  // only when empty so a re-open of the modal doesn't blow away a
  // value the user picked manually before closing.
  useEffect(() => {
    if (!newCandidate.ownerId && currentUserId) {
      setNewCandidate((prev) => ({ ...prev, ownerId: currentUserId }));
    }
  }, [currentUserId, newCandidate.ownerId]);

  // Duplicate detection for the inline "Create new" tab — mirrors the
  // /candidates/new page so recruiters get the same heads-up in both
  // flows. Hits the same /api/candidates/check-duplicate endpoint.
  type InlineDupe = {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    linkedIn: string | null;
    currentTitle: string | null;
    currentCompany: string | null;
  };
  const [inlineDupes, setInlineDupes] = useState<InlineDupe[]>([]);
  const [checkingInlineDupe, setCheckingInlineDupe] = useState(false);

  async function checkInlineDuplicates(override?: {
    email?: string;
    phone?: string;
    linkedIn?: string;
  }): Promise<InlineDupe[]> {
    const email = (override?.email ?? newCandidate.email).trim();
    const phone = (override?.phone ?? newCandidate.phone).trim();
    const linkedIn = (override?.linkedIn ?? newCandidate.linkedIn).trim();
    if (!email && !phone && !linkedIn) {
      setInlineDupes([]);
      return [];
    }
    setCheckingInlineDupe(true);
    try {
      const qs = new URLSearchParams();
      if (email) qs.set("email", email);
      if (phone) qs.set("phone", phone);
      if (linkedIn) qs.set("linkedIn", linkedIn);
      const res = await fetch(`/api/candidates/check-duplicate?${qs.toString()}`);
      if (!res.ok) {
        setInlineDupes([]);
        return [];
      }
      const data = await res.json();
      const matches: InlineDupe[] = data.matches || [];
      setInlineDupes(matches);
      return matches;
    } catch {
      setInlineDupes([]);
      return [];
    } finally {
      setCheckingInlineDupe(false);
    }
  }

  function getInlineMatchedChannels(m: InlineDupe): string[] {
    const channels: string[] = [];
    const formEmail = newCandidate.email.trim().toLowerCase();
    if (formEmail && m.email && m.email.toLowerCase() === formEmail) channels.push("email");
    const formPhoneDigits = newCandidate.phone.replace(/\D/g, "");
    const matchPhoneDigits = m.phone?.replace(/\D/g, "") || "";
    if (formPhoneDigits && formPhoneDigits === matchPhoneDigits) channels.push("phone");
    const extractHandle = (v: string) => {
      if (!v) return "";
      const match = v
        .trim()
        .toLowerCase()
        .match(/(?:linkedin\.com\/in\/|^\/?in\/)([a-z0-9\-_.]+)/i);
      return match ? match[1].replace(/\/$/, "") : "";
    };
    const formHandle = extractHandle(newCandidate.linkedIn);
    const matchHandle = extractHandle(m.linkedIn || "");
    if (formHandle && formHandle === matchHandle) channels.push("LinkedIn");
    return channels;
  }

  const inlineFlaggedFields = new Set<string>();
  for (const m of inlineDupes) {
    for (const c of getInlineMatchedChannels(m)) inlineFlaggedFields.add(c);
  }
  const [inlineResume, setInlineResume] = useState<File | null>(null);
  const [inlineParsing, setInlineParsing] = useState(false);
  const [inlineParseMessage, setInlineParseMessage] = useState("");

  function resetAddCandidateDialog() {
    setAddMode("search");
    setCandidateSearch("");
    setSearchResults([]);
    setNewCandidate(emptyNewCandidate);
    setCreateError("");
    setInlineResume(null);
    setInlineParseMessage("");
    setInlineDupes([]);
  }

  // Share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareName, setShareName] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState("");
  const [shareError, setShareError] = useState("");

  // Autocomplete for the share-with-client dialog. As the recruiter
  // types, surface every ClientUser the agency already has on file so
  // they can pick "Nick Cuello · Lion Point" instead of re-typing a
  // misspelled email and accidentally creating a duplicate account.
  type ContactSuggestion = {
    id: string;
    email: string;
    name: string;
    title: string | null;
    clientId: string;
    clientName: string;
    hasPassword: boolean;
    onCurrentClient: boolean;
    // Contacts at OTHER Clients of this agency are listed but can't be
    // picked — the email-uniqueness rule prevents reusing them here.
    available: boolean;
  };
  const [shareSuggestions, setShareSuggestions] = useState<ContactSuggestion[]>([]);
  const [shareSuggestOpen, setShareSuggestOpen] = useState(false);
  // Flag that the next change to shareEmail came from picking a
  // suggestion, not the user typing. Without it the debounce effect
  // below would re-fetch and re-open the dropdown right after the
  // pick, eating the click — the user reported needing two clicks
  // because the first one closed the dropdown and the effect
  // immediately reopened it with the same suggestion.
  const sharePickedRef = useRef(false);
  const [shareSuggestLoading, setShareSuggestLoading] = useState(false);

  // Assign recruiters dialog state
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignResults, setAssignResults] = useState<any[]>([]);
  const [assignSearching, setAssignSearching] = useState(false);

  // Document upload state
  const [uploadingJD, setUploadingJD] = useState(false);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [pipelineView, setPipelineView] = useState<"kanban" | "list">("kanban");
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "OPEN",
    openings: 1,
    location: "",
    workMode: "ON_SITE",
    salary: "",
    currency: "USD",
    feeType: "PERCENTAGE",
    feeAmount: "" as string | number,
    clientId: "",
  });
  const [clients, setClients] = useState<any[]>([]);

  function startEditing() {
    setEditForm({
      title: job.title || "",
      description: job.description || "",
      status: job.status || "OPEN",
      openings: job.openings ?? 1,
      location: job.location || "",
      workMode: job.workMode || "ON_SITE",
      salary: job.salary || "",
      currency: job.currency || "USD",
      feeType: job.feeType || "PERCENTAGE",
      feeAmount: job.feeAmount ?? "",
      clientId: job.clientId || "",
    });
    // Fetch clients for the dropdown
    fetch("/api/clients").then((r) => r.json()).then(setClients);
    setEditing(true);
    setActiveTab("details");
  }

  async function saveEditing() {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          feeAmount: editForm.feeAmount !== "" ? Number(editForm.feeAmount) : null,
          // Final coercion in case the user submitted while the field
          // was empty mid-edit.
          openings:
            (editForm.openings as any) === "" || (editForm.openings as any) < 1
              ? 1
              : editForm.openings,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to save");
      } else {
        setEditing(false);
        fetchJob();
      }
    } catch {
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${params.id}`);
    if (res.ok) {
      const data = await res.json();
      setJob(data);
      setLoading(false);
      return data;
    } else {
      const data = await res.json().catch(() => ({}));
      // If this is a ClientJob ID with an accepted engagement, redirect to the real job
      if (res.status === 307 && data.redirect) {
        router.replace(data.redirect);
        return null;
      }
      // If this is a ClientJob with a pending engagement, redirect to engagements
      if (data.error === "pending_engagement") {
        router.replace("/engagements");
        return null;
      }
    }
    setLoading(false);
    return null;
  }, [params.id, router]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Refresh when share dialog completes
  useEffect(() => {
    function handleRefresh() { fetchJob(); }
    window.addEventListener("kanban:refresh", handleRefresh);
    return () => window.removeEventListener("kanban:refresh", handleRefresh);
  }, [fetchJob]);

  async function searchCandidates(query: string) {
    setCandidateSearch(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/candidates?search=${encodeURIComponent(query)}&mine=false&limit=10`);
    const data = await res.json();
    setSearchResults(data.candidates || []);
    setSearching(false);
  }

  async function fetchCompanySuggestions(query: string) {
    try {
      const url = query.trim()
        ? `/api/candidates/suggest-companies?q=${encodeURIComponent(query)}`
        : `/api/candidates/suggest-companies`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setCompanySuggestions(data.suggestions || []);
    } catch {}
  }

  async function parseInlineResume() {
    if (!inlineResume) return;
    setInlineParsing(true);
    setInlineParseMessage("");
    try {
      const fd = new FormData();
      fd.append("file", inlineResume);
      const res = await fetch("/api/parse-resume", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json();
        setInlineParseMessage(body.error || "Failed to parse resume");
        setInlineParsing(false);
        return;
      }
      const parsed = await res.json();
      setNewCandidate((prev) => ({
        ...prev,
        firstName: parsed.firstName || prev.firstName,
        lastName: parsed.lastName || prev.lastName,
        email: parsed.email || prev.email,
        phone: parsed.phone || prev.phone,
        linkedIn: parsed.linkedIn || prev.linkedIn,
        currentTitle: parsed.currentTitle || prev.currentTitle,
        currentCompany: parsed.currentCompany || prev.currentCompany,
      }));
      setInlineParseMessage("Resume parsed — review the fields below.");
      if (parsed.email || parsed.phone || parsed.linkedIn) {
        void checkInlineDuplicates({
          email: parsed.email,
          phone: parsed.phone,
          linkedIn: parsed.linkedIn,
        });
      }
    } catch {
      setInlineParseMessage("Failed to parse resume. Try a .txt file for best results.");
    }
    setInlineParsing(false);
  }

  async function createAndAddCandidate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newCandidate.firstName.trim() || !newCandidate.lastName.trim()) {
      setCreateError("First and last name are required.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      // 1) Create the candidate — shares the same /api/candidates endpoint so
      //    it persists in the Candidates section just like a normal add.
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCandidate),
      });
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error || "Failed to create candidate");
        setCreating(false);
        return;
      }
      const candidate = await res.json();

      // 2) If the user uploaded a resume, attach it as a document.
      if (inlineResume) {
        try {
          const fd = new FormData();
          fd.append("file", inlineResume);
          fd.append("candidateId", candidate.id);
          await fetch("/api/documents", { method: "POST", body: fd });
        } catch {}
      }

      // 3) Add to this job's pipeline.
      await fetch(`/api/jobs/${params.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id }),
      });

      setShowAddCandidate(false);
      resetAddCandidateDialog();
      fetchJob();
    } catch {
      setCreateError("Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function addCandidateToJob(candidateId: string) {
    await fetch(`/api/jobs/${params.id}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    setShowAddCandidate(false);
    resetAddCandidateDialog();
    fetchJob();
  }

  // Pending stage move that's waiting on the share-with-client confirmation.
  // Set when the user drags a not-yet-shared candidate into "Submitted"; we
  // intercept and show the share dialog before actually persisting the move.
  const [pendingShareMove, setPendingShareMove] = useState<{
    submission: any;
    stageId: string;
  } | null>(null);

  // Pending placement creation triggered by dragging a candidate into the
  // "Placed" stage. Held here so we can pop the Congrats + form dialog
  // before the submission is actually flipped (POST /api/placements does
  // the stage move server-side once the user confirms or skips).
  const [pendingPlacement, setPendingPlacement] = useState<{
    submission: any;
  } | null>(null);

  // Pending interview scheduling triggered by moving a candidate into
  // "Interviewing". Unlike the placement flow, the stage move happens
  // up-front (the candidate IS at Interviewing now) and the dialog is
  // just for filling out the calendar event. Skip = move stays, just
  // no event scheduled yet.
  const [pendingInterview, setPendingInterview] = useState<{
    submission: any;
  } | null>(null);
  // Same skip-friendly pattern for Offered: stage flip first, then
  // prompt the user to capture base/bonus/start-date right when they
  // know it instead of weeks later when the placement is being put
  // together.
  const [pendingOffer, setPendingOffer] = useState<{
    submission: any;
  } | null>(null);
  // Job-page Interviews tab: create-new (with candidate picker) and
  // edit-existing both run through InterviewDialog.
  const [showCreateInterview, setShowCreateInterview] = useState(false);
  // Interviews tab: list (default, chronological) vs calendar (month
  // grid, useful for "what does the week look like"). Pure UI state,
  // not persisted — fast to toggle, low cost to discover.
  const [interviewsView, setInterviewsView] = useState<"list" | "calendar">("list");
  const [editingInterview, setEditingInterview] = useState<any | null>(null);

  async function persistMove(submissionId: string, stageId: string) {
    // Optimistic update — flip the card to the new column locally before
    // the network round-trip resolves so the recruiter sees the result
    // instantly instead of staring at the old position for ~500-1500 ms.
    // We snapshot the prior state so we can roll back if the PATCH fails.
    const previous = job;
    setJob((prev: any) =>
      prev
        ? {
            ...prev,
            submissions: prev.submissions.map((s: any) =>
              s.id === submissionId ? { ...s, stageId } : s,
            ),
          }
        : prev,
    );

    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) throw new Error("Move failed");
      // Re-fetch to pick up server-side side effects (activity log,
      // clientStageId on first share, sharedAt, etc.). The card already
      // looks right, so this refresh is invisible to the user.
      fetchJob();
    } catch {
      setJob(previous);
    }
  }

  async function moveSubmission(submissionId: string, stageId: string) {
    const target = job?.stages?.find((s: any) => s.id === stageId);
    const submission = job?.submissions?.find((s: any) => s.id === submissionId);
    const currentStage = job?.stages?.find((s: any) => s.id === submission?.stageId);
    const movingToSubmitted = target?.name === "Submitted";
    const notYetShared = submission && !submission.isSharedWithClient;
    const movingToPlaced = target?.name === "Placed";
    const movingToInterviewing = target?.name === "Interviewing";
    const movingToOffered = target?.name === "Offered";
    const leavingPlaced =
      currentStage?.name === "Placed" && target?.name !== "Placed";

    if (movingToSubmitted && notYetShared) {
      setPendingShareMove({ submission, stageId });
      return;
    }

    // Drop into the placement-creation flow only if there isn't already a
    // placement for this submission (POST /api/placements would 409 anyway).
    if (movingToPlaced && submission && !submission.placement) {
      setPendingPlacement({ submission });
      return;
    }

    // Inverse direction: leaving "Placed" should not leave an orphan
    // placement around. Server enforces the cascade, but we warn the
    // recruiter first since the placement carries salary / fee /
    // payment terms data they may not want to lose silently.
    if (leavingPlaced && submission?.placement) {
      const ok = window.confirm(
        `This candidate has a placement record. Moving out of "Placed" will permanently delete the placement (salary, fee, payment terms). Continue?`
      );
      if (!ok) return;
    }

    await persistMove(submissionId, stageId);

    // Interviewing: stage flip first (above), then prompt to schedule.
    // Skip-friendly — closing the dialog leaves the candidate at the
    // Interviewing stage without a calendar event, which the recruiter
    // can add later from /calendar.
    if (movingToInterviewing && submission) {
      setPendingInterview({ submission });
    }

    // Offered: stage flip first (above), then prompt to capture
    // offer details as an internal note on this submission. Skip
    // leaves the stage on Offered with no note attached.
    if (movingToOffered && submission) {
      setPendingOffer({ submission });
    }
  }

  // Debounced contact lookup while the recruiter types in the share
  // dialog. Skipped when the input doesn't look like a search yet
  // (< 2 chars), when the dialog is closed, or when the email just
  // changed because the user picked a suggestion (sharePickedRef).
  useEffect(() => {
    if (!showShareDialog) return;
    if (sharePickedRef.current) {
      sharePickedRef.current = false;
      return;
    }
    const q = shareEmail.trim();
    if (q.length < 2) {
      setShareSuggestions([]);
      setShareSuggestOpen(false);
      return;
    }
    setShareSuggestLoading(true);
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q });
      if (job?.clientId) qs.set("currentClientId", job.clientId);
      fetch(`/api/clients/contact-lookup?${qs.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setShareSuggestions(list);
          setShareSuggestOpen(list.length > 0);
        })
        .catch(() => setShareSuggestions([]))
        .finally(() => setShareSuggestLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [shareEmail, showShareDialog, job?.clientId]);

  function pickShareSuggestion(s: ContactSuggestion) {
    if (!s.available) return; // see ContactSuggestion.available
    sharePickedRef.current = true;
    setShareEmail(s.email);
    setShareName(s.name || "");
    setShareSuggestions([]);
    setShareSuggestOpen(false);
    setShareError("");
  }

  async function sendClientInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!job || !shareEmail.trim()) return;
    setSharing(true);
    setShareError("");
    setShareSuccess("");
    try {
      const res = await fetch("/api/client-portal/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: job.clientId,
          jobId: job.id,
          inviteEmail: shareEmail.trim(),
          inviteName: shareName.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShareSuccess(`Invite sent to ${shareEmail.trim()}! They'll be asked to sign up or log in to view candidates.`);
        setShareEmail("");
        setShareName("");
      } else {
        const data = await res.json();
        setShareError(data.error || "Failed to send invite");
      }
    } catch {
      setShareError("Something went wrong");
    } finally {
      setSharing(false);
    }
  }

  async function toggleShare(submissionId: string, shared: boolean) {
    await fetch(`/api/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSharedWithClient: shared }),
    });
    fetchJob();
  }

  async function removeSubmission(submissionId: string) {
    if (!confirm("Remove this candidate from the pipeline?")) return;
    await fetch(`/api/submissions/${submissionId}`, { method: "DELETE" });
    fetchJob();
  }

  async function deleteJob() {
    if (!confirm(`Delete "${job.title}"? This will remove all candidates from its pipeline. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/jobs/${params.id}`, { method: "DELETE" });
      router.push("/jobs");
    } catch {
      setDeleting(false);
    }
  }

  // Assign recruiters functions
  async function searchRecruiters(query: string) {
    setAssignSearch(query);
    if (!query.trim()) { setAssignResults([]); return; }
    setAssignSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        // Filter out already-assigned users
        const assignedIds = new Set(job.assignments?.map((a: any) => a.user?.id || a.userId));
        setAssignResults(data.users.filter((u: any) => !assignedIds.has(u.id)));
      }
    } catch {} finally { setAssignSearching(false); }
  }

  async function assignRecruiter(userId: string) {
    await fetch(`/api/jobs/${params.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setAssignSearch("");
    setAssignResults([]);
    fetchJob();
  }

  async function removeAssignment(userId: string) {
    await fetch(`/api/jobs/${params.id}/assignments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    fetchJob();
  }

  async function uploadJobDocument(file: File, category: "JOB_DESCRIPTION" | "ADDITIONAL") {
    const setUploading = category === "JOB_DESCRIPTION" ? setUploadingJD : setUploadingAdditional;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      const res = await fetch(`/api/jobs/${params.id}/documents`, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Upload failed");
      } else {
        const data = await res.json();
        if (category === "JOB_DESCRIPTION") {
          if (data.parsed) {
            // Text was extracted successfully
          } else if (data.parseError) {
            alert(`Document uploaded but text extraction failed: ${data.parseError}`);
          } else {
            alert("Document uploaded but no text could be extracted from the file.");
          }
        }
        const fresh = await fetchJob();
        // If the recruiter is mid-edit, refresh the editable copy of the
        // fields the re-parse may have rewritten so they see the new
        // values without having to cancel + reopen the form.
        if (editing && category === "JOB_DESCRIPTION" && fresh) {
          setEditForm((prev) => ({
            ...prev,
            description: fresh.description || "",
            location: fresh.location || prev.location,
            workMode: fresh.workMode || prev.workMode,
          }));
        }
      }
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteJobDocument(docId: string, isJD?: boolean) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    if (isJD) {
      await fetch(`/api/jobs/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: job.title,
          description: "",
          status: job.status,
          currency: job.currency || "USD",
          feeType: job.feeType,
          feeAmount: job.feeAmount ? Number(job.feeAmount) : null,
          salary: job.salary || "",
          location: job.location || "",
          clientId: job.clientId,
        }),
      });
    }
    fetchJob();
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  if (loading) return <div className="h-96 bg-gray-100 rounded-lg animate-pulse" />;
  if (!job) return <p className="text-gray-500">Job not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton fallback="/jobs" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{job.title}</h1>
              <Badge className={JOB_STATUS_COLORS[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
            </div>
            <p className="text-gray-500">
              <Link
                href={`/clients/${job.clientId}`}
                className="hover:text-indigo-600 hover:underline"
              >
                {job.client.name}
              </Link>
              {job.location && ` · ${job.location}`}
              {job.salary && ` · ${job.salary} (${job.currency || "USD"})`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <Button variant="outline" onClick={startEditing}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setShowAssignDialog(true)}
          >
            <Users className="mr-2 h-4 w-4" /> Assign Team
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowShareDialog(true);
              setShareSuccess("");
              setShareError("");
            }}
          >
            <Share2 className="mr-2 h-4 w-4" /> Invite Client
          </Button>
          <Button onClick={() => setShowAddCandidate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Candidate
          </Button>
          <Button
            variant="outline"
            onClick={deleteJob}
            disabled={deleting}
            className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
          >
            <Trash2 className="h-4 w-4" />
          </Button>

          {/* Invite Client Dialog */}
          <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Client to Portal</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-500">
                Enter the client contact's email. They'll receive an invite to sign up (or log in) to the client portal where they can review shared candidates for <span className="font-medium text-gray-700">{job.title}</span>.
              </p>
              <form onSubmit={sendClientInvite} className="space-y-4 mt-2">
                {shareError && (
                  <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{shareError}</div>
                )}
                {shareSuccess && (
                  <div className="bg-green-50 text-green-600 text-sm p-3 rounded-lg flex items-start gap-2">
                    <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{shareSuccess}</span>
                  </div>
                )}
                <div className="space-y-2 relative">
                  <Label htmlFor="share-email">Email Address *</Label>
                  <Input
                    id="share-email"
                    type="email"
                    placeholder="client@company.com — start typing to find existing contacts"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    onFocus={() => shareSuggestions.length > 0 && setShareSuggestOpen(true)}
                    autoComplete="off"
                    required
                  />
                  {shareSuggestOpen && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
                      <div className="px-3 pt-2 pb-1.5 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                          Existing contacts
                        </span>
                        <button
                          type="button"
                          onClick={() => setShareSuggestOpen(false)}
                          className="text-[10px] text-gray-400 hover:text-gray-600"
                        >
                          dismiss
                        </button>
                      </div>
                      {shareSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => pickShareSuggestion(s)}
                          disabled={!s.available}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-t border-gray-50 ${
                            s.available
                              ? "hover:bg-indigo-50 cursor-pointer"
                              : "opacity-60 cursor-not-allowed"
                          }`}
                          title={
                            s.available
                              ? undefined
                              : `Email already belongs to ${s.clientName}. One email can only be at one client; use a different address for this share.`
                          }
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {s.name || s.email}
                              </span>
                              {s.onCurrentClient ? (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                                  on this client
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">
                                  in use at {s.clientName}
                                </span>
                              )}
                              {!s.hasPassword && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                                  not activated
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              {s.email}
                              {s.title ? ` · ${s.title}` : ""}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {shareSuggestLoading && !shareSuggestOpen && (
                    <p className="text-[11px] text-gray-400">Searching contacts…</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="share-name">Name (optional)</Label>
                  <Input
                    id="share-name"
                    type="text"
                    placeholder="Jane Smith"
                    value={shareName}
                    onChange={(e) => setShareName(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={sharing || !shareEmail.trim()}
                  className="w-full"
                >
                  {sharing ? (
                    "Sending invite..."
                  ) : (
                    <><Send className="mr-2 h-4 w-4" /> Send Invite</>
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Add Candidate Dialog */}
          <Dialog
            open={showAddCandidate}
            onOpenChange={(open) => {
              setShowAddCandidate(open);
              if (!open) resetAddCandidateDialog();
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Candidate to Pipeline</DialogTitle>
              </DialogHeader>

              {/* Tabs: Search existing / Create new */}
              <div className="flex bg-gray-100 rounded-lg p-1 mb-3 text-sm">
                <button
                  type="button"
                  onClick={() => setAddMode("search")}
                  className={`flex-1 py-1.5 rounded-md font-medium transition ${
                    addMode === "search" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Search existing
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("create")}
                  className={`flex-1 py-1.5 rounded-md font-medium transition ${
                    addMode === "create" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Create new
                </button>
              </div>

              {addMode === "search" ? (
                <>
                  <Input
                    placeholder="Search candidates by name..."
                    value={candidateSearch}
                    onChange={(e) => searchCandidates(e.target.value)}
                  />
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {searching && <p className="text-sm text-gray-400 p-2">Searching...</p>}
                    {!searching && candidateSearch.length >= 2 && searchResults.length === 0 && (
                      <div className="p-3 text-sm text-gray-500 bg-gray-50 rounded-md flex items-center justify-between">
                        <span>No matches for &ldquo;{candidateSearch}&rdquo;.</span>
                        <button
                          type="button"
                          onClick={() => {
                            // Pre-fill the create form with the typed query as the name.
                            const parts = candidateSearch.trim().split(/\s+/);
                            setNewCandidate({
                              ...emptyNewCandidate,
                              firstName: parts[0] || "",
                              lastName: parts.slice(1).join(" ") || "",
                            });
                            setAddMode("create");
                          }}
                          className="text-indigo-600 font-medium hover:underline"
                        >
                          Create new →
                        </button>
                      </div>
                    )}
                    {searchResults.map((c) => {
                      const alreadyAdded = job.submissions.some((s: any) => s.candidateId === c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => !alreadyAdded && addCandidateToJob(c.id)}
                          disabled={alreadyAdded}
                          className="w-full text-left p-3 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <p className="font-medium">{c.firstName} {c.lastName}</p>
                          <p className="text-sm text-gray-500">
                            {[c.currentTitle, c.currentCompany].filter(Boolean).join(" at ")}
                          </p>
                          {alreadyAdded && <p className="text-xs text-gray-400">Already in pipeline</p>}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <form onSubmit={createAndAddCandidate} className="space-y-3">
                  {/* Resume quick-parse */}
                  <div className="border border-dashed border-indigo-200 bg-indigo-50/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="flex-1 flex items-center gap-2 cursor-pointer text-sm text-indigo-700 hover:underline">
                        <Upload className="h-4 w-4" />
                        {inlineResume ? inlineResume.name : "Upload resume to auto-fill"}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.txt"
                          onChange={(e) => setInlineResume(e.target.files?.[0] || null)}
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!inlineResume || inlineParsing}
                        onClick={parseInlineResume}
                      >
                        {inlineParsing ? "Parsing..." : "Parse"}
                      </Button>
                    </div>
                    {inlineParseMessage && (
                      <p className="text-xs text-indigo-600">{inlineParseMessage}</p>
                    )}
                  </div>

                  {createError && (
                    <div className="bg-red-50 text-red-600 text-sm p-2 rounded-md">{createError}</div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">First name *</Label>
                      <Input
                        value={newCandidate.firstName}
                        onChange={(e) => setNewCandidate({ ...newCandidate, firstName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Last name *</Label>
                      <Input
                        value={newCandidate.lastName}
                        onChange={(e) => setNewCandidate({ ...newCandidate, lastName: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input
                        type="email"
                        value={newCandidate.email}
                        className={
                          inlineFlaggedFields.has("email")
                            ? "border-indigo-400 ring-2 ring-indigo-100"
                            : ""
                        }
                        onChange={(e) => {
                          setNewCandidate({ ...newCandidate, email: e.target.value });
                          if (inlineDupes.length > 0) setInlineDupes([]);
                        }}
                        onBlur={(e) => void checkInlineDuplicates({ email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <div
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            void checkInlineDuplicates({ phone: newCandidate.phone });
                          }
                        }}
                      >
                        <PhoneInput
                          value={newCandidate.phone}
                          onChange={(val) => {
                            setNewCandidate({ ...newCandidate, phone: val });
                            if (inlineDupes.length > 0) setInlineDupes([]);
                          }}
                          highlighted={inlineFlaggedFields.has("phone")}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">LinkedIn URL</Label>
                    <Input
                      value={newCandidate.linkedIn}
                      className={
                        inlineFlaggedFields.has("LinkedIn")
                          ? "border-indigo-400 ring-2 ring-indigo-100"
                          : ""
                      }
                      onChange={(e) => {
                        setNewCandidate({ ...newCandidate, linkedIn: e.target.value });
                        if (inlineDupes.length > 0) setInlineDupes([]);
                      }}
                      onBlur={(e) => void checkInlineDuplicates({ linkedIn: e.target.value })}
                    />
                  </div>

                  {checkingInlineDupe && (
                    <p className="text-xs text-gray-400">Checking for duplicates…</p>
                  )}
                  {inlineDupes.length > 0 && (
                    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2 space-y-1">
                      <div className="flex items-center gap-1.5 px-1.5 pt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        <span className="text-[10.5px] font-medium text-gray-500 uppercase tracking-wider">
                          Already in your database — add to this pipeline?
                        </span>
                      </div>
                      {inlineDupes.map((m) => {
                        const channels = getInlineMatchedChannels(m);
                        const alreadyAdded = job.submissions.some(
                          (s: any) => s.candidateId === m.id
                        );
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white transition"
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
                            <div className="flex items-center gap-1 shrink-0">
                              <Link
                                href={`/candidates/${m.id}`}
                                target="_blank"
                                className="p-1.5 text-gray-400 hover:text-indigo-600 transition"
                                title="Open candidate"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                              {alreadyAdded ? (
                                <span className="text-[10px] text-gray-400 px-2">
                                  In pipeline
                                </span>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => addCandidateToJob(m.id)}
                                >
                                  Add to pipeline
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Current title</Label>
                      <Input
                        value={newCandidate.currentTitle}
                        onChange={(e) => setNewCandidate({ ...newCandidate, currentTitle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 relative">
                      <Label className="text-xs">Current company</Label>
                      <Input
                        value={newCandidate.currentCompany}
                        onChange={(e) => {
                          setNewCandidate({ ...newCandidate, currentCompany: e.target.value });
                          fetchCompanySuggestions(e.target.value);
                          setShowCompanySuggestions(true);
                        }}
                        onFocus={() => {
                          fetchCompanySuggestions(newCandidate.currentCompany);
                          setShowCompanySuggestions(true);
                        }}
                        onBlur={() => setTimeout(() => setShowCompanySuggestions(false), 150)}
                        autoComplete="off"
                      />
                      {showCompanySuggestions && companySuggestions.length > 0 && (
                        <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-44 overflow-y-auto">
                          {companySuggestions
                            .filter((s) => s.toLowerCase() !== newCandidate.currentCompany.toLowerCase())
                            .map((s) => (
                              <button
                                key={s}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setNewCandidate((prev) => ({ ...prev, currentCompany: s }));
                                  setShowCompanySuggestions(false);
                                }}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                              >
                                {s}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="newCandidateOwner">Owner</Label>
                    <SearchableSelect
                      value={newCandidate.ownerId}
                      onChange={(v) => setNewCandidate({ ...newCandidate, ownerId: v })}
                      includeAll={false}
                      placeholder={
                        teamMembers.length === 0 ? "Loading team…" : "Select an owner"
                      }
                      searchPlaceholder="Search teammates…"
                      minWidth={0}
                      className="w-full"
                      options={teamMembers.map<SearchableSelectOption>((m) => ({
                        value: m.id,
                        label:
                          (m.name || m.email) +
                          (m.id === currentUserId ? " (you)" : ""),
                        meta: m.name && m.email ? m.email : undefined,
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-gray-400">
                      The candidate will also appear in your Candidates list.
                    </p>
                    <Button type="submit" disabled={creating}>
                      {creating ? "Adding..." : "Create & Add"}
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="interviews">
            Interviews ({job.interviews?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes ({job.comments?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          {/* View toggle — Board for visual triage, List for fast
              stage changes and scanning many candidates at once. Same
              data + same transitions (onMove fires the share /
              placement / interview dialogs either way). */}
          <div className="flex justify-end mb-3">
            <div className="inline-flex rounded-md border bg-white p-0.5">
              {([
                { v: "kanban", label: "Board" },
                { v: "list", label: "List" },
              ] as const).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPipelineView(v)}
                  className={`px-3 py-1 text-xs font-medium rounded ${
                    pipelineView === v
                      ? "bg-indigo-600 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {pipelineView === "kanban" ? (
            <KanbanBoard
              stages={job.stages}
              submissions={job.submissions}
              onMove={moveSubmission}
              onToggleShare={toggleShare}
              onRemove={removeSubmission}
              clientName={job.client?.name}
              jobTitle={job.title}
            />
          ) : (
            <SubmissionsListView
              stages={job.stages}
              submissions={job.submissions}
              onMove={moveSubmission}
              onToggleShare={toggleShare}
              onRemove={removeSubmission}
              clientName={job.client?.name}
              jobTitle={job.title}
            />
          )}
          {pendingShareMove && (
            <ShareCandidateDialog
              open={true}
              onOpenChange={(open) => {
                if (!open) setPendingShareMove(null);
              }}
              submission={{
                id: pendingShareMove.submission.id,
                candidate: {
                  firstName: pendingShareMove.submission.candidate.firstName,
                  lastName: pendingShareMove.submission.candidate.lastName,
                  currentTitle: pendingShareMove.submission.candidate.currentTitle,
                },
                job: {
                  title: job.title,
                  client: job.client ? { name: job.client.name } : null,
                },
              }}
              onShared={async () => {
                // Share succeeded — now persist the stage move that triggered this.
                const move = pendingShareMove;
                setPendingShareMove(null);
                if (move) await persistMove(move.submission.id, move.stageId);
              }}
            />
          )}
          {pendingPlacement && (
            <PlacementDialog
              mode="congrats"
              open={true}
              onOpenChange={(open) => {
                if (!open) setPendingPlacement(null);
              }}
              submissionId={pendingPlacement.submission.id}
              candidateId={pendingPlacement.submission.candidate.id}
              candidateName={`${pendingPlacement.submission.candidate.firstName} ${pendingPlacement.submission.candidate.lastName}`}
              jobTitle={job.title}
              clientName={job.client?.name}
              defaults={{
                agreedSalary: pendingPlacement.submission.candidate.desiredSalary
                  ? String(pendingPlacement.submission.candidate.desiredSalary)
                  : undefined,
                feeAmount: job.feeAmount ? String(job.feeAmount) : undefined,
                feeType: (job.feeType as "PERCENTAGE" | "FLAT") || undefined,
                // Fallback chain: job-level (Staff Aug overrides) → client default → undefined.
                paymentTerms: job.paymentTerms ?? job.client?.defaultPaymentTerms ?? undefined,
                guaranteePeriod: job.guaranteePeriod ?? job.client?.defaultGuaranteePeriod ?? undefined,
                currency: job.currency ?? job.client?.defaultCurrency ?? "USD",
              }}
              onSuccess={() => {
                setPendingPlacement(null);
                fetchJob();
              }}
            />
          )}
          {pendingInterview && (
            <QuickInterviewDialog
              open={true}
              onOpenChange={(open) => {
                if (!open) setPendingInterview(null);
              }}
              submission={{
                id: pendingInterview.submission.id,
                candidateId: pendingInterview.submission.candidateId,
                candidate: {
                  firstName: pendingInterview.submission.candidate.firstName,
                  lastName: pendingInterview.submission.candidate.lastName,
                },
                job: { id: job.id, title: job.title },
              }}
              onScheduled={() => {
                setPendingInterview(null);
                fetchJob();
              }}
            />
          )}
          {pendingOffer && (
            <OfferNotesPrompt
              submissionId={pendingOffer.submission.id}
              candidateName={`${pendingOffer.submission.candidate.firstName} ${pendingOffer.submission.candidate.lastName}`}
              jobTitle={job.title}
              onClose={() => setPendingOffer(null)}
              onSaved={fetchJob}
            />
          )}
        </TabsContent>

        <TabsContent value="interviews" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500">
                {job.interviews?.length || 0} total interview{job.interviews?.length === 1 ? "" : "s"}
              </p>
              {/* List ↔ Calendar toggle. Same data, two ways to look
                  at it: list for a chronological feed (the default),
                  month grid for "what does next week look like". */}
              <div className="inline-flex bg-gray-100 rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setInterviewsView("list")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded ${
                    interviewsView === "list"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setInterviewsView("calendar")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded ${
                    interviewsView === "calendar"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Calendar
                </button>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreateInterview(true)}
              disabled={!job.submissions?.length}
              title={!job.submissions?.length ? "Add a candidate to this job first." : undefined}
            >
              <Plus className="h-4 w-4 mr-1" />
              Schedule interview
            </Button>
          </div>
          {interviewsView === "list" ? (
            <InterviewsList
              interviews={job.interviews || []}
              attendeeKind="candidate"
              onRowClick={setEditingInterview}
            />
          ) : (
            <InterviewsCalendar
              interviews={job.interviews || []}
              attendeeKind="candidate"
              onRowClick={setEditingInterview}
            />
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-3">
          {/* Job-level chat — same pattern as candidate notes. Lives
              under Comment.jobId, distinct from per-submission threads.
              Use this for standing notes about the search itself
              (client quirks, comp realities, hidden requirements) that
              don't belong tied to one candidate. */}
          <ChatNotes
            comments={(job.comments || []).slice().sort(
              (a: any, b: any) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )}
            jobId={params.id as string}
            onCommentAdded={fetchJob}
          />
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <div className="border rounded-xl bg-white p-5 space-y-5">
              {!editing ? (
                <>
                  {/* Key info — compact 2-column layout */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Client</p>
                      <Link
                        href={`/clients/${job.clientId}`}
                        className="text-sm font-semibold text-gray-900 hover:text-indigo-600 hover:underline"
                      >
                        {job.client.name}
                      </Link>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Status</p>
                      <Badge className={JOB_STATUS_COLORS[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Location</p>
                      <p className="text-sm font-semibold text-gray-900">{job.location || "—"}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Work Arrangement</p>
                      <Badge className={WORK_ARRANGEMENT_COLORS[job.workMode] || "bg-gray-100 text-gray-800"}>
                        {WORK_ARRANGEMENT_LABELS[job.workMode] || "On-site"}
                      </Badge>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Salary</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {job.salary ? (
                          <>{job.salary} <span className="text-xs font-normal text-gray-500">{job.currency || "USD"}</span></>
                        ) : "—"}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Fee</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {job.feeAmount ? (
                          job.feeType === "PERCENTAGE"
                            ? `${job.feeAmount}%`
                            : `$${Number(job.feeAmount).toLocaleString()} ${job.currency || "USD"}`
                        ) : "—"}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Assigned to</p>
                      <p className="text-sm font-semibold text-gray-900">{job.assignments?.map((a: any) => a.user.name).join(", ") || "—"}</p>
                    </div>
                  </div>

                  {/* Description — with proper paragraph spacing */}
                  {job.description && (
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">Description</p>
                      <div className="bg-gray-50 rounded-lg p-5 max-h-[500px] overflow-y-auto">
                        <div className="text-sm text-gray-800 leading-relaxed space-y-3">
                          {job.description.split(/\n\s*\n/).map((paragraph: string, i: number) => (
                            <div key={i}>
                              {paragraph.split("\n").map((line: string, j: number) => (
                                <p key={j} className={line.trim() === line.trim().toUpperCase() && line.trim().length > 3 ? "font-semibold text-gray-900 mt-3 first:mt-0" : ""}>
                                  {line}
                                </p>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-lg">Edit Job Details</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveEditing} disabled={saving}>
                        {saving ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Job Title *</Label>
                      <Input
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Client *</Label>
                        <select
                          className="w-full border rounded-md px-3 py-2 text-sm"
                          value={editForm.clientId}
                          onChange={(e) => setEditForm({ ...editForm, clientId: e.target.value })}
                        >
                          <option value={job.clientId}>{job.client.name}</option>
                          {clients.filter((c) => c.id !== job.clientId).map((c: any) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <select
                          className="w-full border rounded-md px-3 py-2 text-sm"
                          value={editForm.status}
                          onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        >
                          {JOB_STATUS_SELECTABLE.map((v) => (
                            <option key={v} value={v}>{JOB_STATUS_LABELS[v]}</option>
                          ))}
                          {/* Legacy CLOSED rows still need to render
                              their current value. Only shown when the
                              row was already CLOSED — once you flip it,
                              the option disappears. */}
                          {editForm.status === "CLOSED" && (
                            <option value="CLOSED">{JOB_STATUS_LABELS.CLOSED}</option>
                          )}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Openings</Label>
                        <Input
                          type="number"
                          min={1}
                          value={editForm.openings}
                          onChange={(e) => {
                            const v = e.target.value;
                            // Mirror the create flow: allow empty
                            // while editing, clamp on blur instead of
                            // snapping mid-keystroke.
                            setEditForm({
                              ...editForm,
                              openings: v === "" ? ("" as any) : Math.max(1, Number(v) || 1),
                            });
                          }}
                          onBlur={() => {
                            const v = editForm.openings as any;
                            if (v === "" || (typeof v === "number" && v < 1)) {
                              setEditForm({ ...editForm, openings: 1 });
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>Location</Label>
                        <Input
                          value={editForm.location}
                          onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                          placeholder="New York, NY"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Work Arrangement</Label>
                        <select
                          className="w-full border rounded-md px-3 py-2 text-sm"
                          value={editForm.workMode}
                          onChange={(e) => setEditForm({ ...editForm, workMode: e.target.value })}
                        >
                          <option value="ON_SITE">On-site</option>
                          <option value="REMOTE">Remote</option>
                          <option value="HYBRID">Hybrid</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Salary Range</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                            $
                          </span>
                          <Input
                            value={editForm.salary}
                            onChange={(e) => setEditForm({ ...editForm, salary: e.target.value })}
                            placeholder="150K - 180K"
                            className="pl-7"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Currency</Label>
                        <CurrencyPicker
                          value={editForm.currency}
                          onChange={(c) => setEditForm({ ...editForm, currency: c })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Fee Type</Label>
                        <select
                          className="w-full border rounded-md px-3 py-2 text-sm"
                          value={editForm.feeType}
                          onChange={(e) => setEditForm({ ...editForm, feeType: e.target.value })}
                        >
                          <option value="PERCENTAGE">Percentage</option>
                          <option value="FLAT">Flat Fee</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Fee Amount</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">
                            {editForm.feeType === "PERCENTAGE" ? "%" : "$"}
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            className="pl-7"
                            value={editForm.feeAmount}
                            onChange={(e) => setEditForm({ ...editForm, feeAmount: e.target.value })}
                            placeholder="25"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Description</Label>
                        <label className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${uploadingJD ? "opacity-50 pointer-events-none border-gray-200 text-gray-400" : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"}`}>
                          <Upload className="h-3 w-3" />
                          {uploadingJD ? "Re-parsing..." : "Re-parse from new file"}
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.txt"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (!confirm("Re-parsing will replace the description, and update Location / Work Arrangement if found in the new file. Continue?")) {
                                e.target.value = "";
                                return;
                              }
                              uploadJobDocument(file, "JOB_DESCRIPTION");
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <Textarea
                        rows={editForm.description ? 14 : 6}
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="Job description, requirements..."
                      />
                    </div>
                  </div>
                </>
              )}
          </div>

          {/* Job Description Document */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">Job Description</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const jdDoc = job.documents?.find((d: any) => d.category === "JOB_DESCRIPTION");
                if (jdDoc) {
                  return (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <a
                        href={`/api/documents/${jdDoc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 min-w-0 flex-1 rounded-md -m-1 p-1 hover:bg-gray-100 transition-colors"
                        title="Open file"
                      >
                        <FileText className="h-5 w-5 text-indigo-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate max-w-xs">{jdDoc.name}</p>
                          <p className="text-xs text-gray-400">{formatBytes(jdDoc.size)} · {formatDate(jdDoc.createdAt)}</p>
                        </div>
                      </a>
                      <div className="flex items-center gap-1 ml-2">
                        <a href={`/api/documents/${jdDoc.id}?download=1`} download>
                          <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>
                        </a>
                        <Button variant="ghost" size="sm" onClick={() => deleteJobDocument(jdDoc.id, true)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              <label className={`mt-3 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${uploadingJD ? "opacity-50 pointer-events-none" : "hover:border-indigo-300 hover:bg-indigo-50/50"}`}>
                <Upload className="h-6 w-6 text-gray-400 mb-2" />
                <span className="text-sm text-gray-500">
                  {uploadingJD ? "Uploading & parsing..." : (job.documents?.find((d: any) => d.category === "JOB_DESCRIPTION") ? "Replace Job Description" : "Upload Job Description")}
                </span>
                <span className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, TXT (max 10MB) — text will be extracted automatically</span>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadJobDocument(file, "JOB_DESCRIPTION");
                  e.target.value = "";
                }} />
              </label>
            </CardContent>
          </Card>

          {/* Additional Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">Additional Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {job.documents?.filter((d: any) => d.category === "ADDITIONAL").map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <a
                    href={`/api/documents/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 min-w-0 flex-1 rounded-md -m-1 p-1 hover:bg-gray-100 transition-colors"
                    title="Open file"
                  >
                    <FileText className="h-5 w-5 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate max-w-xs">{doc.name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(doc.size)} · {formatDate(doc.createdAt)}</p>
                    </div>
                  </a>
                  <div className="flex items-center gap-1 ml-2">
                    <a href={`/api/documents/${doc.id}?download=1`} download>
                      <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>
                    </a>
                    <Button variant="ghost" size="sm" onClick={() => deleteJobDocument(doc.id)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${uploadingAdditional ? "opacity-50 pointer-events-none" : "hover:border-indigo-300 hover:bg-indigo-50/50"}`}>
                <Upload className="h-6 w-6 text-gray-400 mb-2" />
                <span className="text-sm text-gray-500">{uploadingAdditional ? "Uploading..." : "Upload Document"}</span>
                <span className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, TXT, PNG, JPG (max 10MB)</span>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadJobDocument(file, "ADDITIONAL");
                  e.target.value = "";
                }} />
              </label>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showCreateInterview && (
        <InterviewDialog
          mode="create"
          open={true}
          onOpenChange={(open) => {
            if (!open) setShowCreateInterview(false);
          }}
          headerSubtitle={job.title}
          defaultTitle={`Interview — ${job.title}`}
          pickerLabel="Candidate"
          pickerEmptyHint="Add a candidate to this job first."
          pickerOptions={(job.submissions || []).map((s: any) => ({
            submissionId: s.id,
            candidateId: s.candidate.id,
            jobId: job.id,
            label: `${s.candidate.firstName} ${s.candidate.lastName}`,
          }))}
          onSaved={() => {
            setShowCreateInterview(false);
            fetchJob();
          }}
        />
      )}

      {editingInterview && (
        <InterviewDialog
          mode="edit"
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingInterview(null);
          }}
          headerSubtitle={`${editingInterview.candidate?.firstName || ""} ${editingInterview.candidate?.lastName || ""} · ${job.title}`}
          interview={editingInterview}
          onSaved={() => {
            setEditingInterview(null);
            fetchJob();
          }}
        />
      )}

      {/* Assign Recruiters Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Team Members</DialogTitle>
          </DialogHeader>

          {/* Current assignments */}
          {job.assignments?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Currently Assigned</p>
              <div className="space-y-1">
                {job.assignments.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
                        {a.user.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{a.user.name}</p>
                        <p className="text-xs text-gray-400">{a.user.role || "Recruiter"}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeAssignment(a.user.id)}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search to add */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Add Team Member</p>
            <Input
              placeholder="Search by name..."
              value={assignSearch}
              onChange={(e) => searchRecruiters(e.target.value)}
            />
            {assignResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-100 rounded-md">
                {assignResults.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => assignRecruiter(u.id)}
                    className="w-full text-left p-2.5 hover:bg-indigo-50 flex items-center gap-2 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold">
                      {u.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.role} · {u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {assignSearching && <p className="text-sm text-gray-400 p-2">Searching...</p>}
            {assignSearch && !assignSearching && assignResults.length === 0 && (
              <p className="text-sm text-gray-400 p-2">No matching team members found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

