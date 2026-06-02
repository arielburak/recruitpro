"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatNotes } from "@/components/chat-notes";
import {
  Edit,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Building,
  Briefcase,
  Trash2,
  Upload,
  FileText,
  Download,
  X,
  Plus,
  Share2,
  CheckCircle2,
  MessageSquare,
  Star,
} from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { formatDate, formatCurrency } from "@/lib/utils";
import { AssignToJobsDialog } from "@/components/assign-jobs-dialog";
import { ShareCandidateDialog } from "@/components/pipeline/share-candidate-dialog";
import { PlacementDialog } from "@/components/placements/placement-dialog";
import { QuickInterviewDialog } from "@/components/calendar/quick-interview-dialog";
import { InterviewDialog } from "@/components/interviews/interview-dialog";
import { InterviewsList } from "@/components/interviews/interviews-list";
import { InterviewsCalendar } from "@/components/interviews/interviews-calendar";

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  // Deep-link support: ?tab=notes&sub={submissionId} jumps straight
  // into the Notes tab with that submission's per-job chat selected.
  // Used by the message-icon shortcuts on /jobs/[id] kanban cards
  // and the candidates list view, so the recruiter goes from
  // "I want to see the chat for this person" to actually reading it
  // in one click.
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";
  const initialSub = searchParams.get("sub");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(initialSub);
  // Mirrors the board's pendingShareMove: when the recruiter changes
  // the stage to "Submitted" from this surface and the candidate
  // hasn't been shared with the client yet, we open the same Share
  // confirmation dialog instead of silently moving the stage. After
  // the share goes through, persistStageChange completes the move.
  const [pendingShareMove, setPendingShareMove] = useState<{
    submission: any;
    stageId: string;
  } | null>(null);
  // Same idea for Placed (open the PlacementDialog) and Interviewing
  // (open the QuickInterviewDialog). Pulls the dialogs from the board
  // so the UX is identical regardless of which surface fired the move.
  const [pendingPlacement, setPendingPlacement] = useState<{
    submission: any;
  } | null>(null);
  const [pendingInterview, setPendingInterview] = useState<{
    submission: any;
  } | null>(null);
  // Interviews tab — create-new and edit-existing both run through the
  // same CandidateInterviewDialog. `showCreateInterview` opens it in
  // create mode (with the candidate's submissions as the job picker);
  // `editingInterview` opens it in edit mode pre-filled from the row.
  const [showCreateInterview, setShowCreateInterview] = useState(false);
  const [interviewsView, setInterviewsView] = useState<"list" | "calendar">("list");
  const [editingInterview, setEditingInterview] = useState<any | null>(null);

  useEffect(() => {
    fetchCandidate();
  }, [params.id]);

  async function fetchCandidate() {
    const res = await fetch(`/api/candidates/${params.id}`);
    if (res.ok) {
      setCandidate(await res.json());
    }
    setLoading(false);
  }

  function getSubmissionComments(submissionId: string) {
    const sub = (candidate.submissions || []).find((s: any) => s.id === submissionId);
    if (!sub) return [];
    return [...(sub.comments || [])].sort(
      (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  function getActiveSubmission() {
    if (!candidate.submissions?.length) return null;
    const id = selectedSubmissionId || candidate.submissions[0]?.id;
    return candidate.submissions.find((s: any) => s.id === id) || candidate.submissions[0];
  }

  function getTotalCommentCount() {
    const perJob = (candidate.submissions || []).reduce(
      (sum: number, sub: any) => sum + (sub.comments?.length || 0),
      0
    );
    const candidateLevel = (candidate.comments || []).filter(
      (c: any) => !c.submissionId
    ).length;
    return perJob + candidateLevel;
  }

  async function deleteCandidate() {
    if (!confirm("Delete this candidate? This cannot be undone.")) return;
    await fetch(`/api/candidates/${params.id}`, { method: "DELETE" });
    router.push("/candidates");
  }

  // Inline stage change from the Jobs tab. We mirror the heavy guards
  // from /jobs/[id] moveSubmission for transitions that have side
  // effects:
  //   - Leaving "Placed" deletes the linked placement (server-side
  //     enforces it; we just confirm here so salary/fee data doesn't
  //     disappear silently).
  //   - Moving to "Submitted" without having shared the candidate
  //     yet opens the same share dialog the board uses, so the act
  //     of submitting to the client is never accidental.
  // Placed / Interviewing as constructive transitions still flip
  // plainly here — creating placements / scheduling interviews lives
  // on the job page where the recruiter has full context.
  async function changeSubmissionStage(submission: any, newStageId: string) {
    if (newStageId === submission.stageId) return;
    const newStage = submission.job.stages?.find((st: any) => st.id === newStageId);
    const leavingPlaced =
      submission.stage?.name === "Placed" && newStage?.name !== "Placed";
    if (leavingPlaced && submission.placement) {
      const ok = window.confirm(
        `This candidate has a placement on "${submission.job.title}". Moving out of "Placed" will permanently delete the placement (salary, fee, payment terms). Continue?`
      );
      if (!ok) return;
    }

    // Gate Submitted on the share confirmation when not yet shared.
    // The dialog handles the PATCH that flips isSharedWithClient + the
    // client notification + the share email; the stage move runs in
    // its onShared callback below.
    if (newStage?.name === "Submitted" && !submission.isSharedWithClient) {
      setPendingShareMove({ submission, stageId: newStageId });
      return;
    }

    // Placed → open PlacementDialog (congrats mode). The dialog flips
    // the stage to Placed server-side as part of creating the
    // placement record, so we don't PATCH the stage here.
    if (newStage?.name === "Placed" && !submission.placement) {
      setPendingPlacement({ submission });
      return;
    }

    // Interviewing → flip the stage first, then prompt to schedule.
    // Closing the dialog leaves the candidate at Interviewing with
    // no event; they can add one later from /calendar.
    if (newStage?.name === "Interviewing") {
      await persistStageChange(submission.id, newStageId);
      setPendingInterview({ submission });
      return;
    }

    await persistStageChange(submission.id, newStageId);
  }

  async function persistStageChange(submissionId: string, newStageId: string) {
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: newStageId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to change stage");
        return;
      }
      await fetchCandidate();
    } catch {
      alert("Failed to change stage");
    }
  }

  // Mirror /jobs/[id] page's toggleShare so the candidate's Jobs tab
  // can flip share state per submission. The share dialog handles the
  // "moving to Submitted" flow; this handler covers re-sharing or
  // stop-sharing on an existing submission without changing stages.
  async function toggleSubmissionShare(submissionId: string, shared: boolean) {
    await fetch(`/api/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSharedWithClient: shared }),
    });
    await fetchCandidate();
  }

  async function removeSubmissionFromJob(submissionId: string) {
    if (!confirm("Remove this candidate from the pipeline?")) return;
    await fetch(`/api/submissions/${submissionId}`, { method: "DELETE" });
    await fetchCandidate();
  }

  async function uploadDocument(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("candidateId", params.id as string);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      await fetchCandidate();
    } catch (err: any) {
      setUploadError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(id: string) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    fetchCandidate();
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!candidate) {
    return <p className="text-gray-500">Candidate not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton fallback="/candidates" />
          <div>
            <h1 className="text-2xl font-bold">
              {candidate.firstName} {candidate.lastName}
            </h1>
            <p className="text-gray-500">
              {[candidate.currentTitle, candidate.currentCompany]
                .filter(Boolean)
                .join(" at ")}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/candidates/${params.id}/edit`}>
            <Button variant="outline" size="sm">
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAssignDialog(true)}
            className="text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="h-4 w-4 mr-1" /> Assign to Jobs
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={deleteCandidate}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="submissions">
            Jobs ({candidate.submissions?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({candidate.documents?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes & Feedback ({getTotalCommentCount()})
          </TabsTrigger>
          <TabsTrigger value="interviews">
            Interviews ({candidate.interviews?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-500">
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {candidate.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <a
                      href={`mailto:${candidate.email}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {candidate.email}
                    </a>
                  </div>
                )}
                {candidate.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {candidate.phone}
                  </div>
                )}
                {candidate.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {candidate.location}
                  </div>
                )}
                {candidate.linkedIn && (
                  <div className="flex items-center gap-2 text-sm">
                    <ExternalLink className="h-4 w-4 text-gray-400" />
                    <a
                      href={candidate.linkedIn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      LinkedIn Profile
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-500">
                  Professional
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {candidate.currentTitle && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-gray-400" />
                    {candidate.currentTitle}
                  </div>
                )}
                {candidate.currentCompany && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building className="h-4 w-4 text-gray-400" />
                    {candidate.currentCompany}
                  </div>
                )}
                {candidate.currentSalary && (
                  <div className="text-sm">
                    <span className="text-gray-500">Current Salary:</span>{" "}
                    {formatCurrency(Number(candidate.currentSalary), candidate.salaryCurrency || "USD")}
                  </div>
                )}
                {candidate.desiredSalary && (
                  <div className="text-sm">
                    <span className="text-gray-500">Desired Salary:</span>{" "}
                    {formatCurrency(Number(candidate.desiredSalary), candidate.salaryCurrency || "USD")}
                  </div>
                )}
                {candidate.source && (
                  <div className="text-sm">
                    <span className="text-gray-500">Source:</span>{" "}
                    {candidate.source}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {candidate.skills?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-500">
                  Skills
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((s: string) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {candidate.summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-gray-500">
                  Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {candidate.summary}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="submissions" className="space-y-3">
          {candidate.submissions?.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Not submitted to any jobs yet.
              </CardContent>
            </Card>
          ) : (
            candidate.submissions?.map((sub: any) => {
              const isShared = !!sub.isSharedWithClient;
              const commentCount = sub._count?.comments || 0;
              const ratingCount = sub._count?.ratings || 0;
              return (
                <Card key={sub.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    {/* Job title + submitted date — keep the link to the
                        job page so the recruiter can still drill in for
                        the full pipeline / placement / interview UX. */}
                    <Link
                      href={`/jobs/${sub.job.id}`}
                      className="flex-1 min-w-0 group"
                    >
                      <h3 className="font-medium group-hover:text-indigo-600 group-hover:underline truncate">
                        {sub.job.title}
                      </h3>
                      {sub.job.client?.name && (
                        <p className="text-xs text-gray-400">{sub.job.client.name}</p>
                      )}
                      <p className="text-sm text-gray-500">
                        Submitted {formatDate(sub.createdAt)}
                      </p>
                    </Link>

                    {/* Per-row controls: mirror the columns of the job
                        page's List view so the recruiter doesn't have
                        to jump to the job to see share/activity state. */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Activity counters — only render when non-zero
                          so the row stays clean for fresh submissions. */}
                      {commentCount > 0 && (
                        <div className="flex items-center gap-2.5 text-xs text-gray-400">
                          <span className="flex items-center gap-0.5" title={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}>
                            <MessageSquare className="h-3 w-3" />
                            {commentCount}
                          </span>
                        </div>
                      )}

                      {/* Share state. "Shared" is a green chip with the
                          client's stage (when present); "Share" is a
                          neutral button that flips the flag. The full
                          share dialog still triggers when the recruiter
                          *moves* the candidate to Submitted via the
                          stage selector — this control just toggles an
                          already-existing submission's visibility. */}
                      {isShared ? (
                        <button
                          type="button"
                          onClick={() => toggleSubmissionShare(sub.id, false)}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-green-50 text-green-700 font-medium hover:bg-green-100 transition-colors"
                          title={
                            (sub.sharedAt ? `Shared on ${new Date(sub.sharedAt).toLocaleString()}` : "Shared with client") +
                            (sub.clientStage ? ` · Client sees: ${sub.clientStage.name}` : "") +
                            "\nClick to stop sharing"
                          }
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Shared
                          {sub.clientStage && (
                            <span
                              className="ml-1 text-[10px] font-semibold"
                              style={{ color: sub.clientStage.color }}
                            >
                              · {sub.clientStage.name}
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleSubmissionShare(sub.id, true)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                          title="Share with client"
                        >
                          <Share2 className="h-3 w-3" />
                          Share
                        </button>
                      )}

                      {/* Inline stage selector. Coloured to match the
                          active stage so it reads like a badge at a
                          glance, but stays a real <select> so the
                          keyboard / a11y story is the same as the
                          list view. */}
                      <select
                        value={sub.stageId}
                        onChange={(e) => {
                          e.stopPropagation();
                          void changeSubmissionStage(sub, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-medium border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        style={{ color: sub.stage.color, borderColor: sub.stage.color + "55" }}
                        aria-label={`Stage for ${sub.job.title}`}
                      >
                        {(sub.job.stages || []).map((st: any) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>

                      {/* Remove from this job. Symmetric with the list
                          view's trash icon — deletes the submission
                          (and any placement attached via the API's
                          existing guard) without leaving the page. */}
                      <button
                        type="button"
                        onClick={() => removeSubmissionFromJob(sub.id)}
                        className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove from this job"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-6 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition">
                <Upload className="h-6 w-6 text-gray-400 mb-2" />
                <span className="text-sm font-medium text-gray-700">
                  {uploading ? "Uploading..." : "Click to upload a file"}
                </span>
                <span className="text-xs text-gray-400 mt-1">
                  PDF, DOC, DOCX, TXT, PNG, JPG (max 10MB)
                </span>
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadDocument(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {uploadError && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
                  {uploadError}
                </div>
              )}
            </CardContent>
          </Card>

          {candidate.documents?.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500 text-sm">
                No documents uploaded yet.
              </CardContent>
            </Card>
          ) : (
            candidate.documents?.map((doc: any) => (
              <Card key={doc.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <a
                    href={`/api/documents/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 min-w-0 flex-1 rounded-md -m-1 p-1 hover:bg-gray-50 transition-colors"
                    title="Open file"
                  >
                    <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {doc.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatBytes(doc.size)} · {formatDate(doc.createdAt)}
                      </p>
                    </div>
                  </a>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    <a
                      href={`/api/documents/${doc.id}?download=1`}
                      download
                      className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="p-2 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600"
                      title="Delete"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-6">
          {/* Candidate-level notes — general info that applies across
              all jobs the candidate is in (preferences, allergies to
              remote, etc.). Stored on Comment.candidateId with
              submissionId=null. */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Candidate notes</h3>
              <span className="text-xs text-gray-400">General · applies to every job</span>
            </div>
            <ChatNotes
              comments={(candidate.comments || [])
                .filter((c: any) => !c.submissionId)
                .sort(
                  (a: any, b: any) =>
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                )}
              candidateId={candidate.id}
              onCommentAdded={fetchCandidate}
              heightClass="h-[260px]"
            />
          </div>

          {/* Per-job notes — the legacy/main chat: tabs for Internal
              + Client-visible, with a job picker when the candidate
              sits on more than one. */}
          {candidate.submissions?.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Assign this candidate to a job to start adding per-job notes.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Per-job notes</h3>
                <span className="text-xs text-gray-400">
                  Tied to a specific submission · Internal + Client-visible tabs
                </span>
              </div>
              {/* Job selector */}
              {candidate.submissions.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {candidate.submissions.map((sub: any) => {
                    const isActive = (selectedSubmissionId || candidate.submissions[0]?.id) === sub.id;
                    const commentCount = sub.comments?.length || 0;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => setSelectedSubmissionId(sub.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition ${
                          isActive
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="text-left">
                          <div className="font-medium">{sub.job.title}</div>
                          <div className="text-xs text-gray-400">{sub.job.client?.name || "No client"}</div>
                        </div>
                        {commentCount > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            isActive ? "bg-indigo-200 text-indigo-800" : "bg-gray-100 text-gray-500"
                          }`}>
                            {commentCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Context header */}
              {(() => {
                const activeSub = getActiveSubmission();
                if (!activeSub) return null;
                return (
                  <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    <span className="font-medium text-gray-700">{activeSub.job.title}</span>
                    <span className="text-gray-300">|</span>
                    <Building className="h-3.5 w-3.5" />
                    <span>{activeSub.job.client?.name || "No client"}</span>
                    <Badge
                      className="ml-auto text-[10px]"
                      style={{
                        backgroundColor: activeSub.stage.color + "20",
                        color: activeSub.stage.color,
                      }}
                    >
                      {activeSub.stage.name}
                    </Badge>
                  </div>
                );
              })()}

              {/* Chat */}
              <ChatNotes
                key={selectedSubmissionId || candidate.submissions[0]?.id}
                comments={getSubmissionComments(selectedSubmissionId || candidate.submissions[0]?.id)}
                submissionId={selectedSubmissionId || candidate.submissions[0]?.id}
                onCommentAdded={fetchCandidate}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="interviews" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500">
                {candidate.interviews?.length || 0} total interview{candidate.interviews?.length === 1 ? "" : "s"}
              </p>
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
              disabled={!candidate.submissions?.length}
              title={
                !candidate.submissions?.length
                  ? "Submit the candidate to a job first."
                  : undefined
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Schedule interview
            </Button>
          </div>
          {interviewsView === "list" ? (
            <InterviewsList
              interviews={candidate.interviews || []}
              attendeeKind="job"
              onRowClick={setEditingInterview}
            />
          ) : (
            <InterviewsCalendar
              interviews={candidate.interviews || []}
              attendeeKind="job"
              onRowClick={setEditingInterview}
            />
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-2">
          {candidate.activities?.map((a: any) => (
            <div key={a.id} className="flex items-start gap-3 text-sm py-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
              <div>
                <p>{a.description}</p>
                <p className="text-xs text-gray-400">
                  {formatDate(a.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <AssignToJobsDialog
        candidateId={params.id as string}
        candidateName={`${candidate.firstName} ${candidate.lastName}`}
        open={showAssignDialog}
        onClose={() => setShowAssignDialog(false)}
        onAssigned={fetchCandidate}
      />

      {pendingShareMove && (
        <ShareCandidateDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setPendingShareMove(null);
          }}
          submission={{
            id: pendingShareMove.submission.id,
            candidate: {
              firstName: candidate.firstName,
              lastName: candidate.lastName,
              currentTitle: candidate.currentTitle,
            },
            job: {
              title: pendingShareMove.submission.job.title,
              client: pendingShareMove.submission.job.client
                ? { name: pendingShareMove.submission.job.client.name }
                : null,
            },
          }}
          onShared={async () => {
            const move = pendingShareMove;
            setPendingShareMove(null);
            if (move) await persistStageChange(move.submission.id, move.stageId);
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
          candidateName={`${candidate.firstName} ${candidate.lastName}`}
          jobTitle={pendingPlacement.submission.job.title}
          clientName={pendingPlacement.submission.job.client?.name}
          defaults={{
            agreedSalary: candidate.desiredSalary
              ? String(candidate.desiredSalary)
              : undefined,
            feeAmount: pendingPlacement.submission.job.feeAmount
              ? String(pendingPlacement.submission.job.feeAmount)
              : undefined,
            feeType:
              (pendingPlacement.submission.job.feeType as "PERCENTAGE" | "FLAT") ||
              undefined,
            paymentTerms:
              pendingPlacement.submission.job.paymentTerms ??
              pendingPlacement.submission.job.client?.defaultPaymentTerms ??
              undefined,
            guaranteePeriod:
              pendingPlacement.submission.job.guaranteePeriod ??
              pendingPlacement.submission.job.client?.defaultGuaranteePeriod ??
              undefined,
            currency:
              pendingPlacement.submission.job.currency ??
              pendingPlacement.submission.job.client?.defaultCurrency ??
              "USD",
          }}
          onSuccess={() => {
            setPendingPlacement(null);
            fetchCandidate();
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
            candidateId: candidate.id,
            candidate: {
              firstName: candidate.firstName,
              lastName: candidate.lastName,
            },
            job: {
              id: pendingInterview.submission.job.id,
              title: pendingInterview.submission.job.title,
            },
          }}
          onScheduled={() => {
            setPendingInterview(null);
            fetchCandidate();
          }}
        />
      )}

      {showCreateInterview && (
        <InterviewDialog
          mode="create"
          open={true}
          onOpenChange={(open) => {
            if (!open) setShowCreateInterview(false);
          }}
          headerSubtitle={`${candidate.firstName} ${candidate.lastName}`}
          defaultTitle={`Interview — ${candidate.firstName} ${candidate.lastName}`}
          pickerLabel="Job"
          pickerEmptyHint="Submit this candidate to a job first."
          pickerOptions={(candidate.submissions || []).map((s: any) => ({
            submissionId: s.id,
            candidateId: candidate.id,
            jobId: s.job.id,
            label: s.job.title,
          }))}
          onSaved={() => {
            setShowCreateInterview(false);
            fetchCandidate();
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
          headerSubtitle={`${candidate.firstName} ${candidate.lastName} · ${editingInterview.job?.title || ""}`}
          interview={editingInterview}
          onSaved={() => {
            setEditingInterview(null);
            fetchCandidate();
          }}
        />
      )}
    </div>
  );
}
