"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Building2,
  Send,
  Search,
  CheckCircle,
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
import { formatDate } from "@/lib/utils";

type InviteSuggestion = {
  email: string;
  firmName: string | null;
  name: string | null;
  lastInvitedAt: string;
  alreadyOnThisJob: boolean;
};

export default function ClientJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [inviteSuggestions, setInviteSuggestions] = useState<InviteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Team member management state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberTitle, setMemberTitle] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberResult, setMemberResult] = useState<{ type: "success" | "error"; message: string; link?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Candidates for this job
  const [jobCandidates, setJobCandidates] = useState<any[]>([]);

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
  }, [id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function fetchJobCandidates() {
    try {
      const res = await fetch(`/api/client-portal/candidates?flat=true&clientJobId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setJobCandidates(Array.isArray(data) ? data : []);
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
    if (!confirm("Delete this document?")) return;
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
        setJob(found || null);
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
      const res = await fetch("/api/client-portal/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: memberName.trim(), email: memberEmail.trim(), title: memberTitle.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMemberResult({ type: "error", message: data.error || "Failed to add" });
      } else {
        setMemberResult({
          type: "success",
          message: data.reactivated ? "Team member reactivated!" : "Member invited!",
          link: data.inviteLink,
        });
        setMemberName("");
        setMemberTitle("");
        setMemberEmail("");
        fetchTeam();
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
        setInviteSuccess(data.sent ? "Email invitation sent!" : "Firm invited successfully!");
        setInviteEmail("");
        setInviteMessage("");
        fetchJob();
      }
    } catch {
      setInviteSuccess("Something went wrong");
    }
    setInviting(false);
  }

  async function withdrawEngagement(engagementId: string, label: string) {
    if (!confirm(`Withdraw the invitation to ${label}? They won't be able to accept it anymore.`)) return;
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

  async function withdrawPendingInvite(pendingId: string, email: string) {
    if (!confirm(`Cancel the pending invitation to ${email}?`)) return;
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
          {!editing && (
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left - Job Details */}
        <div className="lg:col-span-2 space-y-4">
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

              {/* Candidates shared for this job */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Candidates {jobCandidates.length > 0 && <span className="text-gray-400">({jobCandidates.length})</span>}
                  </CardTitle>
                  {jobCandidates.length > 0 && (
                    <Link href={`/client-portal/candidates?clientJobId=${id}`} className="text-xs text-emerald-600 hover:underline">
                      View all →
                    </Link>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {jobCandidates.length === 0 ? (
                    <div className="p-6 text-center">
                      <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">No candidates shared yet.</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Your recruiting firms will share candidates here as they find them.
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Stage</TableHead>
                          <TableHead>Firm</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Rating</TableHead>
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

              {/* Documents */}
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
                            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => deleteDocument(jdDoc.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

              {/* Additional Documents */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Additional Documents
                  </CardTitle>
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
                            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => deleteDocument(doc.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

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
            </>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Your Internal Team */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-600" />
                Your Team
              </CardTitle>
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setShowAddMember(!showAddMember); setMemberResult(null); }}>
                <UserPlus className="h-3 w-3" />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              {showAddMember && (
                <form onSubmit={addMember} className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
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
                    <Label className="text-xs">Job Title</Label>
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
                  <Button type="submit" size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5 h-8 text-xs" disabled={addingMember}>
                    <Mail className="h-3 w-3" />
                    {addingMember ? "Adding..." : "Send Invite"}
                  </Button>
                  {memberResult && (
                    <div className={`text-xs p-2 rounded ${memberResult.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      <p>{memberResult.message}</p>
                      {memberResult.link && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <input readOnly value={memberResult.link} className="flex-1 bg-white border rounded px-1.5 py-0.5 text-[10px] text-gray-500 truncate" />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(memberResult.link!);
                              setCopiedLink(true);
                              setTimeout(() => setCopiedLink(false), 2000);
                            }}
                            className="shrink-0 p-0.5 rounded hover:bg-green-100"
                          >
                            {copiedLink ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-gray-400" />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </form>
              )}
              {teamMembers.filter(m => m.isActive).length === 0 ? (
                <p className="text-sm text-gray-400 py-3 text-center">
                  No team members yet. Add colleagues to collaborate.
                </p>
              ) : (
                <div className="space-y-2">
                  {teamMembers.filter(m => m.isActive).map((member: any) => (
                    <div key={member.id} className="flex items-center gap-2.5 p-2 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                        {member.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                        {member.title && <p className="text-[10px] text-gray-500 truncate">{member.title}</p>}
                        <a href={`mailto:${member.email}`} className="text-[11px] text-emerald-600 hover:underline truncate block">{member.email}</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
              {/* Summary Stats */}
              {(() => {
                const pendingInvites = job.pendingFirmInvites || [];
                const accepted = (job.engagements || []).filter((e: any) => e.status === "ACCEPTED").length;
                const pending = (job.engagements || []).filter((e: any) => e.status === "PENDING").length + pendingInvites.length;
                const declined = (job.engagements || []).filter((e: any) => e.status === "DECLINED").length;
                const totalRows = (job.engagements?.length || 0) + pendingInvites.length;
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

              {(job.engagements?.length || 0) + (job.pendingFirmInvites?.length || 0) === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  No recruiters invited yet. Click Invite to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {job.engagements?.map((eng: any) => {
                    const candidateCount = job.firmCandidateCounts?.[eng.organization.id] || 0;
                    // Prefer the registered user's name when we have it
                    // (most engagements post-person-level invites). Fall
                    // back to the invited email, then — for legacy org-
                    // level rows — just the firm name.
                    const personLabel =
                      eng.invitedUser?.name || eng.invitedEmail || null;
                    const withdrawLabel = personLabel || eng.organization.name;
                    return (
                      <div key={eng.id} className="p-2.5 bg-gray-50 rounded-lg">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {personLabel || eng.organization.name}
                              </p>
                              <p className="text-[10px] text-gray-400 truncate">
                                {personLabel && eng.organization.name ? (
                                  <>{eng.organization.name} · </>
                                ) : null}
                                Invited {formatDate(eng.invitedAt)}
                              </p>
                            </div>
                          </div>
                          <Badge className={`text-[10px] shrink-0 ${statusColor[eng.status]}`}>
                            {eng.status === "PENDING" && <Clock className="h-3 w-3 mr-1" />}
                            {eng.status === "ACCEPTED" && <CheckCircle className="h-3 w-3 mr-1" />}
                            {eng.status === "DECLINED" && <XCircle className="h-3 w-3 mr-1" />}
                            {eng.status.toLowerCase()}
                          </Badge>
                        </div>
                        {eng.status === "ACCEPTED" && (
                          <div className="ml-10 mt-1 space-y-0.5">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Users className="h-3 w-3 shrink-0" />
                              {candidateCount} candidate{candidateCount !== 1 ? "s" : ""} shared
                            </span>
                            {eng.message && (
                              <p className="text-[10px] text-gray-400 italic truncate" title={eng.message}>
                                &quot;{eng.message}&quot;
                              </p>
                            )}
                          </div>
                        )}
                        {eng.status === "PENDING" && (
                          <div className="ml-10 mt-1 flex items-center justify-between gap-2">
                            <p className="text-[10px] text-amber-600">
                              Waiting for response...
                            </p>
                            <button
                              type="button"
                              onClick={() => withdrawEngagement(eng.id, withdrawLabel)}
                              className="text-[10px] text-gray-400 hover:text-red-600 underline-offset-2 hover:underline transition-colors"
                            >
                              Withdraw
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

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
                        <button
                          type="button"
                          onClick={() => withdrawPendingInvite(p.id, p.email)}
                          className="text-[10px] text-gray-400 hover:text-red-600 underline-offset-2 hover:underline transition-colors"
                        >
                          Cancel invitation
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invite Dialog */}
          {showInvite && (
            <Card className="border-emerald-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Invite a Recruiter</h4>
                  <button onClick={() => setShowInvite(false)}>
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>

                <p className="text-xs text-gray-500">
                  Invite by email. The invitation reaches only that person — not
                  their whole firm — so you can pick a specific HM or POC.
                </p>

                <div ref={suggestionsRef} className="relative">
                  <label className="text-xs text-gray-500 mb-1 block">Recruiter email</label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="recruiter@firm.com"
                    className="text-sm"
                    autoComplete="off"
                  />
                  {showSuggestions && (() => {
                    const q = inviteEmail.trim().toLowerCase();
                    const matches = inviteSuggestions.filter((s) =>
                      !q ||
                      s.email.toLowerCase().includes(q) ||
                      (s.firmName || "").toLowerCase().includes(q) ||
                      (s.name || "").toLowerCase().includes(q)
                    );
                    if (matches.length === 0) return null;
                    return (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                          Previously invited
                        </div>
                        {matches.map((s) => (
                          <button
                            key={s.email}
                            type="button"
                            disabled={s.alreadyOnThisJob}
                            onClick={() => {
                              setInviteEmail(s.email);
                              setShowSuggestions(false);
                            }}
                            className={`w-full text-left px-3 py-2 transition-colors ${
                              s.alreadyOnThisJob
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:bg-indigo-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {s.name || s.email}
                                </p>
                                <p className="text-[11px] text-gray-500 truncate">
                                  {s.email}
                                  {s.firmName && <span className="text-gray-400"> · {s.firmName}</span>}
                                </p>
                              </div>
                              {s.alreadyOnThisJob && (
                                <span className="text-[10px] font-medium text-indigo-600 shrink-0">
                                  already on this job
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <Textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Add a message (optional)"
                  rows={2}
                  className="text-sm"
                />

                <Button
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  disabled={inviting || !inviteEmail}
                  onClick={() => inviteFirm()}
                >
                  <Send className="h-3.5 w-3.5" />
                  {inviting ? "Sending..." : "Send Invitation"}
                </Button>

                {inviteSuccess && (
                  <p className="text-xs text-center text-emerald-600">{inviteSuccess}</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
