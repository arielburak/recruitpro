"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Video, Phone, MapPin } from "lucide-react";

// Small, pre-filled "schedule interview" dialog triggered from the
// pipeline kanban when a recruiter moves a candidate into the
// Interviewing stage. Stays intentionally lean — candidate, job and
// submission are already known (they came from the drop target), so we
// only ask for the new bits (when, what kind, link/location, notes).
// For multi-interviewer scheduling, Google/Meet auto-creation, etc.
// the recruiter goes to /calendar, which still hosts the full form.

type Submission = {
  id: string;
  candidateId: string;
  candidate: { firstName: string; lastName: string };
  job: { id: string; title: string };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submission: Submission;
  onScheduled?: () => void;
};

type InterviewType = "VIDEO" | "PHONE" | "IN_PERSON";

const TIMEZONE = "America/Argentina/Buenos_Aires";

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export function QuickInterviewDialog({
  open,
  onOpenChange,
  submission,
  onScheduled,
}: Props) {
  const candidateName = `${submission.candidate.firstName} ${submission.candidate.lastName}`.trim();
  const [title, setTitle] = useState(`Interview — ${candidateName}`);
  const [type, setType] = useState<InterviewType>("VIDEO");
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const endTime = addMinutes(startTime, duration);

  async function handleSchedule() {
    setSubmitting(true);
    setError("");
    try {
      const startDT = new Date(`${date}T${startTime}:00`);
      const endDT = new Date(`${date}T${endTime}:00`);
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          startTime: startDT.toISOString(),
          endTime: endDT.toISOString(),
          type,
          candidateId: submission.candidateId,
          jobId: submission.job.id,
          submissionId: submission.id,
          meetingLink: type === "IN_PERSON" ? undefined : meetingLink || undefined,
          location: type === "IN_PERSON" ? location || undefined : undefined,
          timezone: TIMEZONE,
          notes: notes || undefined,
          platform: "custom",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to schedule");
        setSubmitting(false);
        return;
      }
      onScheduled?.();
      onOpenChange(false);
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-600" />
            Schedule interview
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-xs text-gray-500">
            {candidateName} · {submission.job.title}
          </p>

          {/* Type picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "VIDEO", label: "Video", Icon: Video },
                { v: "PHONE", label: "Phone", Icon: Phone },
                { v: "IN_PERSON", label: "In person", Icon: MapPin },
              ] as const).map(({ v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setType(v)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-md border text-xs transition-colors ${
                    type === v
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Date + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duration</Label>
              <div className="flex gap-1">
                {[15, 30, 45, 60].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      duration === d
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {d < 60 ? `${d}m` : "1h"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End</Label>
              <Input
                type="time"
                value={endTime}
                readOnly
                className="text-sm bg-gray-50"
              />
            </div>
          </div>

          {/* Link or Location */}
          {type === "IN_PERSON" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Office address"
                className="text-sm"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Meeting link (optional)</Label>
              <Input
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="text-sm"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
              placeholder="Internal context, interviewers, prep notes..."
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-xs p-2 rounded">{error}</div>
          )}

          <p className="text-[11px] text-gray-400">
            Need to assign interviewers or auto-create a Google Meet?
            Open <span className="font-medium">/calendar</span> after this — you can edit
            from there.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Skip for now
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? "Scheduling..." : "Schedule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
