"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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
import { Calendar, Video, Phone, MapPin, Trash2 } from "lucide-react";
import { InterviewAttachments } from "./interview-attachments";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

// Generic schedule-or-edit interview dialog used from both the
// candidate page (picker = job) and the job page (picker = candidate).
// The picker is the only thing that varies between surfaces, so the
// caller passes a flat `pickerOptions` array + a label for the
// picker. Internally the dialog resolves the picked option back to
// (submissionId, candidateId, jobId) at POST time.
//
// In edit mode there is no picker — the interview already references
// a candidate + job and those identities are fixed.

type InterviewType = "VIDEO" | "PHONE" | "IN_PERSON";
type InterviewStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

const TIMEZONE = "America/Argentina/Buenos_Aires";

const STATUS_OPTIONS: { value: InterviewStatus; label: string }[] = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "NO_SHOW", label: "No-show" },
];

export type InterviewPickerOption = {
  submissionId: string;
  candidateId: string;
  jobId: string;
  label: string;
};

type ExistingInterview = {
  id: string;
  title: string;
  startTime: string | Date;
  endTime: string | Date;
  type: InterviewType;
  status: InterviewStatus;
  notes?: string | null;
  meetingLink?: string | null;
  location?: string | null;
  timezone?: string | null;
};

type Props =
  | {
      mode: "create";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      headerSubtitle: string; // e.g. "Nicolás Cuello" or "Desarrollador Python"
      defaultTitle: string;
      pickerLabel: string; // e.g. "Job" or "Candidate"
      pickerEmptyHint?: string;
      pickerOptions: InterviewPickerOption[];
      onSaved?: () => void;
    }
  | {
      mode: "edit";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      headerSubtitle: string;
      interview: ExistingInterview;
      onSaved?: () => void;
    };

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toIsoTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function todayISO() {
  return toIsoDate(new Date());
}

function diffMinutes(start: Date, end: Date): number {
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export function InterviewDialog(props: Props) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const isEdit = props.mode === "edit";
  const initial = isEdit ? props.interview : null;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const initialStart = initial ? new Date(initial.startTime) : null;
  const initialEnd = initial ? new Date(initial.endTime) : null;

  const [title, setTitle] = useState(
    initial?.title ?? (!isEdit ? props.defaultTitle : "")
  );
  const [type, setType] = useState<InterviewType>(initial?.type ?? "VIDEO");
  const [status, setStatus] = useState<InterviewStatus>(
    initial?.status ?? "SCHEDULED"
  );
  const [date, setDate] = useState(
    initialStart ? toIsoDate(initialStart) : todayISO()
  );
  const [startTime, setStartTime] = useState(
    initialStart ? toIsoTime(initialStart) : "10:00"
  );
  const [duration, setDuration] = useState(
    initialStart && initialEnd ? diffMinutes(initialStart, initialEnd) : 30
  );
  const [meetingLink, setMeetingLink] = useState(initial?.meetingLink ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const pickerOptions = !isEdit ? props.pickerOptions : [];
  const [selectedPickerId, setSelectedPickerId] = useState<string>(
    !isEdit && pickerOptions.length === 1 ? pickerOptions[0].submissionId : ""
  );

  const [notifyCandidate, setNotifyCandidate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const endTime = addMinutes(startTime, duration);

  async function handleSave() {
    setSubmitting(true);
    setError("");
    try {
      const startDT = new Date(`${date}T${startTime}:00`);
      const endDT = new Date(`${date}T${endTime}:00`);

      if (isEdit) {
        const res = await fetch(`/api/interviews/${initial!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            startTime: startDT.toISOString(),
            endTime: endDT.toISOString(),
            type,
            status,
            notes: notes || null,
            meetingLink: type === "IN_PERSON" ? null : meetingLink || null,
            location: type === "IN_PERSON" ? location || null : null,
            timezone: initial?.timezone || TIMEZONE,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to save");
          setSubmitting(false);
          return;
        }
      } else {
        if (!selectedPickerId) {
          setError(`Pick a ${props.pickerLabel.toLowerCase()} for this interview.`);
          setSubmitting(false);
          return;
        }
        const option = pickerOptions.find((o) => o.submissionId === selectedPickerId);
        if (!option) {
          setError("Selection not found.");
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/interviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            startTime: startDT.toISOString(),
            endTime: endDT.toISOString(),
            type,
            candidateId: option.candidateId,
            jobId: option.jobId,
            submissionId: option.submissionId,
            meetingLink: type === "IN_PERSON" ? undefined : meetingLink || undefined,
            location: type === "IN_PERSON" ? location || undefined : undefined,
            timezone: TIMEZONE,
            notes: notes || undefined,
            platform: "custom",
            notifyAttendees: notifyCandidate,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || "Failed to schedule");
          setSubmitting(false);
          return;
        }
      }
      props.onSaved?.();
      props.onOpenChange(false);
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/interviews/${initial!.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to delete");
        setSubmitting(false);
        return;
      }
      props.onSaved?.();
      props.onOpenChange(false);
    } catch {
      setError("Something went wrong");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-600" />
            {isEdit ? "Edit interview" : "Schedule interview"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isEdit ? (
            <p className="text-xs text-gray-500">{props.headerSubtitle}</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">{props.headerSubtitle}</p>
              <Label className="text-xs">{props.pickerLabel}</Label>
              {pickerOptions.length === 0 ? (
                <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                  {props.pickerEmptyHint || `No ${props.pickerLabel.toLowerCase()} options available.`}
                </p>
              ) : pickerOptions.length === 1 ? (
                <p className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                  {pickerOptions[0].label}
                </p>
              ) : (
                <select
                  className="w-full border rounded-md px-2 py-1.5 text-sm bg-white"
                  value={selectedPickerId}
                  onChange={(e) => setSelectedPickerId(e.target.value)}
                >
                  <option value="">Choose a {props.pickerLabel.toLowerCase()}...</option>
                  {pickerOptions.map((o) => (
                    <option key={o.submissionId} value={o.submissionId}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

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

          {/* Status (edit only) */}
          {isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`py-1.5 rounded-md text-xs font-medium transition-colors ${
                      status === opt.value
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

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
              rows={3}
              className="text-sm"
              placeholder="Internal context, interviewers, prep notes..."
            />
          </div>

          {/* Attachments — edit-only because we need a saved
              interviewId to associate uploads against. New interviews
              get this section after their first save. */}
          {isEdit && initial && (
            <InterviewAttachments
              interviewId={initial.id}
            />
          )}

          {/* Email opt-in (create only) */}
          {!isEdit && (
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyCandidate}
                onChange={(e) => setNotifyCandidate(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm text-gray-900">Also email a calendar invite to the candidate</p>
                <p className="text-[11px] text-gray-500">
                  Off by default. Leave unchecked if the candidate already got
                  the invite somewhere else.
                </p>
              </div>
            </label>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 text-xs p-2 rounded">{error}</div>
          )}
        </div>

        <div className="flex justify-between items-center gap-2">
          {isEdit && isAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={submitting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => props.onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {submitting
                ? "Saving..."
                : isEdit
                ? "Save changes"
                : notifyCandidate
                ? "Save & send invite"
                : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        itemLabel={title || "esta entrevista"}
        itemKind="entrevista"
        consequences={[
          "Feedback y notas asociadas",
          "Cualquier evento de calendario vinculado",
        ]}
        onConfirm={handleDelete}
        confirmLabel="Sí, borrar"
      />
    </Dialog>
  );
}

