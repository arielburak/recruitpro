"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, Search, MapPin, Link as LinkIcon, AlignLeft, Tag, Briefcase, Building2, User } from "lucide-react";

// Lightweight modal to create a personal calendar event. NOT an
// interview — these are Outlook-style blocks (follow-ups, reminders,
// internal syncs) with no candidate-facing email path. Per agency
// policy: events never mail anyone, ever.
//
// Optional "Related to" attaches the event to one CRM entity (a
// Client, a Candidate, or a Job) so the chip can link back to it.
// Mutually exclusive on the UI side to keep the picker simple; the
// API accepts any combination but we only surface one for now.

type Kind = "EVENT" | "FOLLOW_UP" | "REMINDER" | "MEETING";

const KIND_OPTIONS: { value: Kind; label: string; color: string }[] = [
  { value: "EVENT", label: "Event", color: "bg-slate-100 text-slate-700" },
  { value: "FOLLOW_UP", label: "Follow-up", color: "bg-amber-100 text-amber-700" },
  { value: "REMINDER", label: "Reminder", color: "bg-rose-100 text-rose-700" },
  { value: "MEETING", label: "Meeting", color: "bg-indigo-100 text-indigo-700" },
];

type Recurrence = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

type RelateKind = "NONE" | "CLIENT" | "CANDIDATE" | "JOB";

