"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Star,
  MessageSquare,
  MapPin,
  Briefcase,
  Building,
  User,
  Mail,
  Phone,
  ExternalLink,
  FileText,
  Download,
  Send,
  ThumbsUp,
  ThumbsDown,
  Search,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentInfo {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  skills?: string[];
  summary?: string;
  documents?: DocumentInfo[];
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user?: { name: string };
  clientUser?: { name: string };
}

interface Submission {
  id: string;
  candidate: Candidate;
  stage: { name: string; color: string };
  ratings: { score: number; feedback: string; clientUser?: { name: string } }[];
  comments: Comment[];
  createdAt?: string;
}

interface Job {
  id: string;
  title: string;
  status: string;
  location?: string;
  salary?: string;
  submissions: Submission[];
}

interface PortalData {
  client: { name: string; id: string };
  jobs: Job[];
  tokenId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCommentContent(content: string): {
  rating?: number;
  text?: string;
  clientName?: string;
  isStructured: boolean;
} {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && (parsed.rating || parsed.text)) {
      return { ...parsed, isStructured: true };
    }
  } catch {
    // plain text comment
  }
  return { text: content, isStructured: false };
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAverageRating(comments: Comment[]): number | null {
  const ratings: number[] = [];
  for (const c of comments) {
    const parsed = parseCommentContent(c.content);
    if (parsed.rating) ratings.push(parsed.rating);
  }
  if (ratings.length === 0) return null;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

function getCommentCount(comments: Comment[]): number {
  return comments.filter((c) => {
    const parsed = parseCommentContent(c.content);
    return parsed.text && parsed.text.trim().length > 0;
  }).length;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StarRating({
  value,
  onChange,
  size = "md",
  readonly = false,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
  readonly?: boolean;
}) {
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-6 w-6" : "h-5 w-5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          className={`p-0 ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110 transition-transform"}`}
        >
          <Star
            className={`${sizeClass} ${
              n <= value
                ? "text-amber-400 fill-amber-400"
                : "text-gray-300"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-6">
        <div className="hidden lg:block w-72 shrink-0 space-y-3">
          <div className="h-10 bg-gray-200 rounded-xl animate-pulse" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="flex-1 space-y-4">
          <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-12 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ClientPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Selection state
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "documents" | "feedback">("profile");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [searchQuery, setSearchQuery] = useState("");

  // Feedback form state
  const [clientName, setClientName] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  // Load client name from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("recruitpro_client_name");
    if (saved) setClientName(saved);
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/client-portal/${token}`);
      if (!res.ok) throw new Error("Invalid or expired link");
      const json = await res.json();
      setData(json);
      return json;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  }, [token]);

  useEffect(() => {
    fetchData().then((json) => {
      if (json) {
        // Auto-select first candidate
        const allSubs = json.jobs.flatMap((j: Job) => j.submissions);
        if (allSubs.length > 0 && !selectedSubmissionId) {
          setSelectedSubmissionId(allSubs[0].id);
        }
      }
      setLoading(false);
    });
  }, [fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flatten all submissions across jobs
  const allSubmissions = useMemo(() => {
    if (!data) return [];
    return data.jobs.flatMap((j) =>
      j.submissions.map((s) => ({ ...s, jobTitle: j.title, jobId: j.id }))
    );
  }, [data]);

  // Filter submissions by search query
  const filteredSubmissions = useMemo(() => {
    if (!searchQuery.trim()) return allSubmissions;
    const q = searchQuery.toLowerCase();
    return allSubmissions.filter((s) => {
      const c = s.candidate;
      return (
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.currentTitle?.toLowerCase().includes(q) ||
        c.currentCompany?.toLowerCase().includes(q) ||
        c.location?.toLowerCase().includes(q) ||
        c.skills?.some((sk) => sk.toLowerCase().includes(q))
      );
    });
  }, [allSubmissions, searchQuery]);

  // Currently selected submission
  const selectedSubmission = useMemo(
    () => allSubmissions.find((s) => s.id === selectedSubmissionId) || null,
    [allSubmissions, selectedSubmissionId]
  );

  // Submit feedback
  async function submitFeedback() {
    if (!selectedSubmission) return;
    if (!feedbackRating && !feedbackComment.trim()) return;

    setSubmittingFeedback(true);
    setFeedbackSuccess(false);

    // Save client name
    if (clientName.trim()) {
      localStorage.setItem("recruitpro_client_name", clientName.trim());
    }

    await fetch("/api/client-portal/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: selectedSubmission.id,
        rating: feedbackRating || undefined,
        comment: feedbackComment.trim() || undefined,
        token,
        clientName: clientName.trim() || "Client",
      }),
    });

    setFeedbackRating(0);
    setFeedbackComment("");
    setSubmittingFeedback(false);
    setFeedbackSuccess(true);
    setTimeout(() => setFeedbackSuccess(false), 3000);

    // Refresh data and keep same candidate selected
    await fetchData();
  }

  // Quick feedback (thumbs)
  async function submitQuickFeedback(positive: boolean) {
    if (!selectedSubmission) return;

    if (clientName.trim()) {
      localStorage.setItem("recruitpro_client_name", clientName.trim());
    }

    await fetch("/api/client-portal/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: selectedSubmission.id,
        rating: positive ? 5 : 1,
        comment: positive ? "Interested in this candidate" : "Not a fit for this role",
        token,
        clientName: clientName.trim() || "Client",
      }),
    });

    await fetchData();
  }

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) return <SkeletonLoader />;

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <ExternalLink className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
          <p className="text-gray-500 max-w-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data || allSubmissions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <User className="h-8 w-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">No Candidates Yet</h2>
          <p className="text-gray-500 max-w-sm">
            No candidates have been shared for review yet. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  const c = selectedSubmission?.candidate;

  // ---------------------------------------------------------------------------
  // Candidate list sidebar item
  // ---------------------------------------------------------------------------

  function CandidateCard({ sub }: { sub: (typeof allSubmissions)[0] }) {
    const isActive = sub.id === selectedSubmissionId;
    const cand = sub.candidate;
    const avgRating = getAverageRating(sub.comments);
    const commentCount = getCommentCount(sub.comments);

    return (
      <button
        onClick={() => {
          setSelectedSubmissionId(sub.id);
          setActiveTab("profile");
          setMobileView("detail");
        }}
        className={`w-full text-left p-3 rounded-xl transition-all ${
          isActive
            ? "bg-indigo-50 border-2 border-indigo-500 shadow-sm"
            : "bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
              isActive
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {getInitials(cand.firstName, cand.lastName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm text-gray-900 truncate">
                {cand.firstName} {cand.lastName}
              </p>
              <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 lg:hidden" />
            </div>
            {cand.currentTitle && (
              <p className="text-xs text-gray-500 truncate">{cand.currentTitle}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <Badge
                className="text-[10px] px-1.5 py-0"
                style={{
                  backgroundColor: sub.stage.color + "20",
                  color: sub.stage.color,
                  borderColor: sub.stage.color + "40",
                }}
              >
                {sub.stage.name}
              </Badge>
              {avgRating !== null && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {avgRating.toFixed(1)}
                </span>
              )}
              {commentCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                  <MessageSquare className="h-3 w-3" />
                  {commentCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  }

  // ---------------------------------------------------------------------------
  // Comment thread item
  // ---------------------------------------------------------------------------

  function CommentBubble({ comment }: { comment: Comment }) {
    const parsed = parseCommentContent(comment.content);
    const isRecruiter = !!comment.user?.name;
    const commenterName =
      comment.user?.name || comment.clientUser?.name || (parsed.isStructured ? parsed.clientName : "Client") || "Anonymous";

    return (
      <div className={`flex gap-3 ${isRecruiter ? "" : "flex-row-reverse"}`}>
        <div
          className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
            isRecruiter
              ? "bg-indigo-100 text-indigo-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {commenterName
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div
          className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
            isRecruiter
              ? "bg-indigo-50 text-gray-800"
              : "bg-emerald-50 text-gray-800"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold">{commenterName}</span>
            <span className="text-[10px] text-gray-400">
              {formatDate(comment.createdAt)}
            </span>
          </div>
          {parsed.rating && (
            <div className="mb-1">
              <StarRating value={parsed.rating} readonly size="sm" />
            </div>
          )}
          {parsed.text && <p className="text-sm leading-relaxed">{parsed.text}</p>}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Welcome banner */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          Welcome, {data.client.name}
        </h1>
        <p className="text-sm text-gray-500">
          {allSubmissions.length} candidate{allSubmissions.length !== 1 ? "s" : ""} shared for
          your review across{" "}
          {data.jobs.length} position{data.jobs.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex gap-6">
        {/* ---- SIDEBAR (desktop) / LIST (mobile) ---- */}
        <div
          className={`w-full lg:w-72 shrink-0 ${
            mobileView === "detail" ? "hidden lg:block" : "block"
          }`}
        >
          {/* Sticky sidebar header */}
          <div className="sticky top-0 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search candidates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white rounded-xl border-gray-200 text-sm"
              />
            </div>

            {/* Job sections */}
            {data.jobs.map((job) => {
              const jobSubs = filteredSubmissions.filter((s) => s.jobId === job.id);
              if (jobSubs.length === 0) return null;
              return (
                <div key={job.id}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
                      {job.title}
                    </h3>
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {jobSubs.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {jobSubs.map((sub) => (
                      <CandidateCard key={sub.id} sub={sub} />
                    ))}
                  </div>
                </div>
              );
            })}

            {filteredSubmissions.length === 0 && searchQuery && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">No candidates match your search.</p>
              </div>
            )}
          </div>
        </div>

        {/* ---- DETAIL PANEL ---- */}
        <div
          className={`flex-1 min-w-0 ${
            mobileView === "list" ? "hidden lg:block" : "block"
          }`}
        >
          {/* Mobile back button */}
          <button
            onClick={() => setMobileView("list")}
            className="lg:hidden flex items-center gap-1 text-sm text-indigo-600 font-medium mb-4 hover:text-indigo-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </button>

          {selectedSubmission && c ? (
            <div className="space-y-5">
              {/* ---- CANDIDATE HEADER ---- */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold shrink-0">
                    {getInitials(c.firstName, c.lastName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">
                          {c.firstName} {c.lastName}
                        </h2>
                        {(c.currentTitle || c.currentCompany) && (
                          <p className="text-sm text-gray-600 mt-0.5">
                            {c.currentTitle}
                            {c.currentCompany && (
                              <>
                                {" "}
                                <span className="text-gray-400">at</span>{" "}
                                <span className="font-medium">{c.currentCompany}</span>
                              </>
                            )}
                          </p>
                        )}
                        {c.location && (
                          <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {c.location}
                          </p>
                        )}
                      </div>
                      <Badge
                        className="text-xs px-2.5 py-1 shrink-0"
                        style={{
                          backgroundColor: selectedSubmission.stage.color + "20",
                          color: selectedSubmission.stage.color,
                          borderColor: selectedSubmission.stage.color + "40",
                        }}
                      >
                        {selectedSubmission.stage.name}
                      </Badge>
                    </div>

                    {/* Contact bar */}
                    <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          {c.email}
                        </a>
                      )}
                      {c.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {c.phone}
                        </a>
                      )}
                      {c.linkedIn && (
                        <a
                          href={c.linkedIn.startsWith("http") ? c.linkedIn : `https://${c.linkedIn}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ---- TABS ---- */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex border-b border-gray-200">
                  {(
                    [
                      { key: "profile", label: "Profile", icon: User },
                      { key: "documents", label: "Documents", icon: FileText },
                      { key: "feedback", label: "Feedback", icon: MessageSquare },
                    ] as const
                  ).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === key
                          ? "border-indigo-600 text-indigo-600"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                      {key === "feedback" && selectedSubmission.comments.length > 0 && (
                        <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">
                          {selectedSubmission.comments.length}
                        </span>
                      )}
                      {key === "documents" && (c.documents?.length || 0) > 0 && (
                        <span className="ml-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">
                          {c.documents?.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="p-6">
                  {/* ---- PROFILE TAB ---- */}
                  {activeTab === "profile" && (
                    <div className="space-y-6">
                      {c.summary && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Summary</h3>
                          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                            {c.summary}
                          </p>
                        </div>
                      )}

                      {(c.currentTitle || c.currentCompany) && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Experience</h3>
                          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                            <div className="h-10 w-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center">
                              <Building className="h-5 w-5 text-gray-400" />
                            </div>
                            <div>
                              {c.currentTitle && (
                                <p className="text-sm font-medium text-gray-900">
                                  {c.currentTitle}
                                </p>
                              )}
                              {c.currentCompany && (
                                <p className="text-xs text-gray-500">{c.currentCompany}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {c.skills && c.skills.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Skills</h3>
                          <div className="flex flex-wrap gap-2">
                            {c.skills.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recruiter notes visible to client */}
                      {selectedSubmission.comments.filter((c) => !!c.user?.name).length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-2">Notes from your recruiter</h3>
                          <div className="space-y-2">
                            {selectedSubmission.comments
                              .filter((c) => !!c.user?.name)
                              .map((c) => {
                                const parsed = parseCommentContent(c.content);
                                return (
                                  <div key={c.id} className="bg-indigo-50 rounded-lg p-3 border border-indigo-100">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-semibold text-indigo-700">{c.user?.name}</span>
                                      <span className="text-[10px] text-gray-400">{formatDate(c.createdAt)}</span>
                                    </div>
                                    <p className="text-sm text-gray-700">{parsed.text || c.content}</p>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {!c.summary && (!c.skills || c.skills.length === 0) && selectedSubmission.comments.filter((c) => !!c.user?.name).length === 0 && (
                        <div className="text-center py-8">
                          <User className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">
                            No additional profile information available.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ---- DOCUMENTS TAB ---- */}
                  {activeTab === "documents" && (
                    <div>
                      {c.documents && c.documents.length > 0 ? (
                        <div className="space-y-2">
                          {c.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-10 w-10 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                                  <FileText className="h-5 w-5 text-indigo-500" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">
                                    {doc.name}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {doc.type} &middot; {formatFileSize(doc.size)} &middot;{" "}
                                    {formatDate(doc.createdAt)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 ml-3"
                                onClick={() => window.open(`/api/documents/${doc.id}?token=${token}`, "_blank")}
                              >
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Download
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">
                            No documents have been uploaded for this candidate.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ---- FEEDBACK TAB ---- */}
                  {activeTab === "feedback" && (
                    <div className="space-y-6">
                      {/* Quick actions */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-500">Quick feedback:</span>
                        <button
                          onClick={() => submitQuickFeedback(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          Interested
                        </button>
                        <button
                          onClick={() => submitQuickFeedback(false)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                          Not a fit
                        </button>
                      </div>

                      {/* Comment thread */}
                      {selectedSubmission.comments.length > 0 ? (
                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                          {selectedSubmission.comments.map((comment) => (
                            <CommentBubble key={comment.id} comment={comment} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 bg-gray-50 rounded-xl">
                          <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">
                            No feedback yet. Be the first to share your thoughts.
                          </p>
                        </div>
                      )}

                      {/* Feedback form */}
                      <div className="border-t border-gray-100 pt-5 space-y-4">
                        <h4 className="text-sm font-semibold text-gray-900">Leave Feedback</h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">
                              Your Name
                            </label>
                            <Input
                              placeholder="Enter your name"
                              value={clientName}
                              onChange={(e) => setClientName(e.target.value)}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">
                              Rating
                            </label>
                            <div className="h-9 flex items-center">
                              <StarRating
                                value={feedbackRating}
                                onChange={setFeedbackRating}
                              />
                              {feedbackRating > 0 && (
                                <button
                                  onClick={() => setFeedbackRating(0)}
                                  className="ml-2 text-xs text-gray-400 hover:text-gray-600"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">
                            Comment
                          </label>
                          <Textarea
                            placeholder="Share your thoughts about this candidate..."
                            value={feedbackComment}
                            onChange={(e) => setFeedbackComment(e.target.value)}
                            rows={3}
                            className="text-sm resize-none"
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          <Button
                            onClick={submitFeedback}
                            disabled={
                              submittingFeedback ||
                              (!feedbackRating && !feedbackComment.trim())
                            }
                            className="bg-indigo-600 hover:bg-indigo-700"
                          >
                            <Send className="h-4 w-4 mr-2" />
                            {submittingFeedback ? "Submitting..." : "Submit Feedback"}
                          </Button>
                          {feedbackSuccess && (
                            <span className="text-sm text-emerald-600 font-medium">
                              Feedback submitted successfully!
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
              <div className="text-center">
                <User className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  Select a candidate to view their profile
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
