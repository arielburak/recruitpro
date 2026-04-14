"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Share2, Check, Mail, Trash2, Send, Users, X, Upload, FileText, Download } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareName, setShareName] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState("");
  const [shareError, setShareError] = useState("");

  // Assign recruiters dialog state
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignSearch, setAssignSearch] = useState("");
  const [assignResults, setAssignResults] = useState<any[]>([]);
  const [assignSearching, setAssignSearching] = useState(false);

  // Document upload state
  const [uploadingJD, setUploadingJD] = useState(false);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${params.id}`);
    if (res.ok) setJob(await res.json());
    setLoading(false);
  }, [params.id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  async function searchCandidates(query: string) {
    setCandidateSearch(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/candidates?search=${encodeURIComponent(query)}&mine=false&limit=10`);
    const data = await res.json();
    setSearchResults(data.candidates || []);
    setSearching(false);
  }

  async function addCandidateToJob(candidateId: string) {
    await fetch(`/api/jobs/${params.id}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    setShowAddCandidate(false);
    setCandidateSearch("");
    setSearchResults([]);
    fetchJob();
  }

  async function moveSubmission(submissionId: string, stageId: string) {
    await fetch(`/api/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    fetchJob();
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
        fetchJob();
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
      // Clear the parsed description when JD is deleted
      await fetch(`/api/jobs/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: job.title,
          description: "",
          status: job.status,
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
          <Link href="/jobs">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{job.title}</h1>
              <Badge className={JOB_STATUS_COLORS[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
            </div>
            <p className="text-gray-500">
              {job.client.name}
              {job.location && ` - ${job.location}`}
              {job.salary && ` - ${job.salary}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
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
                <div className="space-y-2">
                  <Label htmlFor="share-email">Email Address *</Label>
                  <Input
                    id="share-email"
                    type="email"
                    placeholder="client@company.com"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    required
                  />
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
          <Dialog open={showAddCandidate} onOpenChange={setShowAddCandidate}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Candidate to Pipeline</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="Search candidates by name..."
                value={candidateSearch}
                onChange={(e) => searchCandidates(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {searching && <p className="text-sm text-gray-400 p-2">Searching...</p>}
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
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <KanbanBoard
            stages={job.stages}
            submissions={job.submissions}
            onMove={moveSubmission}
            onToggleShare={toggleShare}
            onRemove={removeSubmission}
          />
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Client</p>
                  <p className="font-medium">{job.client.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <Badge className={JOB_STATUS_COLORS[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                </div>
                {job.location && (
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p>{job.location}</p>
                  </div>
                )}
                {job.salary && (
                  <div>
                    <p className="text-sm text-gray-500">Salary</p>
                    <p>{job.salary}</p>
                  </div>
                )}
                {job.feeAmount && (
                  <div>
                    <p className="text-sm text-gray-500">Fee</p>
                    <p>{job.feeType === "PERCENTAGE" ? `${job.feeAmount}%` : `$${job.feeAmount}`}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Assigned</p>
                  <p>{job.assignments?.map((a: any) => a.user.name).join(", ") || "None"}</p>
                </div>
              </div>
              {job.description && (
                <div>
                  <p className="text-sm text-gray-500">Description</p>
                  <p className="whitespace-pre-wrap mt-1">{job.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

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
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-indigo-500" />
                        <div>
                          <p className="text-sm font-medium truncate max-w-xs">{jdDoc.name}</p>
                          <p className="text-xs text-gray-400">{formatBytes(jdDoc.size)} · {formatDate(jdDoc.createdAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <a href={`/api/documents/${jdDoc.id}`} target="_blank" rel="noopener noreferrer">
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
                  {uploadingJD ? "Uploading..." : (job.documents?.find((d: any) => d.category === "JOB_DESCRIPTION") ? "Replace Job Description" : "Upload Job Description")}
                </span>
                <span className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, TXT (max 10MB)</span>
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
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium truncate max-w-xs">{doc.name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(doc.size)} · {formatDate(doc.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer">
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
