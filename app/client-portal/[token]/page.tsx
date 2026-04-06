"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquare, MapPin, Briefcase, Building } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function ClientPortalPage() {
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedbackState, setFeedbackState] = useState<Record<string, { score: number; comment: string }>>({});
  const [submittingFeedback, setSubmittingFeedback] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/client-portal/${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invalid or expired link");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function submitFeedback(submissionId: string) {
    const fb = feedbackState[submissionId];
    if (!fb?.score && !fb?.comment) return;

    setSubmittingFeedback(submissionId);
    await fetch("/api/client-portal/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId,
        score: fb.score || undefined,
        comment: fb.comment || undefined,
        token: params.token,
      }),
    });
    setSubmittingFeedback(null);
    setFeedbackState((prev) => ({ ...prev, [submissionId]: { score: 0, comment: "" } }));
    // Refresh data
    const res = await fetch(`/api/client-portal/${params.token}`);
    setData(await res.json());
  }

  if (loading) return <div className="h-96 bg-gray-100 rounded-lg animate-pulse" />;
  if (error) return (
    <div className="text-center py-12">
      <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
      <p className="text-gray-500">{error}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {data.client.name}</h1>
        <p className="text-gray-500">Review candidates shared with you below.</p>
      </div>

      {data.jobs.map((job: any) => (
        <div key={job.id} className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">{job.title}</h2>
            <Badge variant="secondary">{job.status}</Badge>
            {job.location && <span className="text-sm text-gray-500">{job.location}</span>}
          </div>

          {job.submissions.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-gray-500">
                No candidates have been shared for this position yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {job.submissions.map((sub: any) => {
                const c = sub.candidate;
                const fb = feedbackState[sub.id] || { score: 0, comment: "" };
                const avgRating = sub.ratings.length > 0
                  ? (sub.ratings.reduce((sum: number, r: any) => sum + r.score, 0) / sub.ratings.length).toFixed(1)
                  : null;

                return (
                  <Card key={sub.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          {c.firstName} {c.lastName}
                        </CardTitle>
                        <Badge
                          style={{ backgroundColor: sub.stage.color + "20", color: sub.stage.color }}
                        >
                          {sub.stage.name}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {c.currentTitle && (
                        <div className="flex items-center gap-2 text-sm">
                          <Briefcase className="h-4 w-4 text-gray-400" />
                          {c.currentTitle}{c.currentCompany && ` at ${c.currentCompany}`}
                        </div>
                      )}
                      {c.location && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4 text-gray-400" /> {c.location}
                        </div>
                      )}
                      {c.skills?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.skills.slice(0, 5).map((s: string) => (
                            <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      )}
                      {c.summary && (
                        <p className="text-sm text-gray-600 line-clamp-3">{c.summary}</p>
                      )}

                      {avgRating && (
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-medium">{avgRating}</span>
                          <span className="text-gray-400">({sub.ratings.length} rating{sub.ratings.length !== 1 ? "s" : ""})</span>
                        </div>
                      )}

                      {sub.comments.length > 0 && (
                        <div className="border-t pt-3 space-y-2">
                          <p className="text-xs font-medium text-gray-500 flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> Comments
                          </p>
                          {sub.comments.slice(0, 3).map((cm: any, i: number) => (
                            <div key={i} className="bg-gray-50 rounded p-2">
                              <p className="text-xs text-gray-500">
                                {cm.user?.name || cm.clientUser?.name || "Anonymous"} &middot; {formatDate(cm.createdAt)}
                              </p>
                              <p className="text-sm">{cm.content}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="border-t pt-3 space-y-2">
                        <p className="text-xs font-medium text-gray-500">Your Feedback</p>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => setFeedbackState((prev) => ({
                                ...prev,
                                [sub.id]: { ...fb, score: n },
                              }))}
                              className="p-1"
                            >
                              <Star
                                className={`h-5 w-5 ${
                                  n <= fb.score
                                    ? "text-yellow-500 fill-yellow-500"
                                    : "text-gray-300"
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        <Textarea
                          placeholder="Leave a comment..."
                          value={fb.comment}
                          onChange={(e) => setFeedbackState((prev) => ({
                            ...prev,
                            [sub.id]: { ...fb, comment: e.target.value },
                          }))}
                          rows={2}
                          className="text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => submitFeedback(sub.id)}
                          disabled={submittingFeedback === sub.id || (!fb.score && !fb.comment)}
                        >
                          {submittingFeedback === sub.id ? "Submitting..." : "Submit Feedback"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
