"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  X,
  Search,
  User,
  Clock,
  Video,
  Phone,
  MapPin,
  Link as LinkIcon,
  AlignLeft,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Globe,
  Users as UsersIcon,
  Building2,
  Bell,
  BellOff,
} from "lucide-react";
import {
  TYPE_OPTIONS,
  PLATFORM_OPTIONS,
  TIMEZONE_OPTIONS,
  type PlatformOption,
} from "@/lib/calendar-options";

// Outlook-style Schedule Interview modal. Same idea as the event
// modal: 5 fields visible by default, the rest hidden behind a
// "Show more" toggle. Defaults are smart enough that the recruiter
// can save without touching anything except candidate + date /
// time:
//
//   visible       — title, candidate (with submission picker),
//                   date+start–end, type pill + contextual
//                   input (link / location), notes.
//   show more     — timezone, interviewers, client contacts,
//                   "Send invite to candidate" toggle.
//
// Behavior preserved from the previous modal:
//   - candidate search via /api/candidates?search=
//   - fetches submissions on candidate select; one-shot picks the
//     single submission automatically
//   - fetches client contacts when submission changes
//   - integration status (Google / MS) gates the platform picker
//   - POST /api/interviews with notifyAttendees opt-in (default OFF)

type CandidateOption = {
  id: string;
  firstName: string;
  lastName: string;
  submissions: {
    id: string;
    job: { id: string; title: string; client: { name: string } };
  }[];
};

type ClientContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

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

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Argentina/Buenos_Aires";
  } catch {
    return "America/Argentina/Buenos_Aires";
  }
}

