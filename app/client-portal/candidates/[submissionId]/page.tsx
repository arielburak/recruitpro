"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Mail,
  Phone,
  Link2,
  MapPin,
  Briefcase,
  Building2,
  FileText,
  Download,
  Send,
  User,
  Calendar,
} from "lucide-react";
import { RatingStars } from "@/components/client-portal/rating-stars";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";

type CandidateDetail = {
  submissionId: string;
  candidate: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    linkedIn: string | null;
    location: string | null;
    currentTitle: string | null;
    currentCompany: string | null;
    skills: string[];
    summary: string | null;
  };
  job: { id: string; title: string };
  firm: { id: string; name: string };
  stage: { id: string; name: string; order: number; color: string } | null;
  clientStage: { id: string; name: string; order: number; color: string; isTerminal: boolean; kind: string | null } | null;
  recruiterStage: { id: string; name: string; color: string } | null;
  sharedBy: string | null;
  sharedAt: string;
  documents: {
    id: string;
    name: string;
    type: string;
    size: number;
    category: string | null;
    createdAt: string;
  }[];
  myRating: { score: number; feedback: string | null; createdAt: string } | null;
  allRatings: {
    id: string;
    score: number;
    feedback: string | null;
    createdAt: string;
    clientUser: { id: string; name: string; title: string | null };
  }[];
  avgRating: number | null;
  ratingCount: number;
  comments: {
    id: string;
    content: string;
    createdAt: string;
    clientUser: { id: string; name: string; title: string | null } | null;
    user: { id: string; name: string } | null;
  }[];
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function CandidateDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = use(params);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Pipeline stages
  const [availableStages, setAvailableStages] = useState<{ id: string; name: string; color: string; isTerminal: boolean; kind: string | null }[]>([]);
  const [changingStage, setChangingStage] = useState(false);

  // Rating form
  const [myScore, setMyScore] = useState<number>(0);
  const [myFeedback, setMyFeedback] = useState("");
  const [savingRating, setSavingRating] = useState(false);
  const [ratingStatus, setRatingStatus] = useState<string | null>(null);

  // Comment form
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  async function fetchDetail() {
    try {
      const res = await fetch(`/api/client-portal/candidates/${submissionId}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
        setMyScore(data.myRating?.score || 0);
        setMyFeedback(data.myRating?.feedback || "");
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDetail();
    // Fetch available client stages for the dropdown
    fetch("/api/client-portal/pipeline-stages")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAvailableStages(data);
      })
      .catch(() => {});
  }, [submissionId]);

  async function changeStage(newStageId: string) {
    if (!detail) return;
    if (newStageId === "all") return;
    setChangingStage(true);
    try {
      const res = await fetch(`/api/client-portal/candidates/${submissionId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientStageId: newStageId }),
      });
      if (res.ok) {
        fetchDetail();
      }
    } catch {}
    setChangingStage(false);
  }

  async function saveRating() {
    if (!myScore) return;
    setSavingRating(true);
    setRatingStatus(null);
    try {
      const res = await fetch(`/api/client-portal/candidates/${submissionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: myScore, feedback: myFeedback.trim() || undefined }),
      });
      if (res.ok) {
        setRatingStatus("Saved");
        setTimeout(() => setRatingStatus(null), 2000);
        fetchDetail();
      } else {
        setRatingStatus("Failed to save");
      }
    } catch {
      setRatingStatus("Failed to save");
    }
    setSavingRating(false);
  }

  async function postComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/client-portal/candidates/${submissionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: newComment.trim() }),
      });
      if (res.ok) {
        setNewComment("");
        fetchDetail();
      }
    } catch {
      // silent
    }
    setPostingComment(false);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 mb-4">
          Candidate not found or not shared with you.
        </p>
        <Link href="/client-portal/candidates" className="text-sm text-emerald-600 hover:underline">
          ← Back to candidates
        </Link>
      </div>
    );
  }

  const fullName = `${detail.candidate.firstName} ${detail.candidate.lastName}`.trim();
  const initials = (detail.candidate.firstName[0] || "") + (detail.candidate.lastName[0] || "");

  // Parse comment content: recruiter comments or old-style rating JSON
  function renderCommentContent(raw: string) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.text) return parsed.text;
      if (parsed.clientName || parsed.rating) {
        return parsed.text || "";
      }
    } catch {
      // plain text
    }
    return raw;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <Link
        href="/client-portal/candidates"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to candidates
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl flex items-center justify-center text-lg font-bold shrink-0">
            {initials.toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{fullName}</h1>
            {detail.candidate.currentTitle && (
              <p className="text-sm text-gray-600 truncate">
                {detail.candidate.currentTitle}
                {detail.candidate.currentCompany ? ` · ${detail.candidate.currentCompany}` : ""}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
              {detail.candidate.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {detail.candidate.location}
                </span>
              )}
              {detail.candidate.email && (
                <a href={`mailto:${detail.candidate.email}`} className="inline-flex items-center gap-1 hover:text-emerald-600">
                  <Mail className="h-3 w-3" /> {detail.candidate.email}
                </a>
              )}
              {detail.candidate.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {detail.candidate.phone}
                </span>
              )}
              {detail.candidate.linkedIn && (
                <a
                  href={detail.candidate.linkedIn}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-emerald-600"
                >
                  <Link2 className="h-3 w-3" /> LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>

        {availableStages.length > 0 && (
          <div className="shrink-0 flex flex-col items-end gap-1">
            <SearchableSelect
              value={detail.clientStage?.id || "all"}
              onChange={changeStage}
              options={availableStages.map<SearchableSelectOption>((s) => ({
                value: s.id,
                label: s.name,
                color: s.color,
              }))}
              allLabel="— Select stage —"
              searchPlaceholder="Search stages..."
              placeholder="Stage"
              minWidth={180}
              disabled={changingStage}
            />
            <p className="text-[10px] text-gray-400">Your pipeline stage</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: profile + documents */}
        <div className="lg:col-span-2 space-y-4">
          {/* Summary / About */}
          {detail.candidate.summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-gray-500">About</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-gray-700">{detail.candidate.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Skills */}
          {detail.candidate.skills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-gray-500">Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {detail.candidate.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[11px]">{s}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detail.documents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No documents attached.</p>
              ) : (
                <div className="space-y-2">
                  {detail.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={`/api/client-portal/candidates/${detail.submissionId}/document/${doc.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-5 w-5 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.name}</p>
                          <p className="text-xs text-gray-400">
                            {formatFileSize(doc.size)}
                            {doc.category ? ` · ${doc.category.replace(/_/g, " ")}` : ""}
                          </p>
                        </div>
                      </div>
                      <Download className="h-4 w-4 text-gray-400 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feedback thread */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-gray-500">Team Feedback</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Post comment */}
              <div className="space-y-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Leave a comment for your team..."
                  rows={3}
                  className="text-sm"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                    onClick={postComment}
                    disabled={postingComment || !newComment.trim()}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {postingComment ? "Posting..." : "Post Comment"}
                  </Button>
                </div>
              </div>

              {/* Existing ratings + comments merged, sorted by date */}
              {detail.comments.length === 0 && detail.allRatings.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No feedback yet.</p>
              ) : (
                <div className="space-y-3">
                  {[
                    ...detail.allRatings.map((r) => ({
                      kind: "rating" as const,
                      id: `rating_${r.id}`,
                      date: r.createdAt,
                      author: r.clientUser.name,
                      authorTitle: r.clientUser.title,
                      score: r.score,
                      feedback: r.feedback,
                    })),
                    ...detail.comments.map((c) => ({
                      kind: "comment" as const,
                      id: `comment_${c.id}`,
                      date: c.createdAt,
                      author: c.clientUser?.name || c.user?.name || "Someone",
                      authorTitle: c.clientUser?.title || null,
                      content: c.content,
                    })),
                  ]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((item) => (
                      <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.author}</p>
                            {item.authorTitle && (
                              <p className="text-[11px] text-gray-500">{item.authorTitle}</p>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-400 shrink-0">{formatDateTime(item.date)}</span>
                        </div>
                        {item.kind === "rating" ? (
                          <>
                            <RatingStars value={item.score} readonly size="sm" />
                            {item.feedback && (
                              <p className="text-sm text-gray-700 mt-1.5 whitespace-pre-wrap">{item.feedback}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {renderCommentContent(item.content)}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: context + rating form */}
        <div className="space-y-4">
          {/* Submission context */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Briefcase className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider">Job</p>
                  <Link
                    href={`/client-portal/jobs/${detail.job.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-emerald-600"
                  >
                    {detail.job.title}
                  </Link>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider">Shared by</p>
                  <p className="text-sm font-medium text-gray-900 truncate">{detail.firm.name}</p>
                  {detail.sharedBy && (
                    <p className="text-[11px] text-gray-500 truncate">{detail.sharedBy}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider">Shared on</p>
                  <p className="text-sm text-gray-700">{formatDate(detail.sharedAt)}</p>
                </div>
              </div>

              {detail.avgRating !== null && (
                <div className="pt-3 border-t">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Team average</p>
                  <div className="flex items-center gap-2">
                    <RatingStars value={Math.round(detail.avgRating)} readonly size="sm" />
                    <span className="text-xs text-gray-500">
                      {detail.avgRating.toFixed(1)} · {detail.ratingCount} rating{detail.ratingCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* My rating */}
          <Card className="border-emerald-200">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-600" />
                Your Rating
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <RatingStars value={myScore} onChange={setMyScore} size="lg" />
                {myScore > 0 && (
                  <button
                    onClick={() => setMyScore(0)}
                    className="text-[11px] text-gray-400 hover:text-gray-600"
                  >
                    clear
                  </button>
                )}
              </div>

              <Textarea
                value={myFeedback}
                onChange={(e) => setMyFeedback(e.target.value)}
                placeholder="Private feedback on this candidate..."
                rows={3}
                className="text-sm"
              />

              <div className="flex items-center justify-between">
                {ratingStatus ? (
                  <p className="text-xs text-emerald-600">{ratingStatus}</p>
                ) : (
                  <span />
                )}
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={saveRating}
                  disabled={savingRating || myScore === 0}
                >
                  {savingRating ? "Saving..." : detail.myRating ? "Update" : "Save Rating"}
                </Button>
              </div>
              {detail.myRating && (
                <p className="text-[11px] text-gray-400">
                  Last updated {formatDateTime(detail.myRating.createdAt)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
