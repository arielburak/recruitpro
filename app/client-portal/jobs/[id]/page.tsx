"use client";

import { useEffect, useState, use, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClientJobChat } from "@/components/client-portal/client-job-chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Building2,
  Send,
  Search,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  XCircle,
  Users,
  Mail,
  Phone,
  Plus,
  X,
  UserPlus,
  Copy,
  Check,
  Pencil,
  Save,
  FileText,
  Upload,
  Download,
  Trash2,
  Loader2,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { CurrencyPicker, getCurrency } from "@/components/ui/currency-picker";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CandidateTableRow } from "@/components/client-portal/candidate-row";
import { ReadOnlyPipeline } from "@/components/client-portal/read-only-pipeline";
import { formatDate } from "@/lib/utils";
import { isInvitedUserVisible } from "@/lib/firm-engagement-visibility";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

type InviteStatus = "accepted" | "pending" | "declined" | "email_sent";

type InviteSuggestion = {
  key: string;
  // Null when the suggestion is a legacy firm-only entry (pre-person-
  // level invite) — we know the firm but not a specific person.
  email: string | null;
  firmName: string | null;
  name: string | null;
  lastInvitedAt: string;
  status: InviteStatus;
  firmOnly: boolean;
  alreadyOnThisJob: boolean;
};

type InviteLookup = {
  email: string;
  shape: "invalid" | "valid";
  onPlatform?: boolean;
  name?: string | null;
  firmName?: string | null;
  alreadyOnThisJob?: boolean;
  alreadyOnThisJobStatus?: InviteStatus | null;
};