type Picked = { id: string; label: string };

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
    recurrenceEndDate?: string | null;
    client?: { id: string; name: string } | null;
    candidate?: { id: string; firstName: string; lastName: string } | null;
    job?: { id: string; title: string; client?: { name: string } | null } | null;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editingRecurrence: Recurrence | null =
    editing && editing.recurrence && RECURRENCE_OPTIONS.some((r) => r.value === editing.recurrence)
      ? (editing.recurrence as Recurrence)
      : null;
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
  const [recurrenceEnd, setRecurrenceEnd] = useState<string>(editingRecurrenceEnd);

  // Related-to picker. Pre-fill from `editing` if the event was
  // already attached to something, otherwise start "Not related".
  const initialRelate: { kind: RelateKind; picked: Picked | null } = editing?.client
    ? { kind: "CLIENT", picked: { id: editing.client.id, label: editing.client.name } }
    : editing?.candidate
      ? {
          kind: "CANDIDATE",
          picked: {
            id: editing.candidate.id,
            label: `${editing.candidate.firstName} ${editing.candidate.lastName}`,
          },
        }
      : editing?.job
        ? {
            kind: "JOB",
            picked: {
              id: editing.job.id,
              label: editing.job.client?.name
                ? `${editing.job.title} · ${editing.job.client.name}`
                : editing.job.title,
            },
          }
        : { kind: "NONE", picked: null };
  const [relateKind, setRelateKind] = useState<RelateKind>(initialRelate.kind);
  const [picked, setPicked] = useState<Picked | null>(initialRelate.picked);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Outside-click closes the search dropdown
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Search by relateKind. Debounced; cleared whenever the relation
  // kind switches so a stale Candidate search doesn't pollute a Job
  // result list.
  useEffect(() => {
    setResults([]);
    setSearch("");
    setPicked(null);
  }, [relateKind]);

  useEffect(() => {
    if (relateKind === "NONE" || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        let mapped: Picked[] = [];
        if (relateKind === "CLIENT") {
          const r = await fetch(`/api/clients?search=${encodeURIComponent(search)}&limit=8`);
          if (r.ok) {
            const d = await r.json();
            const list: any[] = Array.isArray(d) ? d : d.clients || [];
            mapped = list.map((c) => ({ id: c.id, label: c.name }));
          }
        } else if (relateKind === "CANDIDATE") {
          const r = await fetch(`/api/candidates?search=${encodeURIComponent(search)}&limit=8&mine=false`);
          if (r.ok) {
            const d = await r.json();
            const list: any[] = d.candidates || [];
            mapped = list.map((c) => ({
              id: c.id,
              label: `${c.firstName} ${c.lastName}`,
            }));
          }
        } else if (relateKind === "JOB") {
          const r = await fetch(`/api/jobs?search=${encodeURIComponent(search)}&limit=8`);
          if (r.ok) {
            const d = await r.json();
            const list: any[] = Array.isArray(d) ? d : d.jobs || [];
            mapped = list.map((j) => ({
              id: j.id,
              label: j.client?.name ? `${j.title} · ${j.client.name}` : j.title,
            }));
          }
        }
        setResults(mapped);
        setDropdownOpen(true);
      } catch {}
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search, relateKind]);

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
        recurrenceEndDate: recurrence && recurrenceEnd ? recurrenceEnd : null,
        clientId: relateKind === "CLIENT" ? picked?.id : null,
        candidateId: relateKind === "CANDIDATE" ? picked?.id : null,
        jobId: relateKind === "JOB" ? picked?.id : null,
      };

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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <Label htmlFor="event-title" className="text-xs font-medium text-gray-600">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Follow up with Acme, weekly team sync, …"
              className="mt-1"
              autoFocus
            />
          </div>

          {/* Kind */}
          <div>
            <Label className="text-xs font-medium text-gray-600 inline-flex items-center gap-1">
              <Tag className="h-3 w-3" /> Kind
            </Label>
            <div className="flex gap-1.5 mt-1">
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors border ${
                    kind === k.value
                      ? `${k.color} border-transparent`
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="event-date" className="text-xs font-medium text-gray-600">
                Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                All day
              </label>
            </div>
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="event-start" className="text-xs font-medium text-gray-600">
                  Start
                </Label>
                <Input
                  id="event-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="event-end" className="text-xs font-medium text-gray-600">
                  End
                </Label>
                <Input
                  id="event-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Repeat — Outlook-style toggle. Off = one-shot event; on
              opens a frequency picker (Daily / Weekly / Monthly /
              Yearly) and an optional "Until" date to bound the
              series. Indefinite series ("every week forever") work by
              leaving Until off. */}
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
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
              <span className="text-xs text-gray-700">Repeat</span>
            </label>
            {recurrence !== null && (
              <>
                <div className="flex gap-1.5">
                  {RECURRENCE_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRecurrence(r.value)}
                      className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors border ${
                        recurrence === r.value
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                          : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none mt-1">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={recurrenceEnd !== ""}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Default the "Until" date to a year out so
                        // the recruiter rarely has to think about it
                        // unless they actually want a tighter bound.
                        const next = new Date();
                        next.setFullYear(next.getFullYear() + 1);
                        setRecurrenceEnd(next.toISOString().split("T")[0]);
                      } else {
                        setRecurrenceEnd("");
                      }
                    }}
                  />
                  <span className="text-xs text-gray-700">Until a specific date</span>
                </label>
                {recurrenceEnd !== "" && (
                  <Input
                    type="date"
                    value={recurrenceEnd}
                    onChange={(e) => setRecurrenceEnd(e.target.value)}
                  />
                )}
              </>
            )}
          </div>

          {/* Related to */}
          <div>
            <Label className="text-xs font-medium text-gray-600">Related to</Label>
            <div className="flex gap-1.5 mt-1">
              {(
                [
                  { v: "NONE", label: "None", Icon: null },
                  { v: "CLIENT", label: "Client", Icon: Building2 },
                  { v: "CANDIDATE", label: "Candidate", Icon: User },
                  { v: "JOB", label: "Job", Icon: Briefcase },
                ] as { v: RelateKind; label: string; Icon: any }[]
              ).map((opt) => {
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setRelateKind(opt.v)}
                    className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors border inline-flex items-center justify-center gap-1 ${
                      relateKind === opt.v
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {relateKind !== "NONE" && (
              <div ref={pickerRef} className="relative mt-2">
                {picked ? (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-gray-50">
                    <span className="text-sm text-gray-900 truncate">{picked.label}</span>
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onFocus={() => results.length && setDropdownOpen(true)}
                        placeholder={`Search ${relateKind.toLowerCase()}…`}
                        className="pl-8"
                      />
                    </div>
                    {dropdownOpen && (search.length >= 2 || searching) && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                        {searching ? (
                          <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>
                        ) : results.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
                        ) : (
                          results.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setPicked(r);
                                setDropdownOpen(false);
                              }}
                              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                            >
                              {r.label}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Location + link */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="event-location" className="text-xs font-medium text-gray-600 inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Location
              </Label>
              <Input
                id="event-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Office, address…"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="event-link" className="text-xs font-medium text-gray-600 inline-flex items-center gap-1">
                <LinkIcon className="h-3 w-3" /> Link
              </Label>
              <Input
                id="event-link"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://…"
                className="mt-1"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="event-desc" className="text-xs font-medium text-gray-600 inline-flex items-center gap-1">
              <AlignLeft className="h-3 w-3" /> Description
            </Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 resize-none"
              placeholder="Optional notes…"
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
              {saving ? "Saving…" : editing ? "Save changes" : "Create event"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
