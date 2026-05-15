"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Video,
  Phone,
  MapPin,
  CalendarDays,
  ExternalLink,
} from "lucide-react";

// Shared list rendering for the Interviews tab on both the candidate
// and job pages. The two surfaces differ only in what the secondary
// "with whom / for what" line says (a job title vs a candidate name)
// so we expose that via `attendeeKind`.
//
// Filter UX: by default only SCHEDULED ("upcoming, hasn't happened
// yet") rows are visible. A pill at the top lets the recruiter
// reveal the rest (COMPLETED / CANCELLED / NO_SHOW) when they want
// the full history. Counts go on the pill so they know what's
// being hidden.

const TYPE_LABEL: Record<string, string> = {
  VIDEO: "Video Call",
  PHONE: "Phone",
  IN_PERSON: "In Person",
};
const TYPE_ICON: Record<string, typeof Video> = {
  VIDEO: Video,
  PHONE: Phone,
  IN_PERSON: MapPin,
};
const STATUS_BG: Record<string, string> = {
  SCHEDULED: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-red-700",
  NO_SHOW: "bg-gray-100 text-gray-600",
};

export type InterviewRow = {
  id: string;
  title?: string | null;
  startTime: string | Date;
  endTime: string | Date;
  type: string;
  status: string;
  notes?: string | null;
  meetingLink?: string | null;
  location?: string | null;
  job?: { id: string; title: string } | null;
  candidate?: { id: string; firstName: string; lastName: string } | null;
};

type Props = {
  interviews: InterviewRow[];
  attendeeKind: "job" | "candidate";
  onRowClick: (iv: InterviewRow) => void;
};

export function InterviewsList({ interviews, attendeeKind, onRowClick }: Props) {
  const [showPast, setShowPast] = useState(false);

  const upcoming = interviews.filter((iv) => iv.status === "SCHEDULED");
  const past = interviews.filter((iv) => iv.status !== "SCHEDULED");
  const visible = showPast ? interviews : upcoming;

  if (interviews.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-500">
          No interviews scheduled yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {/* Filter pill — only render when there's something to hide */}
      {past.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {upcoming.length} upcoming
            {!showPast && past.length > 0 && (
              <span className="text-gray-400"> · {past.length} past hidden</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            {showPast ? "Hide past" : `Show past (${past.length})`}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            No upcoming interviews. {past.length > 0 && "All interviews for this row are completed or cancelled."}
          </CardContent>
        </Card>
      ) : (
        visible.map((iv) => {
          const start = new Date(iv.startTime);
          const dateLabel = start.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const timeLabel = start.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          });
          const Icon = TYPE_ICON[iv.type] || Video;
          const isPast = iv.status !== "SCHEDULED";
          return (
            <Card
              key={iv.id}
              className={`hover:shadow-md hover:border-indigo-200 transition cursor-pointer ${
                isPast ? "opacity-75" : ""
              }`}
              onClick={() => onRowClick(iv)}
            >
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
                      STATUS_BG[iv.status] || "bg-gray-50 text-gray-500"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">
                        {iv.title || TYPE_LABEL[iv.type] || iv.type}
                      </p>
                      <Badge className={STATUS_BG[iv.status] || "bg-gray-100 text-gray-700"}>
                        {iv.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      <CalendarDays className="inline h-3 w-3 mr-1 -mt-0.5" />
                      {dateLabel} · {timeLabel}
                    </p>
                    {attendeeKind === "job" && iv.job && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        For{" "}
                        <Link
                          href={`/jobs/${iv.job.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-indigo-600 hover:underline"
                        >
                          {iv.job.title}
                        </Link>
                      </p>
                    )}
                    {attendeeKind === "candidate" && iv.candidate && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        With{" "}
                        <Link
                          href={`/candidates/${iv.candidate.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-indigo-600 hover:underline"
                        >
                          {iv.candidate.firstName} {iv.candidate.lastName}
                        </Link>
                      </p>
                    )}
                    {iv.notes && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-3 whitespace-pre-wrap">
                        {iv.notes}
                      </p>
                    )}
                    {(iv.meetingLink || iv.location) && (
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {iv.meetingLink ? (
                          <a
                            href={iv.meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-indigo-600 inline-flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Join link
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {iv.location}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