export default function ClientJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const currentClientUserId = (session?.user as any)?.id || "";
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deletingDoc, setDeletingDoc] = useState<{ id: string; name: string } | null>(null);
  const [withdrawingEngagement, setWithdrawingEngagement] = useState<{ id: string; label: string } | null>(null);
  const [cancellingInvite, setCancellingInvite] = useState<{ id: string; email: string } | null>(null);
  // Confirm-dialog state for cancelling a teammate's per-JO membership
  // invite. Distinct from cancellingInvite above (which is for firm-
  // level pending engagement invites) — different endpoint + different
  // copy. Wired from the X icon next to a pending member chip.
  const [cancellingMemberInvite, setCancellingMemberInvite] = useState<{ id: string; label: string } | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteSuggestions, setInviteSuggestions] = useState<InviteSuggestion[]>([]);
  const [inviteLookup, setInviteLookup] = useState<InviteLookup | null>(null);
  const [lookupPending, setLookupPending] = useState(false);
  // Active selection in the "Previously engaged firms" dropdown.
  // When set, the recruiter-contacts list filters to that firm only.
  // null = show all firms (default).
  const [selectedFirm, setSelectedFirm] = useState<string | null>(null);

  // Reset the form whenever the Invite dialog closes — covers ESC,
  // backdrop click, the X button, and any code path that sets
  // showInvite=false. Without this the user reopens the modal and
  // finds their last attempt still in the input, which feels broken.
  // inviteSuggestions stays — that's the loaded book of contacts, not
  // user input.
  useEffect(() => {
    if (!showInvite) {
      setInviteEmail("");
      setInviteMessage("");
      setInviteSuccess("");
      setInviteLookup(null);
      setSelectedFirm(null);
    }
  }, [showInvite]);

  // Expand/collapse por firma en Assigned Firms. Click en el header
  // de cada Card togglea ver los recruiters individualmente. State
  // in-memory (no localStorage) para que no se quede vieja info si
  // la lista de engagements cambia.
  const [expandedFirms, setExpandedFirms] = useState<Set<string>>(new Set());

  // Team member management state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberTitle, setMemberTitle] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberResult, setMemberResult] = useState<{ type: "success" | "error"; message: string; link?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Same reset pattern as the Invite dialog above. The Add Member
  // panel toggles open/closed inline (not a Dialog), but the UX
  // hazard is identical: half-finished form persists across opens and
  // reads as broken.
  useEffect(() => {
    if (!showAddMember) {
      setMemberName("");
      setMemberTitle("");
      setMemberEmail("");
      setMemberResult(null);
    }
  }, [showAddMember]);

  // Per-JO access management. Sidebar shows the current member list;
  // clicking "Manage" opens a dialog with checkboxes for the whole
  // team. Empty member list = the legacy "everyone can see this job"
  // state, surfaced as a hint at the top of the card.
  const [showManageAccess, setShowManageAccess] = useState(false);
  const [accessIds, setAccessIds] = useState<string[]>([]);
  const [savingAccess, setSavingAccess] = useState(false);

  function openManageAccess() {
    const ids = (job?.members || [])
      .map((m: any) => m.clientUser?.id)
      .filter((id: any): id is string => typeof id === "string");
    setAccessIds(ids);
    setShowAddMember(false);
    setMemberResult(null);
    setShowManageAccess(true);
  }

  function toggleAccessId(id: string) {
    setAccessIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function saveAccess() {
    if (savingAccess) return;
    setSavingAccess(true);
    try {
      const res = await fetch(`/api/client-portal/jobs/${id}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: accessIds }),
      });
      if (res.ok) {
        setShowManageAccess(false);
        await fetchJob();
      }
    } catch {}
    setSavingAccess(false);
  }

  // Quick-add an existing ClientUser as member of this Job — sin
  // pasar por el form de invite + email. PUT /members con currentIds
  // + el nuevo asi reusamos la misma logica de diff + notif.
  const [addingExistingId, setAddingExistingId] = useState<string | null>(null);
  async function addExistingMember(clientUserId: string) {
    if (addingExistingId) return;
    setAddingExistingId(clientUserId);
    try {
      const currentIds = (job?.members || [])
        .map((m: any) => m.clientUser?.id)
        .filter((x: any): x is string => typeof x === "string");
      const res = await fetch(`/api/client-portal/jobs/${id}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: [...currentIds, clientUserId] }),
      });
      if (res.ok) {
        setShowAddMember(false);
        setMemberName("");
        setMemberTitle("");
        setMemberEmail("");
        setMemberResult(null);
        await fetchJob();
      }
    } catch {}
    setAddingExistingId(null);
  }

  // Cancel a teammate invite the user just sent. The endpoint reuses
  // the same /members PUT so the "creator stays" rule, the diff +
  // notification logic etc. all live in one place. We compute the new
  // memberIds client-side as "current minus the one being cancelled"
  // — cheap, no extra endpoint needed.
  async function cancelMemberInvite(memberId: string) {
    const currentIds = (job?.members || [])
      .map((m: any) => m.clientUser?.id)
      .filter((x: any): x is string => typeof x === "string");
    const nextIds = currentIds.filter((x: string) => x !== memberId);
    try {
      const res = await fetch(`/api/client-portal/jobs/${id}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: nextIds }),
      });
      if (res.ok) await fetchJob();
    } catch {}
  }

  // Candidates for this job + the client's pipeline stages, used by
  // the read-only pipeline view that mirrors the agency's kanban.
  const [jobCandidates, setJobCandidates] = useState<any[]>([]);
  const [pipelineStages, setPipelineStages] = useState<any[]>([]);
  // Toggle between the pipeline (kanban) and the flat candidate list.
  const [candidatesView, setCandidatesView] = useState<"pipeline" | "list">("pipeline");
  // Tab in the main column. Mirrors the agency-side job page (Pipeline /
  // Notes / Details / Documents) so the client doesn't have to scroll
  // a page-high stack to find anything. Pipeline is the default tab
  // because that's the question the hiring manager comes to answer.
  const [activeTab, setActiveTab] = useState<"pipeline" | "notes" | "details" | "documents">("pipeline");

  // Documents state
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploadingJD, setUploadingJD] = useState(false);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);
  const additionalFileInputRef = useRef<HTMLInputElement>(null);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    requirements: "",
    location: "",
    salaryRange: "",
    salaryCurrency: "USD",
    jobType: "Full-time",
    workMode: "ON_SITE",
    status: "OPEN",
  });

  function startEditing() {
    setEditForm({
      title: job.title || "",
      description: job.description || "",
      requirements: job.requirements || "",
      location: job.location || "",
      salaryRange: job.salaryRange || "",
      salaryCurrency: job.salaryCurrency || "USD",
      jobType: job.jobType || "Full-time",
      workMode: job.isRemote ? "REMOTE" : "ON_SITE",
      status: job.status || "OPEN",
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await fetch(`/api/client-portal/jobs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditing(false);
        fetchJob();
      }
    } catch {}
    setSaving(false);
  }

  useEffect(() => {
    fetchJob();
    fetchTeam();
    fetchDocuments();
    fetchJobCandidates();
    fetchPipelineStages();
  }, [id]);

  // Debounced lookup: as the user types an email, resolve it against the
  // platform so we can show "Found — Nick Cuello at Alphabridge" or "No
  // account — we'll email them a signup link" before they hit Send.
  // Skipped when the input doesn't look like an email or matches one of
  // the suggestions (which already carry richer info).
  useEffect(() => {
    const raw = inviteEmail.trim().toLowerCase();
    if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      setInviteLookup(null);
      setLookupPending(false);
      return;
    }
    const matchingSuggestion = inviteSuggestions.find((s) => s.email && s.email === raw);
    if (matchingSuggestion) {
      setInviteLookup(null);
      setLookupPending(false);
      return;
    }
    setLookupPending(true);
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ email: raw, clientJobId: id });
        const res = await fetch(`/api/client-portal/invite-lookup?${qs.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as InviteLookup;
          // Guard against a stale response winning over a newer typed
          // value — only commit if the email we asked about is still
          // the one in the input.
          if (data.email === inviteEmail.trim().toLowerCase()) {
            setInviteLookup(data);
          }
        }
      } catch {}
      setLookupPending(false);
    }, 400);
    return () => {
      clearTimeout(t);
      setLookupPending(false);
    };
  }, [inviteEmail, id, inviteSuggestions]);

  // Auto-clear the selected firm chip when the typed email clearly
  // doesn't belong to it. Two signals:
  //   1. The email matches a known suggestion attached to a different
  //      firm (immediate — no round-trip needed).
  //   2. The live lookup resolved a firmName that differs from the
  //      selected one.
  // We deliberately do NOT clear on a partial / unmatched email so the
  // recruiter can still invite a brand-new person at the selected firm
  // without losing their picked context mid-typing.
  useEffect(() => {
    if (!selectedFirm) return;
    const raw = inviteEmail.trim().toLowerCase();
    if (!raw) return;
    const suggestion = inviteSuggestions.find((s) => s.email && s.email === raw);
    if (suggestion?.firmName && suggestion.firmName !== selectedFirm) {
      setSelectedFirm(null);
      return;
    }
    if (
      inviteLookup &&
      inviteLookup.email === raw &&
      inviteLookup.firmName &&
      inviteLookup.firmName !== selectedFirm
    ) {
      setSelectedFirm(null);
    }
  }, [inviteEmail, selectedFirm, inviteSuggestions, inviteLookup]);

  async function fetchJobCandidates() {
    try {
      const res = await fetch(`/api/client-portal/candidates?flat=true&clientJobId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setJobCandidates(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function fetchPipelineStages() {
    try {
      const res = await fetch("/api/client-portal/pipeline-stages");
      if (res.ok) {
        const data = await res.json();
        setPipelineStages(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  async function fetchDocuments() {
    try {
      const res = await fetch(`/api/client-portal/jobs/${id}/documents`);
      if (res.ok) setDocuments(await res.json());
    } catch {}
  }

  async function uploadDocument(file: File, category: "JOB_DESCRIPTION" | "ADDITIONAL") {
    const setUploading = category === "JOB_DESCRIPTION" ? setUploadingJD : setUploadingAdditional;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      const res = await fetch(`/api/client-portal/jobs/${id}/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Upload failed");
      } else {
        fetchDocuments();
        // If it was a JD, refresh the job to get the newly parsed description
        if (category === "JOB_DESCRIPTION") {
          fetchJob();
        }
      }
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(docId: string) {
    await fetch(`/api/client-portal/jobs/${id}/documents?documentId=${docId}`, {
      method: "DELETE",
    });
    fetchDocuments();
  }

  async function fetchJob() {
    try {
      const res = await fetch(`/api/client-portal/jobs`);
      if (res.ok) {
        const jobs = await res.json();
        const found = jobs.find((j: any) => j.id === id);
        if (found) {
          setJob(found);
          setLoading(false);
          return;
        }

        // Fallback: the id in the URL might actually be an agency
        // Job.id (stale notification link from before we fixed the
        // notif builders to use ClientJob.id). Ask /go to resolve
        // it via sourceJobId or accepted FirmEngagement and bounce
        // to the right URL. If /go also can't resolve, we fall
        // through to the "Job not found" state below.
        try {
          const goRes = await fetch(`/api/client-portal/go?jobId=${id}`);
          if (goRes.ok) {
            const { path } = await goRes.json();
            if (path && path !== "/client-portal/dashboard") {
              router.replace(path);
              return;
            }
          }
        } catch {}

        setJob(null);
      }
    } catch {}
    setLoading(false);
  }

  async function fetchTeam() {
    try {
      const res = await fetch("/api/client-portal/team");
      if (res.ok) setTeamMembers(await res.json());
    } catch {}
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!memberName.trim() || !memberEmail.trim()) return;
    setAddingMember(true);
    setMemberResult(null);
    try {
      // Job-scoped endpoint: handles three cases (new email → portal
      // invite + this Job's access; existing user → grant + email;
      // already a member → noop). The flat /api/client-portal/team
      // path was only adding people at the team level, never granting
      // access to THIS Job, so they didn't actually see the search.
      const res = await fetch(`/api/client-portal/jobs/${id}/add-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: memberName.trim(),
          email: memberEmail.trim(),
          title: memberTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMemberResult({ type: "error", message: data.error || "Failed to add" });
      } else {
        const msg =
          data.mode === "invited"
            ? "Member invited and added to this job."
            : data.mode === "granted"
              ? "Added to this job. We let them know by email."
              : "Already on this search.";
        setMemberResult({
          type: "success",
          message: msg,
          link: data.inviteUrl,
        });
        setMemberName("");
        setMemberTitle("");
        setMemberEmail("");
        fetchTeam();
        fetchJob();
      }
    } catch {
      setMemberResult({ type: "error", message: "Something went wrong" });
    }
    setAddingMember(false);
  }

  async function inviteFirm() {
    setInviting(true);
    setInviteSuccess("");
    try {
      const res = await fetch("/api/client-portal/invite-firm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientJobId: id,
          email: inviteEmail,
          message: inviteMessage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteSuccess(data.error || "Failed to invite");
      } else {
        setInviteSuccess(
          data.pending
            ? "Signup email sent — they'll join and see this job on first login."
            : "Invitation sent by email and in-app. Waiting for their response."
        );
        setInviteEmail("");
        setInviteMessage("");
        setInviteLookup(null);
        // Pull the fresh job (so the new row appears in Assigned Firms)
        // AND the updated suggestions book (so the person you just
        // invited shows up for reuse on the next job).
        fetchJob();
        loadInviteSuggestions();
      }
    } catch {
      setInviteSuccess("Something went wrong");
    }
    setInviting(false);
  }

  async function withdrawEngagement(engagementId: string) {
    const res = await fetch(`/api/client-portal/engagements/${engagementId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      fetchJob();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not withdraw invitation");
    }
  }

  async function withdrawPendingInvite(pendingId: string) {
    const res = await fetch(`/api/client-portal/pending-invites/${pendingId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      fetchJob();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Could not cancel invitation");
    }
  }

  async function loadInviteSuggestions() {
    try {
      const res = await fetch(`/api/client-portal/invite-suggestions?clientJobId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setInviteSuggestions(Array.isArray(data) ? data : []);
      }
    } catch {}
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center">
        <p className="text-gray-500">Job not found.</p>
        <Link href="/client-portal/dashboard" className="text-emerald-600 hover:underline text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-700",
    ACCEPTED: "bg-green-50 text-green-700",
    DECLINED: "bg-red-50 text-red-600",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link
        href="/client-portal/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      {/* Job Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            {job.location && <span>{job.location}</span>}
            {job.jobType && <span>· {job.jobType}</span>}
            {job.isRemote && <Badge variant="secondary" className="text-xs">Remote</Badge>}
            <span>· Posted {formatDate(job.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit hidden when the search was mirrored from an agency
              Job — that side owns the source of truth. */}
          {!editing && !job.createdByAgency && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={startEditing}>
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          )}
          <Badge className={`text-sm ${job.status === "OPEN" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
            {job.status}
          </Badge>
        </div>
      </div>

      {/* Provenance banner removido por feedback: cuando el cliente
          mira su propio job no necesita que le digan "tu agencia lo
          armo". Confundia mas de lo que aportaba. La restriccion de
          edicion sigue intacta (botton Edit gated en createdByAgency
          arriba); solo se quito el texto explicativo de "set up by". */}

      {/* Stacked layout — pipeline + tabs take the full width up top
          because that's what the hiring manager actually came for;
          team / access / firms surfaces sit below in a 3-col strip.
          The old 2/3 + 1/3 split was squeezing the kanban into a
          cramped column while the sidebar carried mostly admin
          actions the user reaches for occasionally. */}
      <div className="space-y-6">
        <div className="space-y-4">
          {editing ? (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">Edit Job</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1 text-xs" onClick={saveEdit} disabled={saving}>
                      <Save className="h-3 w-3" />
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Job Title *</Label>
                  <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea rows={10} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                </div>

                <div className="space-y-2">
                  <Label>Requirements</Label>
                  <Textarea rows={5} value={editForm.requirements} onChange={(e) => setEditForm({ ...editForm, requirements: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <CurrencyPicker
                      compact
                      value={editForm.salaryCurrency}
                      onChange={(c) => setEditForm({ ...editForm, salaryCurrency: c })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Salary Range ({getCurrency(editForm.salaryCurrency).symbol})</Label>
                  <Input value={editForm.salaryRange} onChange={(e) => setEditForm({ ...editForm, salaryRange: e.target.value })} placeholder="e.g. 150K - 200K" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Job Type</Label>
                    <select className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm"
                      value={editForm.jobType} onChange={(e) => setEditForm({ ...editForm, jobType: e.target.value })}>
                      {["Full-time", "Part-time", "Contract", "Temporary", "Internship"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Work Arrangement</Label>
                    <select className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm"
                      value={editForm.workMode} onChange={(e) => setEditForm({ ...editForm, workMode: e.target.value })}>
                      <option value="ON_SITE">On-site</option>
                      <option value="REMOTE">Remote</option>
                      <option value="HYBRID">Hybrid</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select className="flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm"
                      value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      <option value="OPEN">Open</option>
                      <option value="FILLED">Filled</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Pipeline lives as its own section above the tabs — the
                  recruiter wants the kanban prominent + always visible
                  (parity with the agency-side intent). Notes / Details
                  / Documents fall into a separate tabs strip below so
                  the secondary panes don't compete with the pipeline
                  for the primary surface. */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-700">
                    Pipeline
                    {jobCandidates.length > 0 ? ` · ${jobCandidates.length}` : ""}
                  </h2>
                  <div className="flex items-center gap-3">
                    {jobCandidates.length > 0 && (
                      <div className="inline-flex rounded-md border bg-white p-0.5">
                        {(["pipeline", "list"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setCandidatesView(v)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                              candidatesView === v
                                ? "bg-emerald-600 text-white"
                                : "text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {v === "pipeline" ? "Pipeline" : "List"}
                          </button>
                        ))}
                      </div>
                    )}
                    <Link
                      href={`/client-portal/candidates?clientJobId=${id}`}
                      className="text-xs text-emerald-600 hover:underline"
                    >
                      View all →
                    </Link>
                  </div>
                </div>
                <Card>
                  <CardContent className="p-0">
                    {jobCandidates.length === 0 ? (
                      <div className="p-8 text-center">
                        <Users className="block h-8 w-8 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500">No candidates shared yet.</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Your recruiting firms will share candidates here as they find them.
                        </p>
                      </div>
                    ) : candidatesView === "pipeline" ? (
                      <div className="p-4">
                        <ReadOnlyPipeline
                          stages={pipelineStages}
                          submissions={jobCandidates}
                        />
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Candidate</TableHead>
                            <TableHead>Stage</TableHead>
                            <TableHead>Firm</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Shared</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {jobCandidates.map((row) => (
                            <CandidateTableRow
                              key={row.submissionId}
                              row={row}
                              showJob={false}
                              onRated={fetchJobCandidates}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Tabs
                value={activeTab === "pipeline" ? "notes" : activeTab}
                onValueChange={(v) => setActiveTab(v as typeof activeTab)}
              >
                <TabsList>
                  <TabsTrigger value="notes">
                    Notes{job?.comments?.length ? ` (${job.comments.length})` : ""}
                  </TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="documents">
                    Documents{documents.length > 0 ? ` (${documents.length})` : ""}
                  </TabsTrigger>
                </TabsList>

              {/* Notes tab — the chat-style thread for the client team.
                  Used to be always-visible above the page; moved here so
                  the page can open straight on Pipeline (the question
                  the hiring manager actually came for). */}
              <TabsContent value="notes" className="space-y-3">
                <ClientJobChat
                  jobId={id}
                  comments={job?.comments || []}
                  onCommentAdded={fetchJob}
                  currentClientUserId={currentClientUserId}
                  agencyTabs={(job?.engagements || [])
                    .filter(
                      (e: any) =>
                        e.status === "ACCEPTED" &&
                        e.jobId &&
                        // QA P2 (2026-06-16): mismo filtro que Assigned Firms
                        // y el dropdown del Invite Recruiter. Si la firma fue
                        // ocultada por invitedUser soft-released o org-mismatch,
                        // tampoco mostramos su chat tab — sino el cliente ve
                        // "Shared with Newells" sin tener forma de ver Newells
                        // en Assigned Firms.
                        isInvitedUserVisible(e.invitedUser, e.organization?.id),
                    )
                    .reduce((acc: any[], e: any) => {
                      // Dedupe por organizationId: si una firma tiene
                      // 2 engagements ACCEPTED (legacy data o doble
                      // accept), se mostraba "Shared with Morabits"
                      // dos veces. Nos quedamos con el primer
                      // agencyJobId que aparece — el resto de los
                      // comments del otro engagement quedan
                      // accesibles via el thread principal (todos
                      // apuntan a la misma firma).
                      const orgId = e.organization?.id || e.organizationId;
                      if (!orgId || acc.some((x) => x.organizationId === orgId)) return acc;
                      acc.push({
                        agencyJobId: e.jobId as string,
                        organizationId: orgId,
                        organizationName: e.organization?.name || "the agency",
                      });
                      return acc;
                    }, [])}
                />
              </TabsContent>

              {/* Details tab — description / requirements / salary. The
                  empty-state CTA also lives here so "Add details" is
                  always one click away. */}
              <TabsContent value="details" className="space-y-4">
                {job.description && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm text-gray-500">Description</CardTitle></CardHeader>
                    <CardContent><p className="text-sm whitespace-pre-wrap">{job.description}</p></CardContent>
                  </Card>
                )}
                {job.requirements && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm text-gray-500">Requirements</CardTitle></CardHeader>
                    <CardContent><p className="text-sm whitespace-pre-wrap">{job.requirements}</p></CardContent>
                  </Card>
                )}
                {job.salaryRange && (
                  <Card>
                    <CardContent className="p-4">
                      <span className="text-sm text-gray-500">Salary Range: </span>
                      <span className="font-medium">{job.salaryRange}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {getCurrency(job.salaryCurrency).flag} {job.salaryCurrency || "USD"}
                      </span>
                    </CardContent>
                  </Card>
                )}
                {!job.description && !job.requirements && !job.salaryRange && (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <p className="text-sm text-gray-400 mb-2">No description added yet</p>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={startEditing}>
                        <Pencil className="h-3 w-3" />
                        Add Details
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Documents tab — JD file + additional attachments. Both
                  upload-enabled because right now every ClientJob is
                  authored by the client (postedById is always a
                  ClientUser). Read-only-when-agency-authored will land
                  when we add the agency-pushed Job flow. */}
              <TabsContent value="documents" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Job Description File
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const jdDoc = documents.find((d) => d.category === "JOB_DESCRIPTION");
                      if (jdDoc) {
                        return (
                          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="h-5 w-5 text-emerald-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{jdDoc.name}</p>
                                <p className="text-xs text-gray-400">{(jdDoc.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <a href={jdDoc.downloadUrl || jdDoc.url} target="_blank" rel="noopener noreferrer" download>
                                <Button variant="ghost" size="sm"><Download className="h-4 w-4" /></Button>
                              </a>
                              {/* Delete only when the search lives on
                                  the client side. Agency-mirrored docs
                                  belong to the firm. */}
                              {!job.createdByAgency && isAdmin && (
                                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => setDeletingDoc({ id: jdDoc.id, name: jdDoc.name })}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      }
                      // No JD yet. Show the upload affordance only when
                      // this client team owns the search. For agency-
                      // mirrored ones we just show a soft empty-state.
                      if (job.createdByAgency) {
                        return (
                          <div className="border border-dashed rounded-lg p-5 text-center text-xs text-gray-400">
                            No JD shared yet. Your recruiting firm will upload it on their side.
                          </div>
                        );
                      }
                      return (
                        <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-5 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors">
                          {uploadingJD ? (
                            <Loader2 className="h-5 w-5 text-emerald-500 animate-spin mb-2" />
                          ) : (
                            <Upload className="h-5 w-5 text-gray-400 mb-2" />
                          )}
                          <span className="text-sm text-gray-500">{uploadingJD ? "Uploading..." : "Upload Job Description"}</span>
                          <span className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT (max 10MB)</span>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.txt"
                            disabled={uploadingJD}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadDocument(file, "JOB_DESCRIPTION");
                              e.target.value = "";
                            }}
                          />
                        </label>
                      );
                    })()}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Additional Documents
                    </CardTitle>
                    {!job.createdByAgency && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          disabled={uploadingAdditional}
                          onClick={() => additionalFileInputRef.current?.click()}
                        >
                          {uploadingAdditional ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          {uploadingAdditional ? "Uploading..." : "Add"}
                        </Button>
                        <input
                          ref={additionalFileInputRef}
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                          disabled={uploadingAdditional}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadDocument(file, "ADDITIONAL");
                            e.target.value = "";
                          }}
                        />
                      </>
                    )}
                  </CardHeader>
                  <CardContent>
                    {documents.filter((d) => d.category === "ADDITIONAL").length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">No additional documents</p>
                    ) : (
                      <div className="space-y-2">
                        {documents.filter((d) => d.category === "ADDITIONAL").map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="h-4 w-4 text-gray-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{doc.name}</p>
                                <p className="text-[11px] text-gray-400">{(doc.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <a href={doc.downloadUrl || doc.url} target="_blank" rel="noopener noreferrer" download>
                                <Button variant="ghost" size="sm"><Download className="h-3.5 w-3.5" /></Button>
                              </a>
                              {!job.createdByAgency && isAdmin && (
                                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => setDeletingDoc({ id: doc.id, name: doc.name })}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        {/* Supporting cards below the main pipeline. Three-column on
            large screens, stacked on mobile. Used to be a permanent
            right sidebar; moved here so the pipeline gets the full
            width up top. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Your Internal Team — hidden while the Job access panel is
              in edit mode below, because that surface already lists
              the same people with explicit access checkboxes. Showing
              both side-by-side just duplicates the roster. */}
          {/* "Your Team" panel removed: redundant with Job Access
              (which already shows who on the client team can see
              this search) and with Assigned Firms (which covers the
              recruiter side). The "Manage" button on Job access is
              the one place a hiring contact needs to add or remove
              teammates for this specific JO. */}

          {/* Job access — quien del equipo cliente puede ver esta search.
              Card unificado con los dos flows que antes vivian separados:
              "Invite a teammate" (sumar gente nueva por email) y "Manage"
              (acotar/extender entre los que ya tienen cuenta). Ambos
              hablan de "colaborar con mi equipo en esta search", asi que
              compartir un solo header + body conmutable evita la
              fragmentacion de la version anterior con dos cards. Modos
              mutuamente excluyentes — abrir uno cierra el otro. */}
          {teamMembers.length > 1 && (
            <Card>
              {/* Header: title + ONE primary CTA "Invite teammate". El
                  "Manage" baja al body como link discreto para no
                  pelear por el ancho del header en la columna angosta
                  del grid de soporte — la version con dos botones
                  rompia el titulo en dos lineas. "Invite teammate" mas
                  explicito que "Invite" solo, asi se entiende sin
                  contexto que es para sumar a alguien del equipo
                  cliente (no para invitar a una firma, que es Assigned
                  Firms al lado). */}
              {/* Header con wrap controlado: title siempre completo
                  (sin truncate), boton baja a la linea siguiente si
                  no entra a lo ancho. Asi en la columna angosta del
                  grid de soporte el header se ve "Job access" arriba
                  + "Invite teammate" debajo, en vez de "Job acc..."
                  cortado. */}
              <CardHeader className="flex flex-row flex-wrap items-center justify-between space-y-0 pb-2 gap-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 whitespace-nowrap">
                  <Users className="h-4 w-4 text-emerald-600 shrink-0" />
                  Job access
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs shrink-0 whitespace-nowrap"
                  onClick={() => {
                    const next = !showAddMember;
                    setShowAddMember(next);
                    setMemberResult(null);
                    if (next) setShowManageAccess(false);
                  }}
                >
                  {showAddMember ? (
                    <>
                      <X className="h-3 w-3" />
                      Cancel
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      Invite teammate
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent className="pt-1">
                {/* Invite mode: arranca con sugerencias del equipo
                    (ClientUsers ya registrados que NO son members aun)
                    + form para invitar email nuevo abajo. Si todos los
                    teammates ya estan en la search, solo se ve el form
                    (los chips arriba ya cubren al resto del equipo). */}
                {showAddMember && (() => {
                  const memberIdSet = new Set<string>(
                    (job?.members || [])
                      .map((m: any) => m.clientUser?.id)
                      .filter(Boolean),
                  );
                  const q = memberEmail.trim().toLowerCase();
                  const available = (teamMembers || [])
                    .filter((u: any) => u.isActive !== false)
                    .filter((u: any) => !memberIdSet.has(u.id))
                    .filter((u: any) => {
                      if (!q) return true;
                      const n = (u.name || "").toLowerCase();
                      const e = (u.email || "").toLowerCase();
                      return n.includes(q) || e.includes(q);
                    });
                  return (
                    <div className="space-y-3 mb-3">
                      {available.length > 0 && (
                        <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100 max-h-48 overflow-y-auto">
                          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium px-3 pt-2">
                            From your team
                          </p>
                          {available.map((u: any) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => addExistingMember(u.id)}
                              disabled={addingExistingId === u.id}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <div className="min-w-0 flex-1 text-left">
                                <p className="font-medium text-gray-900 truncate">
                                  {u.name || u.email}
                                </p>
                                <p className="text-[11px] text-gray-500 truncate">{u.email}</p>
                              </div>
                              <span className="text-xs text-emerald-700 font-medium shrink-0">
                                {addingExistingId === u.id ? "Adding…" : "Add"}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      <form onSubmit={addMember} className="p-3 bg-gray-50 rounded-lg space-y-2">
                        {available.length > 0 && (
                          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                            Or invite someone new
                          </p>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs">Name *</Label>
                          <Input
                            value={memberName}
                            onChange={(e) => setMemberName(e.target.value)}
                            placeholder="Jane Smith"
                            className="text-sm h-8"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Role</Label>
                          <Input
                            value={memberTitle}
                            onChange={(e) => setMemberTitle(e.target.value)}
                            placeholder="e.g. Hiring Manager"
                            className="text-sm h-8"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Email *</Label>
                          <Input
                            type="email"
                            value={memberEmail}
                            onChange={(e) => setMemberEmail(e.target.value)}
                            placeholder="jane@company.com"
                            className="text-sm h-8"
                            required
                          />
                        </div>
                        <Button
                          type="submit"
                          size="sm"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5 h-8 text-xs"
                          disabled={addingMember}
                        >
                          <Mail className="h-3 w-3" />
                          {addingMember ? "Adding..." : "Send Invite"}
                        </Button>
                        {memberResult && (
                          <div
                            className={`text-xs p-2 rounded ${
                              memberResult.type === "success"
                                ? "bg-green-50 text-green-700"
                                : "bg-red-50 text-red-600"
                            }`}
                          >
                            <p>{memberResult.message}</p>
                            {memberResult.link && (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <input
                                  readOnly
                                  value={memberResult.link}
                                  className="flex-1 bg-white border rounded px-1.5 py-0.5 text-[10px] text-gray-500 truncate"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(memberResult.link!);
                                    setCopiedLink(true);
                                    setTimeout(() => setCopiedLink(false), 2000);
                                  }}
                                  className="shrink-0 p-0.5 rounded hover:bg-green-100"
                                >
                                  {copiedLink ? (
                                    <Check className="h-3 w-3 text-green-600" />
                                  ) : (
                                    <Copy className="h-3 w-3 text-gray-400" />
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </form>
                    </div>
                  );
                })()}

                {!showAddMember && !showManageAccess && (
                  (job?.members?.length || 0) === 0 ? (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                      Everyone on your team can see this job. Click <span className="font-medium">Manage</span> to restrict it to specific people, or <span className="font-medium">Invite</span> to add someone new.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(job?.members || []).map((m: any) => {
                        const isCreator = job?.postedById === m.clientUser.id;
                        const isPending = !!m.clientUser.isPending;
                        return (
                          <span
                            key={m.clientUser.id}
                            className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg ${
                              isPending
                                ? "bg-amber-50 text-amber-800 border border-dashed border-amber-300"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                            title={m.clientUser.email}
                          >
                            {m.clientUser.name}
                            {isCreator && (
                              <span className="text-[11px] text-emerald-600/70 font-normal">
                                (owner)
                              </span>
                            )}
                            {isPending && (
                              <span className="text-[10px] uppercase tracking-wider text-amber-600 font-medium">
                                pending
                              </span>
                            )}
                            {/* Cancel × — only for pending invites and
                                only when the chip isn't the creator
                                (the creator stays a member by rule;
                                cancelling them would just bounce). */}
                            {isPending && !isCreator && isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCancellingMemberInvite({
                                    id: m.clientUser.id,
                                    label: m.clientUser.name || m.clientUser.email,
                                  })
                                }
                                className="ml-1 text-amber-600 hover:text-rose-600"
                                title="Cancel invite"
                                aria-label={`Cancel invite for ${m.clientUser.name || m.clientUser.email}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Manage link — bottom-right del card como ya pidio
                    el usuario, label simple "Manage" (la frase larga
                    "Manage who can see this search" se leia rara). El
                    contexto se entiende porque vive adentro de Job
                    access. */}
                {!showAddMember && !showManageAccess && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={openManageAccess}
                      className="text-xs text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline"
                    >
                      Manage
                    </button>
                  </div>
                )}

                {showManageAccess && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-gray-500">
                      Tick the people who should see this job. Unchecking everyone reverts to the legacy &quot;visible to the whole team&quot; state — useful if you accidentally restricted it.
                    </p>
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                      {teamMembers
                        .filter((m: any) => m.isActive !== false)
                        .map((m: any) => {
                          const checked = accessIds.includes(m.id);
                          const isCreator = job?.postedById === m.id;
                          return (
                            <label
                              key={m.id}
                              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                                isCreator ? "bg-gray-50" : "hover:bg-gray-50"
                              }`}
                              title={isCreator ? "Always a member — the job's creator can't be removed." : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={checked || isCreator}
                                disabled={isCreator}
                                onChange={() => toggleAccessId(m.id)}
                                className="rounded border-gray-300"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-gray-900 truncate">
                                  {m.name}
                                  {isCreator && (
                                    <span className="ml-1.5 text-[10px] uppercase tracking-wider text-gray-400">
                                      creator
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-gray-500 truncate">{m.email}</p>
                              </div>
                            </label>
                          );
                        })}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setShowManageAccess(false)}
                        disabled={savingAccess}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs bg-emerald-600 hover:bg-emerald-700"
                        onClick={saveAccess}
                        disabled={savingAccess}
                      >
                        {savingAccess ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recruiting Firms */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-indigo-600" />
                Assigned Firms
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                onClick={() => {
                  const next = !showInvite;
                  setShowInvite(next);
                  if (next) loadInviteSuggestions();
                }}
              >
                <Plus className="h-3 w-3" />
                Invite
              </Button>
            </CardHeader>
            <CardContent>
              {/* SINGLE SOURCE OF TRUTH — el filter defensivo se
                  aplica una sola vez al inicio del card y la const
                  resultante alimenta stats + lista + empty-state.
                  Antes, los stats contaban engagements crudos y la
                  lista filtraba — generaba "2 Active · 1 card"
                  cuando un user inactivo se escondia. Mismo criterio
                  vive en isInvitedUserVisible (lib/firm-engagement-
                  visibility.ts) para que el server-side de
                  invite-suggestions use exactamente el mismo filtro. */}
              {(() => {
                const visibleEngagements = (job.engagements || []).filter(
                  (e: any) => isInvitedUserVisible(e.invitedUser, e.organization?.id),
                );
                const pendingInvites = job.pendingFirmInvites || [];
                const firmsByStatus = new Map<string, "ACCEPTED" | "PENDING" | "DECLINED">();
                for (const e of visibleEngagements) {
                  const orgId = e.organization?.id;
                  if (!orgId) continue;
                  const current = firmsByStatus.get(orgId);
                  if (e.status === "ACCEPTED") {
                    firmsByStatus.set(orgId, "ACCEPTED");
                  } else if (e.status === "PENDING" && current !== "ACCEPTED") {
                    firmsByStatus.set(orgId, "PENDING");
                  } else if (!current) {
                    firmsByStatus.set(orgId, "DECLINED");
                  }
                }
                const statuses = Array.from(firmsByStatus.values());
                const accepted = statuses.filter((s) => s === "ACCEPTED").length;
                const pending =
                  statuses.filter((s) => s === "PENDING").length + pendingInvites.length;
                const declined = statuses.filter((s) => s === "DECLINED").length;
                const totalRows = visibleEngagements.length + pendingInvites.length;
                if (totalRows === 0) return null;
                return (
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1 bg-green-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-green-700">{accepted}</p>
                      <p className="text-[10px] text-green-600">Active</p>
                    </div>
                    <div className="flex-1 bg-amber-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-amber-700">{pending}</p>
                      <p className="text-[10px] text-amber-600">Pending</p>
                    </div>
                    <div className="flex-1 bg-rose-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-rose-700">{declined}</p>
                      <p className="text-[10px] text-rose-600">Rejected</p>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const visibleEngagements = (job.engagements || []).filter(
                  (e: any) => isInvitedUserVisible(e.invitedUser, e.organization?.id),
                );
                return visibleEngagements.length + (job.pendingFirmInvites?.length || 0) === 0;
              })() ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  No recruiters invited yet. Click Invite to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    // Dedupe por firma: si la misma firma tiene
                    // multiples engagements (un row por recruiter
                    // invitado), aparecian N cards iguales con el
                    // mismo "candidates shared" (firmCandidateCounts
                    // esta keyed por organization.id, no por
                    // engagement.id). Una card por firma, con la
                    // lista de recruiters adentro.
                    // Filtro defensivo via helper compartido — mismo
                    // criterio que el server-side de invite-suggestions
                    // (ver lib/firm-engagement-visibility.ts). Cuando
                    // el invitedUser apunta a una org distinta (bug
                    // aburak) o esta inactivo (soft-released), skip.
                    // Aceptamos invitedUser null como firm-level legacy.
                    const byOrg = new Map<string, { firm: any; engagements: any[] }>();
                    for (const e of job.engagements || []) {
                      if (!isInvitedUserVisible(e.invitedUser, e.organization?.id)) {
                        continue;
                      }
                      const k = e.organization.id;
                      const g = byOrg.get(k);
                      if (g) g.engagements.push(e);
                      else byOrg.set(k, { firm: e.organization, engagements: [e] });
                    }
                    return Array.from(byOrg.values()).map((group) => {
                      const candidateCount = job.firmCandidateCounts?.[group.firm.id] || 0;
                      const accepted = group.engagements.filter((e) => e.status === "ACCEPTED");
                      const pending = group.engagements.filter((e) => e.status === "PENDING");
                      const declined = group.engagements.filter((e) => e.status === "DECLINED");
                      // Status agregado: prioridad ACCEPTED > PENDING > DECLINED.
                      const aggregatedStatus =
                        accepted.length > 0 ? "ACCEPTED" : pending.length > 0 ? "PENDING" : "DECLINED";
                      const earliestInvitedAt = group.engagements
                        .map((e) => e.invitedAt)
                        .sort()[0];
                      const recruiterCount = group.engagements.length;
                      const isExpanded = expandedFirms.has(group.firm.id);
                      const toggleExpanded = () => {
                        setExpandedFirms((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.firm.id)) next.delete(group.firm.id);
                          else next.add(group.firm.id);
                          return next;
                        });
                      };
                      // Engagements ordenados al expandir: aceptados
                      // arriba, pendientes en medio, declinados al
                      // final. Dentro de cada bucket, el mas reciente
                      // primero.
                      const sortedEngagements = [
                        ...accepted,
                        ...pending,
                        ...declined,
                      ].sort((a, b) => {
                        if (a.status !== b.status) return 0;
                        return new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime();
                      });
                      return (
                        <div key={group.firm.id} className="bg-gray-50 rounded-lg overflow-hidden">
                          {/* Header clickeable — toggle accordion */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={toggleExpanded}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleExpanded();
                              }
                            }}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Collapse" : "Expand"} recruiters for ${group.firm.name}`}
                            className="p-2.5 cursor-pointer hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                                  <Building2 className="h-4 w-4 text-indigo-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">
                                    {group.firm.name}
                                  </p>
                                  <p className="text-[10px] text-gray-400 truncate">
                                    {recruiterCount} recruiter{recruiterCount === 1 ? "" : "s"} · Invited {formatDate(earliestInvitedAt)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge className={`text-[10px] ${statusColor[aggregatedStatus]}`}>
                                  {aggregatedStatus === "PENDING" && <Clock className="h-3 w-3 mr-1" />}
                                  {aggregatedStatus === "ACCEPTED" && <CheckCircle className="h-3 w-3 mr-1" />}
                                  {aggregatedStatus === "DECLINED" && <XCircle className="h-3 w-3 mr-1" />}
                                  {aggregatedStatus.toLowerCase()}
                                </Badge>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-400" />
                                )}
                              </div>
                            </div>
                            {/* Summary debajo del header: candidates +
                                pending count, solo cuando hay accepted */}
                            {aggregatedStatus === "ACCEPTED" && (
                              <div className="ml-10 mt-1 space-y-0.5">
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                  <Users className="h-3 w-3 shrink-0" />
                                  {candidateCount} candidate{candidateCount !== 1 ? "s" : ""} shared
                                </span>
                                {pending.length > 0 && (
                                  <p className="text-[10px] text-amber-600">
                                    +{pending.length} pending invite{pending.length === 1 ? "" : "s"}
                                  </p>
                                )}
                              </div>
                            )}
                            {aggregatedStatus === "PENDING" && (
                              <p className="ml-10 mt-1 text-[10px] text-amber-600">
                                Waiting for response{pending.length > 1 ? ` (${pending.length} recruiters)` : ""}...
                              </p>
                            )}
                          </div>
                          {/* Lista de recruiters dentro de la firma —
                              uno por engagement, con su propio status
                              y boton Withdraw (solo para PENDING). */}
                          {isExpanded && (
                            <div className="border-t border-gray-200 divide-y divide-gray-200">
                              {sortedEngagements.map((eng: any) => {
                                // Three render shapes:
                                //   1) Registered recruiter (most common):
                                //      name arriba + email full abajo.
                                //   2) Pending signup (invitedEmail set,
                                //      invitedUser null because they
                                //      haven't signed up yet): email
                                //      arriba con break-all + chip
                                //      "pending sign-up" para que se
                                //      entienda que no es un nombre raro.
                                //   3) Firm-level legacy / post-cleanup
                                //      (invitedUser null + invitedEmail
                                //      null): mostramos "No specific
                                //      recruiter on record" en gris.
                                //      Sirve para los engagements de la
                                //      era pre-person-level o los que
                                //      limpiamos por el bug aburak.
                                const recruiterName = eng.invitedUser?.name || null;
                                const recruiterEmail =
                                  eng.invitedUser?.email || eng.invitedEmail || null;
                                const isFirmLevel = !recruiterName && !recruiterEmail;
                                const isPending = !recruiterName && !isFirmLevel;
                                const topLabel = isFirmLevel
                                  ? "No specific recruiter on record"
                                  : recruiterName || recruiterEmail || "Recruiter";
                                const initial = isFirmLevel
                                  ? (group.firm.name || "?")
                                      .trim()
                                      .split(/\s+/)
                                      .map((w: string) => w[0])
                                      .join("")
                                      .slice(0, 2)
                                      .toUpperCase() || "?"
                                  : (recruiterName || recruiterEmail || "?")
                                      .trim()
                                      .split(/\s+/)
                                      .map((w: string) => w[0])
                                      .join("")
                                      .slice(0, 2)
                                      .toUpperCase() || "?";
                                return (
                                  <div
                                    key={eng.id}
                                    className="px-2.5 py-2 bg-white flex items-start justify-between gap-2"
                                  >
                                    <div className="flex items-start gap-2 min-w-0 flex-1 ml-10">
                                      <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5">
                                        {initial}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p
                                          className={`text-xs font-medium ${isFirmLevel ? "text-gray-500 italic" : "text-gray-800"} ${isPending ? "break-all" : "truncate"}`}
                                          title={topLabel}
                                        >
                                          {topLabel}
                                          {isPending && (
                                            <span className="ml-2 text-[9px] font-normal text-amber-600 align-middle">
                                              pending sign-up
                                            </span>
                                          )}
                                          {isFirmLevel && (
                                            <span className="ml-2 text-[9px] font-normal text-gray-400 align-middle not-italic">
                                              firm-level
                                            </span>
                                          )}
                                        </p>
                                        {recruiterName && recruiterEmail && (
                                          <p
                                            className="text-[10px] text-gray-500 break-all"
                                            title={recruiterEmail}
                                          >
                                            {recruiterEmail}
                                          </p>
                                        )}
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                          Invited {formatDate(eng.invitedAt)}
                                          {eng.message ? (
                                            <span className="italic" title={eng.message}>
                                              {" · "}
                                              &quot;{eng.message.length > 40 ? eng.message.slice(0, 40) + "…" : eng.message}&quot;
                                            </span>
                                          ) : null}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Badge className={`text-[9px] px-1.5 py-0 h-4 ${statusColor[eng.status]}`}>
                                        {eng.status.toLowerCase()}
                                      </Badge>
                                      {eng.status === "PENDING" && isAdmin && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setWithdrawingEngagement({
                                              id: eng.id,
                                              label: eng.invitedUser?.name || group.firm.name,
                                            });
                                          }}
                                          className="text-[10px] text-gray-400 hover:text-red-600 underline-offset-2 hover:underline transition-colors"
                                        >
                                          Withdraw
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}

                  {/* Pending email invites — the recipient hasn't signed
                      up yet, so there's no FirmEngagement row. Surface
                      them here so the client sees who they still owe a
                      response from, and can cancel if they change their
                      mind. */}
                  {job.pendingFirmInvites?.map((p: any) => (
                    <div key={`pending_${p.id}`} className="p-2.5 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                            <Mail className="h-4 w-4 text-gray-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.email}</p>
                            <p className="text-[10px] text-gray-400 truncate">
                              Email sent {formatDate(p.createdAt)} · not registered yet
                            </p>
                          </div>
                        </div>
                        <Badge className="text-[10px] shrink-0 bg-gray-100 text-gray-600 border-gray-200">
                          <Clock className="h-3 w-3 mr-1" />
                          awaiting signup
                        </Badge>
                      </div>
                      <div className="ml-10 mt-1 flex justify-end">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setCancellingInvite({ id: p.id, email: p.email })}
                            className="text-[10px] text-gray-400 hover:text-red-600 underline-offset-2 hover:underline transition-colors"
                          >
                            Cancel invitation
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Collaborate-on-this-search panel — replaces the old "Your
              Team" panel we removed earlier. Same backend endpoint as
              the now-deleted dialog (POST /jobs/[id]/add-member),
              same fields, same outcomes — but scoped to this Job by
              construction so the invitee shows up as a member of THIS
              search the moment they accept. */}
          {/* "Invite a teammate" card eliminada — su flow vive ahora
              dentro de Job access (boton "Invite" en el header), asi
              ambas acciones (invitar nuevo email + manage existentes)
              comparten el mismo container que habla del mismo concepto:
              "quien de mi equipo colabora en esta search". */}

          {/* Invite Recruiter modal. Lives outside the right-rail
              column so it overlays the whole page instead of pushing
              the supporting cards around (the prior implementation
              was a <Card> embedded inline below "Assigned Firms",
              which looked off — it competed for column width with
              the firm list right above it and felt half-hidden). */}
          <Dialog open={showInvite} onOpenChange={setShowInvite}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Invite a Recruiter</DialogTitle>
                <DialogDescription>
                  Invite by email. The invitation reaches only that person — not
                  their whole firm — so you can pick a specific HM or POC.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {/* ─── Single input que hace todo: autocomplete por
                    name/email/firm + lookup en vivo de mails crudos.
                    Diseño rehecho 2026-06-10 (#18 del roadmap): el
                    dropdown separado de "Previously engaged firms" se
                    reemplazo por chips horizontales que filtran in-
                    place, y los 3 banners pastel apilados (lookup +
                    suggestions empty + status pills múltiples) se
                    consolidaron en una sola lista con una row destacada
                    "send signup invite to X" cuando aplica. */}
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Search by name, email, or firm…"
                  className="text-sm"
                  autoComplete="off"
                />

                {(() => {
                  // Construimos el modelo una sola vez: lista de firmas
                  // con conteo de contactos, lista filtrada de contacts
                  // según query + chip seleccionado, y el "row virtual"
                  // del lookup en vivo cuando el user tipeó un mail
                  // completo que no está en sugerencias.
                  type FirmSummary = { name: string; contactCount: number };
                  const firmMap = new Map<string, FirmSummary>();
                  for (const s of inviteSuggestions) {
                    if (!s.firmName || s.firmOnly) continue;
                    const existing = firmMap.get(s.firmName) || {
                      name: s.firmName,
                      contactCount: 0,
                    };
                    existing.contactCount += 1;
                    firmMap.set(s.firmName, existing);
                  }
                  const firmOptions = Array.from(firmMap.values()).sort((a, b) =>
                    a.name.localeCompare(b.name)
                  );

                  const q = inviteEmail.trim().toLowerCase();
                  const filteredContacts = inviteSuggestions.filter((s) => {
                    if (s.firmOnly) return false;
                    if (selectedFirm && s.firmName !== selectedFirm) return false;
                    if (!q) return true;
                    return (
                      (s.email || "").toLowerCase().includes(q) ||
                      (s.firmName || "").toLowerCase().includes(q) ||
                      (s.name || "").toLowerCase().includes(q)
                    );
                  });

                  // Live-lookup virtual row: solo se renderea cuando el
                  // user tipeó un mail completo que NO está en las
                  // sugerencias (sino el row aparece dos veces). El
                  // visual del row matchea exactamente el formato de
                  // los demás — la única diferencia es el icono Mail
                  // a la izquierda + el label "Send signup invite".
                  const typedEmailMatchesSuggestion = inviteSuggestions.some(
                    (s) => s.email && s.email === q,
                  );
                  const showLookupRow =
                    !typedEmailMatchesSuggestion &&
                    !!inviteLookup &&
                    inviteLookup.shape === "valid";

                  // Visibility del bloque entero: si no hay sugerencias
                  // posibles Y no hay query, no mostramos nada (el
                  // modal queda compacto). Si hay sugerencias o el
                  // user ya tipeó, mostramos.
                  const hasSomethingToShow =
                    filteredContacts.length > 0 || showLookupRow || lookupPending;
                  if (!hasSomethingToShow && firmOptions.length === 0) {
                    return null;
                  }

                  return (
                    <div className="space-y-2">
                      {/* Chips de firmas previamente engaged — solo si
                          hay 2+. Toggle filter, click en uno selecciona,
                          segundo click o click en "All" lo limpia. */}
                      {firmOptions.length >= 2 && (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedFirm(null)}
                            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                              !selectedFirm
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                            }`}
                          >
                            All firms
                          </button>
                          {firmOptions.map((f) => (
                            <button
                              key={f.name}
                              type="button"
                              onClick={() =>
                                setSelectedFirm(selectedFirm === f.name ? null : f.name)
                              }
                              className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                                selectedFirm === f.name
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                              }`}
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Lista unificada: sugerencias matched + opcional
                          row del lookup arriba del todo. Si la lista
                          quedó vacía y hay un query, no rendereamos
                          nada (el lookup row sí o sí cubre el caso
                          "send signup link"). */}
                      {(filteredContacts.length > 0 || showLookupRow || lookupPending) && (
                        <div className="rounded-md border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
                          {lookupPending && (
                            <div className="px-2.5 py-2 text-[11px] text-gray-400 flex items-center gap-1.5">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Checking…
                            </div>
                          )}
                          {showLookupRow && inviteLookup && (
                            <div className="px-2.5 py-2 bg-gray-50/60">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-gray-800 break-words flex items-center gap-1.5">
                                    {inviteLookup.alreadyOnThisJob ? (
                                      <Clock className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                    ) : inviteLookup.onPlatform ? (
                                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                    ) : (
                                      <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                    )}
                                    {inviteLookup.name || inviteLookup.email}
                                  </p>
                                  <p className="text-[11px] text-gray-500 break-all mt-0.5">
                                    {inviteLookup.email}
                                    {inviteLookup.firmName ? (
                                      <span className="text-gray-400"> · {inviteLookup.firmName}</span>
                                    ) : null}
                                  </p>
                                </div>
                                <span className="text-[10px] font-medium text-gray-500 shrink-0 mt-0.5 whitespace-nowrap">
                                  {inviteLookup.alreadyOnThisJob
                                    ? "Already on this job"
                                    : inviteLookup.onPlatform
                                    ? "On Recruiting ATS"
                                    : "New — we'll send a signup link"}
                                </span>
                              </div>
                            </div>
                          )}
                          {filteredContacts.map((s) => {
                            const selected = !!s.email && inviteEmail.trim().toLowerCase() === s.email;
                            // Pill simplificado (#18): un solo "Already
                            // engaged elsewhere" gris para los casos
                            // pending/declined/email-sent (la diferencia
                            // fina no le aporta al cliente). Solo
                            // separamos visualmente "on this job"
                            // porque cambia la acción (disable click).
                            const showElsewherePill =
                              !s.alreadyOnThisJob &&
                              s.status !== "accepted";
                            return (
                              <button
                                key={s.key}
                                type="button"
                                disabled={s.alreadyOnThisJob}
                                onClick={() => {
                                  if (s.alreadyOnThisJob) return;
                                  setInviteEmail(s.email || "");
                                }}
                                className={`w-full text-left px-2.5 py-2 transition-colors ${
                                  s.alreadyOnThisJob
                                    ? "opacity-60 cursor-not-allowed"
                                    : selected
                                    ? "bg-indigo-50"
                                    : "hover:bg-indigo-50/70"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className={`text-sm font-medium break-words ${selected ? "text-indigo-700" : "text-gray-800"}`}>
                                      {s.name || s.email}
                                    </p>
                                    <p className="text-[11px] text-gray-500 break-all mt-0.5">
                                      {s.name ? s.email : null}
                                      {s.name && !selectedFirm && s.firmName && (
                                        <span className="text-gray-400"> · </span>
                                      )}
                                      {!selectedFirm && s.firmName && <span>{s.firmName}</span>}
                                    </p>
                                  </div>
                                  {s.alreadyOnThisJob ? (
                                    <span className="text-[10px] font-medium text-indigo-600 shrink-0 mt-0.5 whitespace-nowrap">
                                      On this job
                                    </span>
                                  ) : showElsewherePill ? (
                                    <span className="text-[10px] font-medium text-gray-500 shrink-0 mt-0.5 whitespace-nowrap">
                                      Already engaged
                                    </span>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <Textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Add a message (optional)"
                  rows={2}
                  className="text-sm"
                />

                {(() => {
                  // Botón smart: el copy refleja la acción REAL que se
                  // va a disparar, no un genérico "Send Invitation".
                  //   · Sin email → "Send invitation" (disabled)
                  //   · Ya en este job → "Already on this job" (disabled)
                  //   · Match con recruiter on-platform → "Invite {first}"
                  //   · Mail crudo no en plataforma → "Send signup invite"
                  const emailNow = inviteEmail.trim().toLowerCase();
                  const matchingSuggestion = inviteSuggestions.find(
                    (s) => s.email && s.email === emailNow,
                  );
                  const blocked =
                    matchingSuggestion?.alreadyOnThisJob === true ||
                    inviteLookup?.alreadyOnThisJob === true;

                  let label = "Send invitation";
                  if (inviting) {
                    label = "Sending…";
                  } else if (blocked) {
                    label = "Already on this job";
                  } else if (emailNow) {
                    // Preferimos el nombre del suggestion si lo tenemos,
                    // sino el del lookup, sino fallback al email.
                    const nameFromSuggestion = matchingSuggestion?.name;
                    const nameFromLookup =
                      inviteLookup?.shape === "valid" ? inviteLookup.name : null;
                    const displayName = nameFromSuggestion || nameFromLookup;
                    const onPlatform =
                      matchingSuggestion ||
                      (inviteLookup?.shape === "valid" && inviteLookup.onPlatform);
                    if (onPlatform && displayName) {
                      // "Invite Pedro"
                      const first = displayName.trim().split(/\s+/)[0];
                      label = `Invite ${first}`;
                    } else if (onPlatform) {
                      label = "Send invitation";
                    } else {
                      label = "Send signup invite";
                    }
                  }

                  return (
                    <Button
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                      disabled={inviting || !inviteEmail || blocked}
                      onClick={() => inviteFirm()}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {label}
                    </Button>
                  );
                })()}

                {inviteSuccess && (
                  <p className="text-xs text-center text-emerald-600">{inviteSuccess}</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DeleteConfirmDialog
        open={!!deletingDoc}
        onOpenChange={(open) => { if (!open) setDeletingDoc(null); }}
        itemLabel={deletingDoc?.name || ""}
        itemKind="document"
        onConfirm={async () => {
          if (deletingDoc) await deleteDocument(deletingDoc.id);
          setDeletingDoc(null);
        }}
        confirmLabel="Yes, delete"
      />

      <DeleteConfirmDialog
        open={!!withdrawingEngagement}
        onOpenChange={(open) => { if (!open) setWithdrawingEngagement(null); }}
        itemLabel={`the invitation to ${withdrawingEngagement?.label || ""}`}
        onConfirm={async () => {
          if (withdrawingEngagement) await withdrawEngagement(withdrawingEngagement.id);
          setWithdrawingEngagement(null);
        }}
        confirmLabel="Yes, withdraw"
      />

      <DeleteConfirmDialog
        open={!!cancellingInvite}
        onOpenChange={(open) => { if (!open) setCancellingInvite(null); }}
        itemLabel={`the invitation to ${cancellingInvite?.email || ""}`}
        onConfirm={async () => {
          if (cancellingInvite) await withdrawPendingInvite(cancellingInvite.id);
          setCancellingInvite(null);
        }}
        confirmLabel="Yes, cancel"
      />

      {/* Cancel a teammate's per-JO membership invite. Hits the
          members PUT endpoint with the pending member removed — the
          server's diff logic handles the actual cancellation + the
          notification cleanup. */}
      <DeleteConfirmDialog
        open={!!cancellingMemberInvite}
        onOpenChange={(open) => { if (!open) setCancellingMemberInvite(null); }}
        itemLabel={cancellingMemberInvite?.label || ""}
        title={
          cancellingMemberInvite
            ? `Cancel the invite for ${cancellingMemberInvite.label}?`
            : undefined
        }
        description="They'll lose access to this search immediately. You can re-invite them later if needed."
        onConfirm={async () => {
          if (cancellingMemberInvite) await cancelMemberInvite(cancellingMemberInvite.id);
          setCancellingMemberInvite(null);
        }}
        confirmLabel="Yes, cancel invite"
      />
    </div>
  );
}