export function CreateInterviewModal({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: Date | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Core fields
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(
    (defaultDate || new Date()).toISOString().split("T")[0],
  );
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [durationMin, setDurationMin] = useState<number>(DEFAULT_DURATION_MIN);
  const [type, setType] = useState("VIDEO");
  const [platform, setPlatform] = useState("google_meet");
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  // Show-more section
  const [showMore, setShowMore] = useState(false);
  const [timezone, setTimezone] = useState<string>(defaultTimezone());
  const [selectedInterviewers, setSelectedInterviewers] = useState<string[]>([]);
  const [selectedClientContacts, setSelectedClientContacts] = useState<string[]>([]);
  const [notifyAttendees, setNotifyAttendees] = useState(false);

  // Integration status — drives the platform picker. If Google isn't
  // connected, we silently flip the default to "custom" so the form
  // doesn't promise a Meet link the API can't create.
  const [googleConnected, setGoogleConnected] = useState(false);
  const [msConnected, setMsConnected] = useState(false);

  // Candidate search
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState<CandidateOption[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateOption | null>(null);
  const [candidateDropdownOpen, setCandidateDropdownOpen] = useState(false);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const candidateRef = useRef<HTMLDivElement>(null);

  // Submission (job) selection — shown only when the picked candidate
  // has more than one open submission. Single-submission candidates
  // auto-pick to keep the form lean.
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");

  // Team members + client contacts
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [clientContacts, setClientContacts] = useState<ClientContactOption[]>([]);

  // Fetch team members + integration status on mount
  useEffect(() => {
    fetch("/api/users/search?q=")
      .then((r) => r.json())
      .then((data) => setTeamMembers(data.users || []))
      .catch(() => {});
    fetch("/api/integrations/google/status")
      .then((r) => r.json())
      .then((data) => {
        const connected = data.connected || false;
        setGoogleConnected(connected);
        // If Google isn't connected, fall back to custom so the
        // platform picker isn't pre-set to something we can't honour.
        if (!connected) setPlatform("custom");
      })
      .catch(() => {});
    fetch("/api/integrations/microsoft/status")
      .then((r) => r.json())
      .then((data) => setMsConnected(data.connected || false))
      .catch(() => {});
  }, []);

  // Close candidate dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (candidateRef.current && !candidateRef.current.contains(e.target as Node)) {
        setCandidateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Search candidates with 300ms debounce
  useEffect(() => {
    if (candidateSearch.length < 2) {
      setCandidateResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearchingCandidates(true);
      try {
        const res = await fetch(
          `/api/candidates?search=${encodeURIComponent(candidateSearch)}&limit=10&mine=false`,
        );
        if (res.ok) {
          const data = await res.json();
          setCandidateResults(
            (data.candidates || []).map((c: any) => ({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
              submissions: [],
            })),
          );
          setCandidateDropdownOpen(true);
        }
      } catch {}
      setSearchingCandidates(false);
    }, 300);
    return () => clearTimeout(t);
  }, [candidateSearch]);

  // Fetch client contacts when submission changes
  useEffect(() => {
    if (!selectedSubmissionId || !selectedCandidate) {
      setClientContacts([]);
      setSelectedClientContacts([]);
      return;
    }
    const sub = selectedCandidate.submissions.find((s) => s.id === selectedSubmissionId);
    if (!sub) return;
    fetch(`/api/jobs/${sub.job.id}`)
      .then((r) => r.json())
      .then((job) => {
        if (job.clientId) {
          return fetch(`/api/contacts?clientId=${job.clientId}`).then((r) => r.json());
        }
        return [];
      })
      .then((contacts) => {
        setClientContacts(
          (contacts || []).map((c: any) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            title: c.title,
          })),
        );
      })
      .catch(() => {});
  }, [selectedSubmissionId, selectedCandidate]);

  async function pickCandidate(c: CandidateOption) {
    try {
      const res = await fetch(`/api/candidates/${c.id}`);
      if (!res.ok) return;
      const full = await res.json();
      const withSubs: CandidateOption = {
        id: full.id,
        firstName: full.firstName,
        lastName: full.lastName,
        submissions: (full.submissions || []).map((s: any) => ({
          id: s.id,
          job: {
            id: s.job.id,
            title: s.job.title,
            client: { name: s.job.client?.name || "" },
          },
        })),
      };
      setSelectedCandidate(withSubs);
      setCandidateDropdownOpen(false);
      setCandidateSearch("");
      setTitle(`Interview - ${full.firstName} ${full.lastName}`);
      if (withSubs.submissions.length === 1) {
        setSelectedSubmissionId(withSubs.submissions[0].id);
      } else {
        setSelectedSubmissionId("");
      }
      setSelectedClientContacts([]);
      setClientContacts([]);
    } catch {}
  }

  function onStartChange(v: string) {
    setStartTime(v);
    setEndTime(addMinutes(v, durationMin));
  }
  function onEndChange(v: string) {
    const d = diffMinutes(startTime, v);
    if (d > 0) {
      setEndTime(v);
      setDurationMin(d);
      return;
    }
    setEndTime(addMinutes(startTime, DEFAULT_DURATION_MIN));
    setDurationMin(DEFAULT_DURATION_MIN);
  }

  const selectedSubmission =
    selectedCandidate?.submissions.find((s) => s.id === selectedSubmissionId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCandidate) {
      setError("Pick a candidate first");
      return;
    }
    if (!selectedSubmissionId) {
      setError("Pick the job this interview is for");
      return;
    }

    setSaving(true);
    setError("");

    const start = new Date(`${date}T${startTime}:00`);
    let end = new Date(`${date}T${endTime}:00`);
    if (end <= start) {
      end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60 * 1000);
    }

    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:
            title.trim() ||
            `Interview - ${selectedCandidate.firstName} ${selectedCandidate.lastName}`,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          type,
          candidateId: selectedCandidate.id,
          jobId: selectedSubmission!.job.id,
          submissionId: selectedSubmissionId,
          platform,
          meetingLink: meetingLink.trim() || undefined,
          location: type === "IN_PERSON" ? location.trim() || undefined : undefined,
          timezone,
          notes: notes.trim() || undefined,
          interviewerIds: selectedInterviewers.length > 0 ? selectedInterviewers : undefined,
          clientContactIds:
            selectedClientContacts.length > 0 ? selectedClientContacts : undefined,
          notifyAttendees,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Failed to create interview");
        setSaving(false);
        return;
      }
      onCreated();
    } catch {
      setError("Failed to create interview");
      setSaving(false);
    }
  }

  // The contextual row right after the type picker. Video shows a
  // link field (auto-filled by Google/MS at save when integration is
  // connected); In Person shows a location field; Phone shows
  // nothing extra.
  function renderTypeContext() {
    if (type === "VIDEO") {
      return (
        <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
          <LinkIcon className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder={
              platform === "google_meet" && googleConnected
                ? "Auto-generated Google Meet link on save"
                : platform === "microsoft_teams" && msConnected
                  ? "Auto-generated Teams link on save"
                  : "Paste a Zoom / Meet / custom link"
            }
            className="border-0 px-0 h-8 focus-visible:ring-0"
          />
        </div>
      );
    }
    if (type === "IN_PERSON") {
      return (
        <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
          <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Office, address, room…"
            className="border-0 px-0 h-8 focus-visible:ring-0"
          />
        </div>
      );
    }
    return null;
  }

  // Show submission picker only if the candidate has more than one
  // open submission — single-submission candidates auto-pick.
  const submissionPickerVisible =
    !!selectedCandidate && selectedCandidate.submissions.length > 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Schedule interview</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {/* Title — bare input, auto-fills when a candidate is picked */}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add title"
            className="text-base font-medium border-0 border-b border-gray-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-indigo-500"
            autoFocus
          />

          {/* Candidate search row */}
          <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
            <User className="h-4 w-4 text-gray-400 shrink-0" />
            {selectedCandidate ? (
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm font-medium text-gray-900">
                  {selectedCandidate.firstName} {selectedCandidate.lastName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCandidate(null);
                    setSelectedSubmissionId("");
                    setTitle("");
                    setClientContacts([]);
                    setSelectedClientContacts([]);
                  }}
                  className="text-gray-400 hover:text-red-500 ml-auto"
                  aria-label="Clear candidate"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div ref={candidateRef} className="relative flex-1">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  className="w-full text-sm pl-6 pr-2 h-8 border-0 focus:outline-none focus-visible:ring-0 bg-transparent"
                  placeholder="Search candidate…"
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                  onFocus={() => candidateResults.length > 0 && setCandidateDropdownOpen(true)}
                />
                {candidateDropdownOpen && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-56 overflow-y-auto">
                    {searchingCandidates ? (
                      <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>
                    ) : candidateResults.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
                    ) : (
                      candidateResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickCandidate(c)}
                          className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          {c.firstName} {c.lastName}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submission picker — only if candidate has 2+ open jobs */}
          {submissionPickerVisible && (
            <div className="flex items-center gap-2 py-1.5 border-b border-gray-100">
              <Briefcase className="h-4 w-4 text-gray-400 shrink-0" />
              <select
                value={selectedSubmissionId}
                onChange={(e) => setSelectedSubmissionId(e.target.value)}
                className="flex-1 h-8 text-sm border-0 bg-transparent focus:outline-none focus-visible:ring-0"
              >
                <option value="">Pick a job…</option>
                {selectedCandidate?.submissions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.job.title}
                    {s.job.client.name && ` · ${s.job.client.name}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selectedCandidate && selectedCandidate.submissions.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
              This candidate has no active submissions yet. Submit them to a job first
              so the interview can be tied to a pipeline row.
            </p>
          )}

          {/* Date + start – end row */}
          <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 flex-wrap">
            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border-0 px-1 h-8 w-auto focus-visible:ring-0"
            />
            <Input
              type="time"
              value={startTime}
              onChange={(e) => onStartChange(e.target.value)}
              className="border-0 px-1 h-8 w-24 focus-visible:ring-0"
            />
            <span className="text-gray-400 text-sm">–</span>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => onEndChange(e.target.value)}
              className="border-0 px-1 h-8 w-24 focus-visible:ring-0"
            />
          </div>

          {/* Type pill row */}
          <div className="flex gap-1.5">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.value === "VIDEO" ? Video : opt.value === "PHONE" ? Phone : MapPin;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`text-xs py-1 px-3 rounded-full font-medium transition-colors border inline-flex items-center gap-1 ${
                    type === opt.value
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Contextual link / location row based on type */}
          {renderTypeContext()}

          {/* Notes */}
          <div className="flex items-start gap-2 pt-1">
            <AlignLeft className="h-4 w-4 text-gray-400 shrink-0 mt-2" />
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none border-0 px-0 focus-visible:ring-0"
              placeholder="Add notes (prep doc, talking points, …)"
            />
          </div>

          {/* Show more — advanced fields */}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
          >
            {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showMore ? "Less" : "Show more"}
          </button>

          {showMore && (
            <div className="space-y-3 pl-5 border-l-2 border-gray-100">
              {/* Platform picker — relevant for Video type */}
              {type === "VIDEO" && (
                <div className="flex items-center gap-2 py-1">
                  <Video className="h-4 w-4 text-gray-400 shrink-0" />
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="flex-1 h-8 text-sm border border-gray-200 rounded-md px-2"
                  >
                    {PLATFORM_OPTIONS.map((p: PlatformOption) => {
                      const disabled =
                        p.requiresIntegration &&
                        ((p.provider === "google" && !googleConnected) ||
                          (p.provider === "microsoft" && !msConnected));
                      return (
                        <option key={p.value} value={p.value} disabled={disabled}>
                          {p.label}
                          {disabled ? " — not connected" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Timezone */}
              <div className="flex items-center gap-2 py-1">
                <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex-1 h-8 text-sm border border-gray-200 rounded-md px-2"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label} ({tz.offset})
                    </option>
                  ))}
                </select>
              </div>

              {/* Interviewers (multi-select) */}
              {teamMembers.length > 0 && (
                <div className="flex items-start gap-2 py-1">
                  <UsersIcon className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                  <div className="flex-1 flex flex-wrap gap-1">
                    {teamMembers.map((u) => {
                      const picked = selectedInterviewers.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() =>
                            setSelectedInterviewers((curr) =>
                              picked ? curr.filter((id) => id !== u.id) : [...curr, u.id],
                            )
                          }
                          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                            picked
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          {u.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Client contacts (only if the picked job's client has any) */}
              {clientContacts.length > 0 && (
                <div className="flex items-start gap-2 py-1">
                  <Building2 className="h-4 w-4 text-gray-400 shrink-0 mt-1" />
                  <div className="flex-1 flex flex-wrap gap-1">
                    {clientContacts.map((c) => {
                      const picked = selectedClientContacts.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setSelectedClientContacts((curr) =>
                              picked ? curr.filter((id) => id !== c.id) : [...curr, c.id],
                            )
                          }
                          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                            picked
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          {c.firstName} {c.lastName}
                          {c.title && <span className="opacity-70"> · {c.title}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notify attendees — opt-in */}
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-gray-700 py-1">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={notifyAttendees}
                  onChange={(e) => setNotifyAttendees(e.target.checked)}
                />
                {notifyAttendees ? (
                  <Bell className="h-3.5 w-3.5 text-amber-600" />
                ) : (
                  <BellOff className="h-3.5 w-3.5 text-gray-400" />
                )}
                Send calendar invite to candidate
                {selectedClientContacts.length > 0 && " + selected client contacts"}
              </label>
            </div>
          )}

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
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
