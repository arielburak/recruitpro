"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [candidate, setCandidate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

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

  async function addComment() {
    if (!comment.trim()) return;
    setSubmittingComment(true);
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: comment,
        candidateId: params.id,
        type: "INTERNAL",
      }),
    });
    setComment("");
    setSubmittingComment(false);
    fetchCandidate();
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
          <TabsTrigger value="notes">Notes</TabsTrigger>
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
            <CardContent className="p-4 space-y-3">
              <Textarea
                placeholder="Add an internal note..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
              <Button
                size="sm"
                onClick={addComment}
                disabled={submittingComment || !comment.trim()}
              >
                {submittingComment ? "Adding..." : "Add Note"}
              </Button>
            </CardContent>
          </Card>

          {candidate.comments?.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-sm">{c.user?.name}</span>
                  <span className="text-xs text-gray-400">
                    {formatDate(c.createdAt)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
              </CardContent>
            </Card>
          ))}
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
    </div>
  );
}
