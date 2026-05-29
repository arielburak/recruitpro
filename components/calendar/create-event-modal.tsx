"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, MapPin, Link as LinkIcon, AlignLeft, Clock, Repeat } from "lucide-react";

// Lightweight modal to create a personal calendar event. NOT an
// interview — these are Outlook-style blocks (follow-ups, reminders)
// with no candidate-facing email path. Per agency policy: events
// never mail anyone, ever. Internal "meeting" use cases live on the
// Interview model, which carries candidate / submission / feedback
// and external invites; there's intentionally no overlap.

type Kind = "EVENT" | "FOLLOW_UP" | "REMINDER";

const KIND_OPTIONS: { value: Kind; label: string; color: string }[] = [
  { value: "EVENT", label: "Event", color: "bg-slate-100 text-slate-700" },
  { value: "FOLLOW_UP", label: "Follow-up", color: "bg-amber-100 text-amber-700" },
  { value: "REMINDER", label: "Reminder", color: "bg-rose-100 text-rose-700" },
];

type Recurrence = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

// Default event duration in minutes — chips have to start somewhere
// and 30 mins matches what the interview dialog defaults to. Changes
// to end-time after the user sets start are anchored on whatever
// duration they last picked, mirroring Outlook / Google Calendar.
const DEFAULT_DURATION_MIN = 30;

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(wrapped / 60);
  const nm = wrapped % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function diffMinutes(startHHMM: string, endHHMM: string): number {
  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export function CreateEventModal({
  defaultDate,
  editing,
  onClose,
  onSaved,
}: {
  defaultDate: Date | null;
  editing?: {
    id: string;
    title: string;
    description?: string | null;
    startTime: string;
    endTime: string;
    allDay?: boolean;
    location?: string | null;
    meetingLink?: string | null;
    kind: string;
    timezone?: string | null;
    recurrence?: string | null;
    recurrenceInterval?: number | null;
    recurrenceEndDate?: string | null;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editingRecurrence: Recurrence | null =
    editing && editing.recurrence && RECURRENCE_OPTIONS.some((r) => r.value === editing.recurrence)
      ? (editing.recurrence as Recurrence)
      : null;
  const editingRecurrenceInterval: number =
    editing && typeof editing.recurrenceInterval === "number" && editing.recurrenceInterval >= 1
      ? editing.recurrenceInterval
      : 1;
  const editingRecurrenceEnd: string =
    editing && editing.recurrenceEndDate
      ? new Date(editing.recurrenceEndDate).toISOString().split("T")[0]
      : "";

  const initial = editing
    ? {
        title: editing.title,
        description: editing.description || "",
        date: new Date(editing.startTime).toISOString().split("T")[0],
        start: new Date(editing.startTime)
          .toISOString()
          .split("T")[1]
          .slice(0, 5),
        end: new Date(editing.endTime).toISOString().split("T")[1].slice(0, 5),
        location: editing.location || "",
        meetingLink: editing.meetingLink || "",
        kind: (KIND_OPTIONS.some((k) => k.value === editing.kind)
          ? editing.kind
          : "EVENT") as Kind,
        allDay: Boolean(editing.allDay),
      }
    : {
        title: "",
        description: "",
        date: (defaultDate || new Date()).toISOString().split("T")[0],
        start: "09:00",
        end: "09:30",
        location: "",
        meetingLink: "",
        kind: "EVENT" as Kind,
        allDay: false,
      };

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.start);
  const [endTime, setEndTime] = useState(initial.end);
  const [location, setLocation] = useState(initial.location);
  const [meetingLink, setMeetingLink] = useState(initial.meetingLink);
  const [kind, setKind] = useState<Kind>(initial.kind);
  const [allDay, setAllDay] = useState(initial.allDay);

  // Outlook-style recurrence. `recurrence` is null on one-shot events;
  // when the user ticks the Repeat checkbox we default to WEEKLY (the
  // most common reminder cadence in practice). recurrenceEnd is its own
  // optional "Until …" toggle so an indefinite series ("every week
  // forever") stays representable.
  const [recurrence, setRecurrence] = useState<Recurrence | null>(editingRecurrence);
  // "Every N units" step. Stored as string so the input can be cleared
  // mid-edit without forcing a 0/NaN — we coerce to >=1 on save.
  const [recurrenceInterval, setRecurrenceInterval] = useState<string>(
    String(editingRecurrenceInterval),
  );
  const [recurrenceEnd, setRecurrenceEnd] = useState<string>(editingRecurrenceEnd);

  // Track the most recent intended duration so changing Start re-anchors
  // End and preserves the gap the user picked. Mirrors the interview
  // dialog: typing a later start shifts end forward by the same amount,
  // typing a new end updates the running duration for next time.
  const initialDuration = (() => {
    const d = diffMinutes(initial.start, initial.end);
    return d > 0 ? d : DEFAULT_DURATION_MIN;
  })();
  const [durationMin, setDurationMin] = useState<number>(initialDuration);

  function onStartChange(v: string) {
    setStartTime(v);
    // Slide End to keep the same duration. The user can still override
    // End manually afterwards — that just updates durationMin via the
    // onEndChange handler below.
    setEndTime(addMinutes(v, durationMin));
  }
  function onEndChange(v: string) {
    setEndTime(v);
    const d = diffMinutes(startTime, v);
    if (d > 0) setDurationMin(d);
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) {
      setError("Title and date are required");
      return;
    }
    // All-day events span the whole day in the user's timezone; we
    // submit 00:00 → 23:59 to keep the API contract identical to
    // timed events without introducing a second code path.
    const startStr = allDay ? "00:00" : startTime;
    const endStr = allDay ? "23:59" : endTime;
    const start = new Date(`${date}T${startStr}:00`);
    const end = new Date(`${date}T${endStr}:00`);
    if (end <= start) {
      setError("End time must be after start time");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || undefined,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        allDay,
        location: location.trim() || undefined,
        meetingLink: meetingLink.trim() || undefined,
        kind,
        recurrence: recurrence ?? null,
        recurrenceInterval: (() => {
          if (!recurrence) return 1;
          const n = Number(recurrenceInterval);
          return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
        })(),
        recurrenceEndDate: recurrence && recurrenceEnd ? recurrenceEnd : null,
      };
      // New events: never carry a CRM link from the modal — the
      // "Related to" picker was retired (events are personal scratch
      // space). Editing an existing event leaves whatever relation
      // already lived on the row alone, so legacy events keep their
      // chip caption ("FU with Acme") instead of silently losing it
      // when someone just changes the time.
      if (!editing) {
        payload.clientId = null;
        payload.candidateId = null;
        payload.jobId = null;
      }

      const url = editing ? `/api/events/${editing.id}` : "/api/events";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to save event");
        setSaving(false);
        return;
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Failed to save event");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? "Edit event" : "New event"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {/* Title — no label, big input, Outlook-style "Add title" */}
          <Input
            id="event-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title"
            className="text-base font-medium border-0 border-b border-gray-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-indigo-500"
            autoFocus
          />

          {/* Kind chip row — compact, no label */}
          <div className="flex gap-1.5">
            {KIND_OPTIONS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`text-xs py-1 px-3 rounded-full font-medium transition-colors border ${
                  kind === k.value
                    ? `${k.color} border-transparent`
                    : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Date + time on one row — date | start | "–" | end | All day */}
          <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
            <Input
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-0 px-1 h-8 w-auto focus-visible:ring-0"
            />
            {!allDay && (
              <>
                <Input
                  id="event-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => onStartChange(e.target.value)}
                  className="border-0 px-1 h-8 w-24 focus-visible:ring-0"
                />
                <span className="text-gray-400 text-sm">–</span>
                <Input
                  id="event-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => onEndChange(e.target.value)}
                  className="border-0 px-1 h-8 w-24 focus-visible:ring-0"
                />
              </>
            )}
            <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 ml-auto cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              All day
            </label>
          </div>

          {/* Repeat — collapsed when off; inline single-line summary
              when on. Outlook tucks recurrence inside a "Series" tab;
              here we keep it inline so a one-look glance shows the
              cadence. */}
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-gray-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={recurrence !== null}
                onChange={(e) => {
                  if (e.target.checked) {
                    setRecurrence("WEEKLY");
                  } else {
                    setRecurrence(null);
                    setRecurrenceEnd("");
                  }
                }}
              />
              <Repeat className="h-3.5 w-3.5 text-gray-400" />
              Repeat
            </label>
            {recurrence !== null && (
              <div className="pl-5 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Every</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={365}
                    value={recurrenceInterval}
                    onChange={(e) => setRecurrenceInterval(e.target.value)}
                    className="w-14 h-8 text-center text-sm"
                  />
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as Recurrence)}
                    className="h-8 px-2 rounded-md border border-gray-200 bg-white text-sm"
                  >
                    {RECURRENCE_OPTIONS.map((r) => {
                      const n = Number(recurrenceInterval) || 1;
                      const word: Record<Recurrence, [string, string]> = {
                        DAILY: ["day", "days"],
                        WEEKLY: ["week", "weeks"],
                        MONTHLY: ["month", "months"],
                        YEARLY: ["year", "years"],
                      };
                      return (
                        <option key={r.value} value={r.value}>
                          {n !== 1 ? word[r.value][1] : word[r.value][0]}
                        </option>
                      );
                    })}
                  </select>
                  <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 ml-auto cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={recurrenceEnd !== ""}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const next = new Date();
                          next.setFullYear(next.getFullYear() + 1);
                          setRecurrenceEnd(next.toISOString().split("T")[0]);
                        } else {
                          setRecurrenceEnd("");
                        }
                      }}
                    />
                    Until
                  </label>
                  {recurrenceEnd !== "" && (
                    <Input
                      type="date"
                      value={recurrenceEnd}
                      onChange={(e) => setRecurrenceEnd(e.target.value)}
                      className="h-8 w-auto text-sm"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Location — single icon-prefixed row */}
          <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
            <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
            <Input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add a location"
              className="border-0 px-0 h-8 focus-visible:ring-0"
            />
          </div>

          {/* Link — single icon-prefixed row */}
          <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
            <LinkIcon className="h-4 w-4 text-gray-400 shrink-0" />
            <Input
              id="event-link"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="Add a link (Zoom, Meet, …)"
              className="border-0 px-0 h-8 focus-visible:ring-0"
            />
          </div>

          {/* Description */}
          <div className="flex items-start gap-2 pt-1">
            <AlignLeft className="h-4 w-4 text-gray-400 shrink-0 mt-2" />
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none border-0 px-0 focus-visible:ring-0"
              placeholder="Add a description"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
