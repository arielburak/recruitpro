"use client";

import { useEffect, useState, use } from "react";
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
import { formatDate } from "@/lib/utils";

export default function ClientJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [firmSearch, setFirmSearch] = useState("");
  const [firmResults, setFirmResults] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState("");

  // Team member management state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberTitle, setMemberTitle] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberResult, setMemberResult] = useState<{ type: "success" | "error"; message: string; link?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Documents state
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploadingJD, setUploadingJD] = useState(false);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    requirements: "",
    location: "",
    salaryRange: "",
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
  }, [id]);

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

  async function searchFirms(query: string) {
    setFirmSearch(query);
    if (query.length < 2) { setFirmResults([]); return; }
    try {
      const res = await fetch(`/api/client-portal/invite-firm?q=${encodeURIComponent(query)}`);
      if (res.ok) setFirmResults(await res.json());
    } catch {}
  }

  async function inviteFirm(organizationId?: string) {
    setInviting(true);
    setInviteSuccess("");
    try {
      const res = await fetch("/api/client-portal/invite-firm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientJobId: id,
          organizationId: organizationId || undefined,
          email: !organizationId ? inviteEmail : undefined,
          message: inviteMessage || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteSuccess(data.error || "Failed to invite");
      } else {
        setInviteSuccess(data.sent ? "Email invitation sent!" : "Firm invited successfully!");
        setFirmSearch("");
        setInviteEmail("");
        setInviteMessage("");
        setFirmResults([]);
        fetchJob();
      }
    } catch {
      setInviteSuccess("Something went wrong");
    }
    setInviting(false);
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
                    <Label>Salary Range</Label>
                    <Input value={editForm.salaryRange} onChange={(e) => setEditForm({ ...editForm, salaryRange: e.target.value })} />
                  </div>
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
                  </CardContent>
                </Card>
              )}

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
                            <a href={jdDoc.url} target="_blank" rel="noopener noreferrer" download>
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
                  <label className="cursor-pointer">
                    <Button variant="outline" size="sm" className="gap-1 text-xs pointer-events-none">
                      {uploadingAdditional ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      {uploadingAdditional ? "Uploading..." : "Add"}
                    </Button>
                    <input
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
                  </label>
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
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" download>
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

          {/* Assigned Recruiters (from staffing firms) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-indigo-600" />
                Assigned Recruiters
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!job.teamMembers || job.teamMembers.length === 0 ? (
                <p className="text-sm text-gray-400 py-3 text-center">
                  No recruiters assigned yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {job.teamMembers.map((member: any) => (
                    <div key={member.id} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">
                      <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                        {member.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                        <p className="text-[11px] text-gray-500 capitalize">{member.role?.toLowerCase().replace("_", " ")}</p>
                        <div className="mt-1.5 space-y-0.5">
                          <a
                            href={`mailto:${member.email}`}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
                          >
                            <Mail className="h-3 w-3" />
                            {member.email}
                          </a>
                        </div>
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
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowInvite(!showInvite)}>
                <Plus className="h-3 w-3" />
                Invite
              </Button>
            </CardHeader>
            <CardContent>
              {/* Summary Stats */}
              {job.engagements?.length > 0 && (
                <div className="flex gap-3 mb-3">
                  <div className="flex-1 bg-green-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-green-700">
                      {job.engagements.filter((e: any) => e.status === "ACCEPTED").length}
                    </p>
                    <p className="text-[10px] text-green-600">Active</p>
                  </div>
                  <div className="flex-1 bg-amber-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-amber-700">
                      {job.engagements.filter((e: any) => e.status === "PENDING").length}
                    </p>
                    <p className="text-[10px] text-amber-600">Pending</p>
                  </div>
                  <div className="flex-1 bg-blue-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-blue-700">
                      {Object.values(job.firmCandidateCounts || {}).reduce((a: number, b: any) => a + (b as number), 0) as number}
                    </p>
                    <p className="text-[10px] text-blue-600">Candidates</p>
                  </div>
                </div>
              )}

              {job.engagements?.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                  No firms invited yet. Click Invite to get started.
                </p>
              ) : (
                <div className="space-y-2">
                  {job.engagements?.map((eng: any) => {
                    const candidateCount = job.firmCandidateCounts?.[eng.organization.id] || 0;
                    return (
                      <div key={eng.id} className="p-2.5 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                              <Building2 className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{eng.organization.name}</p>
                              <p className="text-[10px] text-gray-400">Invited {formatDate(eng.invitedAt)}</p>
                            </div>
                          </div>
                          <Badge className={`text-[10px] ${statusColor[eng.status]}`}>
                            {eng.status === "PENDING" && <Clock className="h-3 w-3 mr-1" />}
                            {eng.status === "ACCEPTED" && <CheckCircle className="h-3 w-3 mr-1" />}
                            {eng.status === "DECLINED" && <XCircle className="h-3 w-3 mr-1" />}
                            {eng.status.toLowerCase()}
                          </Badge>
                        </div>
                        {eng.status === "ACCEPTED" && (
                          <div className="flex items-center gap-3 ml-10 mt-1">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {candidateCount} candidate{candidateCount !== 1 ? "s" : ""} shared
                            </span>
                            {eng.message && (
                              <span className="text-[10px] text-gray-400 truncate max-w-[120px]" title={eng.message}>
                                &quot;{eng.message}&quot;
                              </span>
                            )}
                          </div>
                        )}
                        {eng.status === "PENDING" && (
                          <p className="text-[10px] text-amber-600 ml-10 mt-1">
                            Waiting for response...
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invite Dialog */}
          {showInvite && (
            <Card className="border-emerald-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Invite a Recruiting Firm</h4>
                  <button onClick={() => setShowInvite(false)}>
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>

                {/* Search existing firms */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Search firms on Recruiting ATS</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      value={firmSearch}
                      onChange={(e) => searchFirms(e.target.value)}
                      placeholder="Search by name..."
                      className="pl-9 text-sm"
                    />
                  </div>
                  {firmResults.length > 0 && (
                    <div className="mt-1 border rounded-lg max-h-32 overflow-y-auto">
                      {firmResults.map((firm: any) => (
                        <button
                          key={firm.id}
                          onClick={() => inviteFirm(firm.id)}
                          disabled={inviting}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-gray-400" />
                            <span>{firm.name}</span>
                          </div>
                          <span className="text-xs text-gray-400">{firm._count?.users || 0} members</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white text-gray-400">or invite by email</span>
                  </div>
                </div>

                <div>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="recruiter@firm.com"
                    className="text-sm"
                  />
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
                  disabled={inviting || (!inviteEmail && firmResults.length === 0)}
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
