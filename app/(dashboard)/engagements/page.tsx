"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Inbox,
  Building2,
  MapPin,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  Briefcase,
  Mail,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function EngagementsPage() {
  const router = useRouter();
  const [engagements, setEngagements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/engagements")
      .then((res) => res.json())
      .then((data) => setEngagements(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function respond(id: string, action: "accept" | "decline") {
    setResponding(id);
    try {
      const res = await fetch(`/api/engagements/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (action === "accept" && data.jobId) {
        router.push(`/jobs/${data.jobId}`);
        return;
      }

      // Refresh list
      const updated = await fetch("/api/engagements").then((r) => r.json());
      setEngagements(Array.isArray(updated) ? updated : []);
    } catch {}
    setResponding(null);
  }

  const pending = engagements.filter((e) => e.status === "PENDING");
  const responded = engagements.filter((e) => e.status !== "PENDING");

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="h-6 w-6 text-indigo-600" />
          Engagement Requests
        </h1>
        <p className="text-gray-500 text-sm">
          Job requests from hiring companies looking for recruiting help
        </p>
      </div>

      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Pending ({pending.length})
          </h2>
          {pending.map((eng) => (
            <Card key={eng.id} className="border-l-4 border-l-amber-400">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        New Request
                      </Badge>
                      <span className="text-xs text-gray-400">{formatDate(eng.invitedAt)}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">{eng.clientJob.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {eng.clientJob.client.name}
                      </span>
                      {eng.clientJob.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {eng.clientJob.location}
                        </span>
                      )}
                      {eng.clientJob.salaryRange && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          {eng.clientJob.salaryRange}
                        </span>
                      )}
                      <span>{eng.clientJob.jobType}</span>
                    </div>
                    {eng.clientJob.description && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{eng.clientJob.description}</p>
                    )}
                    {eng.message && (
                      <div className="mt-2 bg-gray-50 rounded-lg p-2 text-sm text-gray-600 flex items-start gap-2">
                        <Mail className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                        {eng.message}
                      </div>
                    )}
                    {eng.clientJob.postedBy && (
                      <p className="text-xs text-gray-400 mt-2">
                        Contact: {eng.clientJob.postedBy.name} ({eng.clientJob.postedBy.email})
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                      disabled={responding === eng.id}
                      onClick={() => respond(eng.id, "accept")}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {responding === eng.id ? "..." : "Accept"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-gray-500"
                      disabled={responding === eng.id}
                      onClick={() => respond(eng.id, "decline")}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Decline
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {responded.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Past Engagements ({responded.length})
          </h2>
          {responded.map((eng) => (
            <Card key={eng.id} className={eng.status === "ACCEPTED" ? "border-l-4 border-l-green-400" : ""}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{eng.clientJob.title}</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {eng.clientJob.client.name}
                    <span>· {formatDate(eng.respondedAt || eng.invitedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={eng.status === "ACCEPTED" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}>
                    {eng.status === "ACCEPTED" ? (
                      <><CheckCircle className="h-3 w-3 mr-1" /> Accepted</>
                    ) : (
                      <><XCircle className="h-3 w-3 mr-1" /> Declined</>
                    )}
                  </Badge>
                  {eng.status === "ACCEPTED" && eng.jobId && (
                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => router.push(`/jobs/${eng.jobId}`)}>
                      View Job <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {engagements.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No engagement requests yet</h3>
            <p className="text-gray-500 text-sm">
              When hiring companies invite your firm to work on their searches, they'll appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
