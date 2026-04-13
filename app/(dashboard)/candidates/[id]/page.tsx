"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MentionInput } from "@/components/mention-input";
import {
  ArrowLeft,
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
  Star,
  Lock,
  Globe,
  AtSign,
  Plus,
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { AssignToJobsDialog } from "@/components/assign-jobs-dialog";

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showAssignDialog, setShowAssignDialog] = useState(false);

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

  async function addComment(data: { content: string; type: "INTERNAL" | "CLIENT_VISIBLE"; mentions: string[] }) {
    setSubmittingComment(true);

    // For client-visible notes, also attach to the first submission so it shows in portal
    let submissionId = null;
    if (data.type === "CLIENT_VISIBLE" && candidate.submissions?.length > 0) {
      submissionId = candidate.submissions[0].id;
    }

    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: data.content,
        candidateId: params.id,
        submissionId,
        type: data.type,
        mentions: data.mentions,
      }),
    });
    setSubmittingComment(false);
    fetchCandidate();
  }

  function getAllComments() {
    const candidateComments = (candidate.comments || []).map((c: any) => ({
      ...c,
      source: "candidate",
    }));

    const submissionComments = (candidate.submissions || []).flatMap((sub: any) =>
      (sub.comments || []).map((c: any) => ({
        ...c,
        source: "submission",
        jobTitle: sub.job?.title,
        jobId: sub.job?.id,
      }))
    );

    // Merge and deduplicate by id
    const all = [...candidateComments, ...submissionComments];
    const seen = new Set<string>();
    const unique = all.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    // Sort by createdAt ascending (oldest first, like a chat)
    return unique.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  function renderMentions(text: string) {
    // Highlight @mentions in the text
    const parts = text.split(/(@\w+(?:\s\w+)?)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className="text-indigo-600 font-medium bg-indigo-50 px-0.5 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  }

  async function deleteCandidate() {
    if (!confirm("Delete this candidate? This cannot be undone.")) return;
    await fetch(`/api/candidates/${params.id}`, { method: "DELETE" });
    router.push("/candidates");
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
          <Link href="/candidates">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="submissions">
            Jobs ({candidate.submissions?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents ({candidate.documents?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="notes">
            Notes & Feedback ({getAllComments().length})
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
                    {formatCurrency(Number(candidate.currentSalary))}
                  </div>
                )}
                {candidate.desiredSalary && (
                  <div className="text-sm">
                    <span className="text-gray-500">Desired Salary:</span>{" "}
                    {formatCurrency(Number(candidate.desiredSalary))}
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
            candidate.submissions?.map((sub: any) => (
              <Link key={sub.id} href={`/jobs/${sub.job.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{sub.job.title}</h3>
                      <p className="text-sm text-gray-500">
                        Submitted {formatDate(sub.createdAt)}
                      </p>
                    </div>
                    <Badge
                      style={{
                        backgroundColor: sub.stage.color + "20",
                        color: sub.stage.color,
                      }}
                    >
                      {sub.stage.name}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))
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
                  <div className="flex items-center gap-3 min-w-0">
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
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={`/api/documents/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
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

        <TabsContent value="notes" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <MentionInput
                onSubmit={addComment}
                allowClients={true}
                submitting={submittingComment}
                placeholder="Add a note... Use @ to mention team members or clients"
              />
            </CardContent>
          </Card>

          {getAllComments().length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500 text-sm">
                No notes or feedback yet. Add a note above or share candidates with clients to collect feedback.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {getAllComments().map((c: any) => {
                const isClient = !!c.clientUser?.name && !c.user?.name;
                const authorName = c.user?.name || c.clientUser?.name || "Unknown";
                const isClientVisible = c.type === "CLIENT_VISIBLE";

                // Parse JSON content (client feedback)
                let displayContent = c.content;
                let rating = null;
                let parsedClientName = null;
                try {
                  const parsed = JSON.parse(c.content);
                  if (parsed && typeof parsed === "object") {
                    displayContent = parsed.text || "";
                    rating = parsed.rating;
                    parsedClientName = parsed.clientName;
                  }
                } catch {}

                const displayAuthor = parsedClientName || authorName;

                return (
                  <Card key={c.id} className={isClientVisible ? "border-l-4 border-l-emerald-500" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isClient ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"
                        }`}>
                          {displayAuthor.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{displayAuthor}</span>
                        {isClient && (
                          <Badge variant="secondary" className="text-[10px] py-0 bg-emerald-50 text-emerald-600 border-emerald-200">
                            Client
                          </Badge>
                        )}
                        {isClientVisible ? (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                            <Globe className="h-3 w-3" />
                            Client visible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            <Lock className="h-3 w-3" />
                            Internal
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {formatDate(c.createdAt)}
                        </span>
                        {c.jobTitle && (
                          <span className="text-xs text-gray-400">
                            on <Link href={`/jobs/${c.jobId}`} className="text-indigo-600 hover:underline">{c.jobTitle}</Link>
                          </span>
                        )}
                      </div>
                      {rating && (
                        <div className="flex gap-0.5 mb-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`h-3.5 w-3.5 ${n <= rating ? "text-yellow-500 fill-yellow-500" : "text-gray-200"}`}
                            />
                          ))}
                        </div>
                      )}
                      {displayContent && (
                        <p className="text-sm whitespace-pre-wrap">
                          {renderMentions(displayContent)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
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
    </div>
  );
}
