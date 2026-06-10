"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InterviewAttachments } from "@/components/interviews/interview-attachments";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  Phone,
  MapPin,
  Clock,
  User,
  Briefcase,
  Plus,
  X,
  Search,
  Trash2,
  ExternalLink,
  Globe,
  Pencil,
  Building2,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Star,
  Send,
  Calendar as CalendarIcon,
  Paperclip,
  BellOff,
  Bell,
  Flag,
  Users as UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { formatDateOnly } from "@/lib/utils";
import { FEATURES } from "@/lib/feature-flags";
import { CreateEventModal } from "@/components/calendar/create-event-modal";
import { CreateInterviewModal } from "@/components/calendar/create-interview-modal";
import {
  TYPE_OPTIONS,
  STATUS_COLORS,
  STATUS_LABELS,
  PLATFORM_OPTIONS,
  TIMEZONE_OPTIONS,
} from "@/lib/calendar-options";

// ─── Constants ───

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Map an interview's `type` string to a lucide icon for chip/list
// rendering. TYPE_OPTIONS itself is React-free (lives in lib/) so
// it can be imported from server code; the icon mapping stays
// client-side here.
function interviewTypeIcon(type: string) {
  if (type === "PHONE") return Phone;
  if (type === "IN_PERSON") return MapPin;
  return Video;
}

// ─── Types ───

type Interview = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
  notes?: string;
  meetingLink?: string;
  location?: string;
  timezone?: string;
  // True iff the candidate was emailed at create time. Calendar UI
  // surfaces a "internal only" marker when false. Pre-migration rows
  // come back false because we don't have a historical record.
  inviteSent?: boolean;
  candidate: { id: string; firstName: string; lastName: string };
  job: { id: string; title: string; client: { name: string } };
  creator: { name: string };
  interviewers: { user: { id: string; name: string } }[];
  clientContacts?: { contact: { id: string; firstName: string; lastName: string; email?: string; title?: string } }[];
  _count?: { documents?: number };
};

type InterviewFeedback = {
  id: string;
  type: string;
  rating: number | null;
  comment: string;
  authorName: string;
  userId: string | null;
  createdAt: string;
};

type ClientContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  title?: string;
};

type CandidateOption = {
  id: string;
  firstName: string;
  lastName: string;
  submissions: {
    id: string;
    job: { id: string; title: string; client: { name: string } };
  }[];
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

// Personal calendar event (Outlook-style). Renders alongside Interviews
// on the grid; per-user scope so only the creator sees them. The
// optional client/candidate/job link is what lets the chip caption read
// "FU with Acme" instead of just "FU".
type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string | null;
  meetingLink: string | null;
  timezone: string;
  kind: string;
  // Outlook-style recurrence. null = one-shot; otherwise the event
  // repeats from `startTime` at this cadence until
  // `recurrenceEndDate` (or forever if null). recurrenceInterval is
  // the step in the same unit (every 2 weeks, every 3 days, …). The
  // grid expands these into virtual chip occurrences on the client.
  recurrence: string | null;
  recurrenceInterval: number;
  recurrenceEndDate: string | null;
  client: { id: string; name: string } | null;
  candidate: { id: string; firstName: string; lastName: string } | null;
  job: { id: string; title: string; client: { name: string } | null } | null;
  creator: { id: string; name: string };
};

// ─── Component ───

export default function CalendarPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [currentDate, setCurrentDate] = useState(new Date());
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [showDeleteInterview, setShowDeleteInterview] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState<{ id: string; title: string } | null>(null);
  const [placements, setPlacements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<{
    kind: "first_day" | "payment_due" | "guarantee_expiry";
    date: Date;
    placement: any;
  } | null>(null);
  // Day-detail sidebar: clicking a day cell (or the "+N more" badge)
  // opens a panel with every event of that day, since the per-cell
  // chips cap at 3 to keep the grid readable.
  const [selectedDay, setSelectedDay] = useState<{
    day: number;
    month: number;
    year: number;
  } | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);

  // Edit modal state
  const [editingInterview, setEditingInterview] = useState<Interview | null>(null);

  // Personal calendar events (Outlook-like). Same range fetch + same
  // grid as Interviews; selectedEvent / editingEvent mirror the
  // interview/milestone sidebars below.
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // "Event or Interview?" chooser surfaced when the recruiter double-
  // clicks a day. Routed through a piece of state instead of jumping
  // straight to one or the other so the action remains explicit at
  // the call site.
  const [showCreateChooser, setShowCreateChooser] = useState(false);

  // Feedback state
  const [feedbackList, setFeedbackList] = useState<InterviewFeedback[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"INTERNAL" | "CLIENT">("INTERNAL");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackAuthor, setFeedbackAuthor] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    fetchInterviews();
    fetchEvents();
  }, [year, month]);

  // Placements are fetched once per mount — we render their milestones
  // (first day, payment due, guarantee expiry) on top of interviews so
  // the recruiter has one place to see everything that's happening
  // around their placed candidates. No date-range filter on the fetch
  // because the placements API is small enough that pulling all of
  // them and filtering in-memory beats threading another range param.
  useEffect(() => {
    fetch("/api/placements")
      .then((r) => r.json())
      .then((data) => setPlacements(Array.isArray(data) ? data : []))
      .catch(() => setPlacements([]));
  }, []);

  async function fetchInterviews() {
    setLoading(true);
    try {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month + 2, 0).toISOString();
      const res = await fetch(`/api/interviews?start=${start}&end=${end}`);
      if (res.ok) setInterviews(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }

  // Personal calendar events. Same 3-month window so the grid for the
  // visible month plus a buffer is always covered. Errors are silent —
  // events failing shouldn't take down the whole calendar view.
  async function fetchEvents() {
    try {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month + 2, 0).toISOString();
      const res = await fetch(`/api/events?start=${start}&end=${end}`);
      if (res.ok) setEvents(await res.json());
    } catch { /* silent */ }
  }

  // Placement milestones derived from the loaded placements. Three
  // kinds per placement, each only emitted when the underlying date
  // exists — so a placement with no actual startDate yet won't put a
  // "first day" pill on the wrong square.
  type MilestoneKind = "first_day" | "payment_due" | "guarantee_expiry";
  type Milestone = { kind: MilestoneKind; date: Date; placement: any };

  const milestones: Milestone[] = (() => {
    const out: Milestone[] = [];
    for (const p of placements) {
      // Fall back to estimatedStartDate when the firm date isn't set
      // yet — common for OS placements where the start often firms up
      // later than the deal close. We still mark them as "first day"
      // so they appear on the grid; the detail panel labels which
      // anchor was used.
      const startAnchor = p.startDate || p.estimatedStartDate;
      if (startAnchor) out.push({ kind: "first_day", date: new Date(startAnchor), placement: p });
      if (p.paymentDueDate) out.push({ kind: "payment_due", date: new Date(p.paymentDueDate), placement: p });
      if (p.guaranteeExpiry) out.push({ kind: "guarantee_expiry", date: new Date(p.guaranteeExpiry), placement: p });
    }
    return out;
  })();

  function getMilestonesForDay(day: number, m: number, y: number) {
    // Compare against the milestone's UTC date — values come from the
    // DB as UTC midnight on the user-typed day. Using getDate/getMonth/
    // getYear (local) flips the date back one day west of UTC, which
    // dropped milestones on the wrong cell of the grid.
    return milestones.filter((ms) => {
      const d = ms.date;
      return (
        d.getUTCDate() === day &&
        d.getUTCMonth() === m &&
        d.getUTCFullYear() === y
      );
    });
  }

  function milestoneCandidateName(ms: Milestone): string {
    const candidate = ms.placement.submission?.candidate;
    if (!candidate) return "Candidate";
    return `${candidate.firstName} ${candidate.lastName?.charAt(0) || ""}.`;
  }

  function milestoneClient(ms: Milestone): string {
    return ms.placement.client?.name || "";
  }

  function milestoneKindLabel(kind: MilestoneKind): string {
    if (kind === "first_day") return "First day";
    if (kind === "payment_due") return "Payment due";
    return "Guarantee expires";
  }

  // Two-line chip: small uppercase kind label on top, candidate · client
  // below. Quieter palette: neutral slate background for all three
  // kinds, with a colored left-border accent + colored label so the
  // kind is still discriminable at a glance. The previous
  // emerald+amber+rose palette competed with itself; this reads
  // closer to a Linear / Outlook event — serious, calm, not loud.
  function milestoneClassNames(kind: MilestoneKind): { wrapper: string; label: string; meta: string } {
    if (kind === "first_day") {
      return {
        wrapper: "bg-slate-50 hover:bg-slate-100 border-l-2 border-emerald-500",
        label: "text-emerald-700",
        meta: "text-slate-600",
      };
    }
    if (kind === "payment_due") {
      return {
        wrapper: "bg-slate-50 hover:bg-slate-100 border-l-2 border-indigo-500",
        label: "text-indigo-700",
        meta: "text-slate-600",
      };
    }
    return {
      wrapper: "bg-slate-50 hover:bg-slate-100 border-l-2 border-amber-500",
      label: "text-amber-700",
      meta: "text-slate-600",
    };
  }

  // Same two-line treatment as milestone chips so interview events sit
  // visually alongside placement events on the grid. Cancelled / completed
  // override anything else; otherwise the color encodes the interview's
  // purpose so the calendar tells you at-a-glance whether a slot is a
  // candidate prep call (indigo) or a client-side interview where the
  // hiring contact also shows up (amber). Purpose is inferred from
  // whether any client contacts were attached — there's no enum on the
  // model, but `clientContacts.length > 0` is what the dialog uses to
  // route a CLIENT vs CANDIDATE flow, so we use the same signal here.
  type InterviewPurpose = "CANDIDATE" | "CLIENT";
  function interviewPurpose(iv: any): InterviewPurpose {
    return Array.isArray(iv.clientContacts) && iv.clientContacts.length > 0
      ? "CLIENT"
      : "CANDIDATE";
  }
  function interviewClassNames(
    status: string,
    purpose: InterviewPurpose
  ): { wrapper: string; label: string; meta: string } {
    if (status === "CANCELLED") {
      return {
        wrapper: "bg-red-50 hover:bg-red-100 border-l-2 border-red-500",
        label: "text-red-800",
        meta: "text-red-700",
      };
    }
    if (status === "COMPLETED") {
      return {
        wrapper: "bg-green-50 hover:bg-green-100 border-l-2 border-green-500",
        label: "text-green-800",
        meta: "text-green-700",
      };
    }
    if (purpose === "CLIENT") {
      return {
        wrapper: "bg-amber-50 hover:bg-amber-100 border-l-2 border-amber-500",
        label: "text-amber-900",
        meta: "text-amber-800",
      };
    }
    return {
      wrapper: "bg-indigo-50 hover:bg-indigo-100 border-l-2 border-indigo-500",
      label: "text-indigo-800",
      meta: "text-indigo-700",
    };
  }

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }
  function goToday() { setCurrentDate(new Date()); }

  // Calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarDays: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    calendarDays.push({ day: daysInPrevMonth - i, month: month - 1, year: month === 0 ? year - 1 : year, isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({ day: d, month, year, isCurrentMonth: true });
  }
  const remaining = 42 - calendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    calendarDays.push({ day: d, month: month + 1, year: month === 11 ? year + 1 : year, isCurrentMonth: false });
  }

  function getInterviewsForDay(day: number, m: number, y: number) {
    return interviews.filter((iv) => {
      const d = new Date(iv.startTime);
      return d.getDate() === day && d.getMonth() === m && d.getFullYear() === y;
    });
  }

  // Expand a single CalendarEvent into the set of (day, month, year)
  // cells where it should render a chip. For a one-shot event this is
  // just one date; for a recurring event we walk forward from the base
  // startTime at the requested cadence until we leave the lookahead
  // window or hit recurrenceEndDate. We cap iterations defensively so
  // a malformed series (recurrence set without a sane cadence) can
  // never loop forever in the browser.
  function eventOccursOn(ev: CalendarEvent, day: number, m: number, y: number): boolean {
    const base = new Date(ev.startTime);
    const target = new Date(y, m, day);
    if (target < new Date(base.getFullYear(), base.getMonth(), base.getDate())) {
      return false;
    }
    if (ev.recurrenceEndDate) {
      const stop = new Date(ev.recurrenceEndDate);
      if (target > stop) return false;
    }
    if (!ev.recurrence) {
      return (
        base.getDate() === day &&
        base.getMonth() === m &&
        base.getFullYear() === y
      );
    }
    // `recurrenceInterval` is the step in the recurrence unit. For
    // each cadence the predicate has two checks: the natural unit
    // alignment (same weekday, same day-of-month, etc.) AND whether
    // the offset from base is a whole multiple of the interval. An
    // interval <= 0 is impossible to satisfy below — defensively
    // clamp to 1 so a bad row never silently hides every occurrence.
    const step = ev.recurrenceInterval && ev.recurrenceInterval >= 1 ? ev.recurrenceInterval : 1;
    if (ev.recurrence === "DAILY") {
      const dayMs = 24 * 60 * 60 * 1000;
      const baseDay = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
      const targetDay = target.getTime();
      const diffDays = Math.round((targetDay - baseDay) / dayMs);
      return diffDays >= 0 && diffDays % step === 0;
    }
    if (ev.recurrence === "WEEKLY") {
      if (base.getDay() !== target.getDay()) return false;
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const baseDay = new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime();
      const diffWeeks = Math.round((target.getTime() - baseDay) / weekMs);
      return diffWeeks >= 0 && diffWeeks % step === 0;
    }
    if (ev.recurrence === "MONTHLY") {
      if (base.getDate() !== target.getDate()) return false;
      const diffMonths =
        (target.getFullYear() - base.getFullYear()) * 12 +
        (target.getMonth() - base.getMonth());
      return diffMonths >= 0 && diffMonths % step === 0;
    }
    if (ev.recurrence === "YEARLY") {
      if (base.getMonth() !== m || base.getDate() !== day) return false;
      const diffYears = target.getFullYear() - base.getFullYear();
      return diffYears >= 0 && diffYears % step === 0;
    }
    return false;
  }

  function getEventsForDay(day: number, m: number, y: number) {
    return events.filter((ev) => eventOccursOn(ev, day, m, y));
  }

  // Map the event's free-form `kind` to a chip style + icon. Unknown
  // kinds fall back to the neutral EVENT palette so the UI doesn't
  // break if a future kind ships before the front-end is updated.
  function eventClassNames(kind: string): { wrapper: string; label: string; meta: string; Icon: any; kindLabel: string } {
    if (kind === "FOLLOW_UP") {
      return {
        wrapper: "bg-amber-50 hover:bg-amber-100 border-l-2 border-amber-500",
        label: "text-amber-800",
        meta: "text-amber-700",
        Icon: Flag,
        kindLabel: "Follow-up",
      };
    }
    if (kind === "REMINDER") {
      return {
        wrapper: "bg-rose-50 hover:bg-rose-100 border-l-2 border-rose-500",
        label: "text-rose-800",
        meta: "text-rose-700",
        Icon: Bell,
        kindLabel: "Reminder",
      };
    }
    if (kind === "MEETING") {
      return {
        wrapper: "bg-indigo-50 hover:bg-indigo-100 border-l-2 border-indigo-500",
        label: "text-indigo-800",
        meta: "text-indigo-700",
        Icon: UsersIcon,
        kindLabel: "Meeting",
      };
    }
    return {
      wrapper: "bg-slate-100 hover:bg-slate-200 border-l-2 border-slate-500",
      label: "text-slate-800",
      meta: "text-slate-700",
      Icon: CalendarIcon,
      kindLabel: "Event",
    };
  }

  // Human caption for the chip's second line: "FU with Acme" /
  // "Touch base with John Doe" / "Sync on Sales VP". Falls back to
  // empty so the chip only shows the title in pure-personal events.
  function eventCaption(ev: CalendarEvent): string {
    if (ev.candidate) return `${ev.candidate.firstName} ${ev.candidate.lastName}`;
    if (ev.job) return ev.job.client?.name ? `${ev.job.title} · ${ev.job.client.name}` : ev.job.title;
    if (ev.client) return ev.client.name;
    return "";
  }

  const today = new Date();
  const isToday = (day: number, m: number, y: number) =>
    day === today.getDate() && m === today.getMonth() && y === today.getFullYear();

  // Upcoming
  const nowMs = Date.now();
  const weekFromNow = nowMs + 7 * 24 * 60 * 60 * 1000;
  const upcoming = interviews
    .filter((iv) => new Date(iv.startTime).getTime() >= nowMs && new Date(iv.startTime).getTime() <= weekFromNow && iv.status === "SCHEDULED")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // Same 7-day window for placement milestones (first day, payment
  // due, guarantee expiry). The grid already renders these per-day;
  // the sidebar feed surfaces them as a single "what's coming up"
  // list so the recruiter doesn't have to scan the whole month.
  const upcomingMilestones = milestones
    .filter((ms) => ms.date.getTime() >= nowMs && ms.date.getTime() <= weekFromNow)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Personal events in the same 7-day window. Joined into the same
  // upcoming feed below so reminders / follow-ups sit alongside
  // interviews and milestones. Recurring events get walked day-by-day
  // through the 7-day window and surface as one feed item per
  // occurrence — same as the grid expansion above so the sidebar
  // matches what the user sees on the calendar.
  type EventOccurrence = { event: CalendarEvent; date: Date };
  const upcomingEvents: EventOccurrence[] = (() => {
    const out: EventOccurrence[] = [];
    for (const ev of events) {
      const base = new Date(ev.startTime);
      if (!ev.recurrence) {
        const t = base.getTime();
        if (t >= nowMs && t <= weekFromNow) out.push({ event: ev, date: base });
        continue;
      }
      // Walk one day at a time through the 7-day window and pick the
      // days where the cadence fires. Same predicate as the grid so
      // the two views can't disagree on which days an event hits.
      for (let d = new Date(nowMs); d.getTime() <= weekFromNow; d.setDate(d.getDate() + 1)) {
        if (eventOccursOn(ev, d.getDate(), d.getMonth(), d.getFullYear())) {
          // Pin the time of day to the base event so "9:00 weekly
          // sync" still reads 9am on each occurrence chip.
          const occ = new Date(d);
          occ.setHours(base.getHours(), base.getMinutes(), 0, 0);
          if (occ.getTime() >= nowMs && occ.getTime() <= weekFromNow) {
            out.push({ event: ev, date: occ });
          }
        }
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  })();

  function formatTime(dateStr: string, tz?: string) {
    try {
      return new Date(dateStr).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", hour12: true,
        ...(tz ? { timeZone: tz } : {}),
      });
    } catch {
      return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
  }
  function formatDateShort(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function getTimezoneLabel(tz?: string) {
    if (!tz) return "";
    const found = TIMEZONE_OPTIONS.find((t) => t.value === tz);
    return found ? found.label : tz.split("/").pop()?.replace(/_/g, " ") || "";
  }

  // Open a small picker that asks "Event or Interview?" instead of
  // jumping straight to the interview modal. The day cell + the
  // sidebar Plus button both flow through here so the choice is
  // surfaced consistently. Header buttons still create directly —
  // they're already pre-disambiguated by the button itself.
  function openCreate(day: number, m: number, y: number) {
    setCreateDate(new Date(y, m, day, 9, 0));
    setShowCreateChooser(true);
  }

  function chooseInterview() {
    setShowCreateChooser(false);
    setShowCreateModal(true);
  }
  function chooseEvent() {
    setShowCreateChooser(false);
    setShowCreateEventModal(true);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/interviews/${id}`, { method: "DELETE" });
    setSelectedInterview(null);
    fetchInterviews();
  }

  // Fetch feedback when interview is selected
  useEffect(() => {
    if (selectedInterview) {
      fetchFeedback(selectedInterview.id);
    } else {
      setFeedbackList([]);
      setShowFeedbackForm(false);
    }
  }, [selectedInterview?.id]);

  async function fetchFeedback(interviewId: string) {
    setFeedbackLoading(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/feedback`);
      if (res.ok) setFeedbackList(await res.json());
    } catch { /* silent */ }
    setFeedbackLoading(false);
  }

  async function submitFeedback() {
    if (!selectedInterview || !feedbackComment.trim()) return;
    setFeedbackSubmitting(true);
    try {
      const res = await fetch(`/api/interviews/${selectedInterview.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          rating: feedbackRating || null,
          comment: feedbackComment,
          authorName: feedbackType === "CLIENT" ? feedbackAuthor : undefined,
        }),
      });
      if (res.ok) {
        setFeedbackComment("");
        setFeedbackRating(0);
        setFeedbackAuthor("");
        setShowFeedbackForm(false);
        fetchFeedback(selectedInterview.id);
      }
    } catch { /* silent */ }
    setFeedbackSubmitting(false);
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/interviews/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSelectedInterview(null);
    fetchInterviews();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-gray-500">
            {(() => {
              // Inline count of scheduled interviews this Mon–Sun.
              // Used to live in the dashboard Action Center; now
              // surfaces where the user is actually planning their
              // week.
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const monOffset = (today.getDay() + 6) % 7;
              const weekStart = new Date(today);
              weekStart.setDate(today.getDate() - monOffset);
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekStart.getDate() + 6);
              weekEnd.setHours(23, 59, 59, 999);
              const count = interviews.filter((i) => {
                const t = new Date(i.startTime).getTime();
                return (
                  i.status === "SCHEDULED" &&
                  t >= weekStart.getTime() &&
                  t <= weekEnd.getTime()
                );
              }).length;
              return count === 0
                ? "Interviews, follow-ups and reminders"
                : `${count} interview${count === 1 ? "" : "s"} scheduled this week`;
            })()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setCreateDate(new Date());
              setShowCreateEventModal(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Event
          </Button>
          <Button onClick={() => { setCreateDate(new Date()); setShowCreateModal(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Schedule Interview
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                  <h2 className="text-lg font-semibold min-w-[180px] text-center">{MONTHS[month]} {year}</h2>
                  <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={goToday} className="ml-2 text-xs">Today</Button>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 border-t border-l">
                {calendarDays.map((cd, idx) => {
                  const dayInterviews = getInterviewsForDay(cd.day, cd.month, cd.year);
                  const dayMilestones = getMilestonesForDay(cd.day, cd.month, cd.year);
                  const dayEvents = getEventsForDay(cd.day, cd.month, cd.year);
                  const todayHighlight = isToday(cd.day, cd.month, cd.year);
                  // Interviews + events + milestones share the same row
                  // cap so the calendar grid doesn't grow unevenly.
                  // Order: interviews first (time-sensitive "show up at
                  // 3pm"), then personal events (follow-ups / reminders),
                  // then milestones (date-only). All three are
                  // chronological within their bucket.
                  const totalEvents = dayInterviews.length + dayEvents.length + dayMilestones.length;
                  // Show up to 6 chips per day before collapsing the rest
                  // behind "+N more". Cells are sized to fit that many
                  // comfortably; if it's still not enough, the day-detail
                  // sidebar covers the full list.
                  const CELL_CAP = 6;
                  const interviewsToShow = dayInterviews.slice(0, CELL_CAP);
                  const eventsToShow = dayEvents.slice(
                    0,
                    Math.max(0, CELL_CAP - interviewsToShow.length),
                  );
                  const milestonesToShow = dayMilestones.slice(
                    0,
                    Math.max(0, CELL_CAP - interviewsToShow.length - eventsToShow.length),
                  );
                  const overflow =
                    totalEvents - interviewsToShow.length - eventsToShow.length - milestonesToShow.length;

                  return (
                    <div
                      key={idx}
                      className={`group min-h-[170px] border-r border-b p-1 cursor-pointer transition-colors ${
                        cd.isCurrentMonth ? "bg-white hover:bg-indigo-50/30" : "bg-gray-50/50"
                      } ${
                        selectedDay &&
                        selectedDay.day === cd.day &&
                        selectedDay.month === cd.month &&
                        selectedDay.year === cd.year
                          ? "ring-2 ring-inset ring-indigo-300 bg-indigo-50/40"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedInterview(null);
                        setSelectedMilestone(null);
                        setSelectedDay({ day: cd.day, month: cd.month, year: cd.year });
                      }}
                      onDoubleClick={() => openCreate(cd.day, cd.month, cd.year)}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <div className={`text-xs font-medium ${
                          todayHighlight
                            ? "bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center"
                            : cd.isCurrentMonth ? "text-gray-900" : "text-gray-400"
                        }`}>
                          {cd.day}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openCreate(cd.day, cd.month, cd.year); }}
                          className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-indigo-100 text-indigo-500 transition-opacity"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="space-y-0.5">
                        {interviewsToShow.map((iv) => {
                          const purpose = interviewPurpose(iv);
                          const styles = interviewClassNames(iv.status, purpose);
                          const candidateName = `${iv.candidate.firstName} ${iv.candidate.lastName.charAt(0)}.`;
                          const jobTitle = iv.job.title;
                          const meta = jobTitle ? `${candidateName} · ${jobTitle}` : candidateName;
                          const time = formatTime(iv.startTime);
                          const typeLabel = TYPE_OPTIONS.find((t) => t.value === iv.type)?.label || iv.type;
                          const docCount = iv._count?.documents || 0;
                          return (
                            <button
                              key={iv.id}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedMilestone(null); setSelectedDay(null); setSelectedInterview(iv); }}
                              className={`block w-full text-left rounded-r px-1.5 py-1 leading-tight ${styles.wrapper}`}
                              title={
                                `${purpose === "CLIENT" ? "Client interview" : "Candidate call"} · ${time} · ${typeLabel} · ${meta}` +
                                (docCount > 0 ? ` · ${docCount} attachment${docCount === 1 ? "" : "s"}` : "") +
                                (iv.inviteSent === false ? " · internal only — no invite sent" : "")
                              }
                            >
                              <p className={`text-[9px] font-semibold uppercase tracking-wide ${styles.label} flex items-center gap-1`}>
                                <span>{time} · {typeLabel}</span>
                                {docCount > 0 && (
                                  // At-a-glance indicator: there are
                                  // files pinned to this interview.
                                  // Clicking the chip still opens the
                                  // sidebar where the files are listed.
                                  <Paperclip className="h-2.5 w-2.5 opacity-70" />
                                )}
                                {iv.inviteSent === false && (
                                  // "Internal only" marker — candidate
                                  // wasn't emailed. Mirrors the amber
                                  // banner inside the create dialog so
                                  // the state is recognisable across
                                  // surfaces.
                                  <BellOff className="h-2.5 w-2.5 opacity-70" />
                                )}
                              </p>
                              <p className={`text-[10px] truncate ${styles.meta} ${iv.status === "CANCELLED" ? "line-through" : ""}`}>
                                {meta}
                              </p>
                            </button>
                          );
                        })}
                        {eventsToShow.map((ev) => {
                          const styles = eventClassNames(ev.kind);
                          const caption = eventCaption(ev);
                          const meta = caption ? `${ev.title} · ${caption}` : ev.title;
                          const time = ev.allDay ? "All day" : formatTime(ev.startTime);
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedInterview(null);
                                setSelectedMilestone(null);
                                setSelectedDay(null);
                                setSelectedEvent(ev);
                              }}
                              className={`block w-full text-left rounded-r px-1.5 py-1 leading-tight ${styles.wrapper}`}
                              title={`${styles.kindLabel} · ${time} · ${meta}`}
                            >
                              <p className={`text-[9px] font-semibold uppercase tracking-wide ${styles.label}`}>
                                {time} · {styles.kindLabel}
                              </p>
                              <p className={`text-[10px] truncate ${styles.meta}`}>
                                {ev.title}
                                {caption && (
                                  <span className="opacity-70"> · {caption}</span>
                                )}
                              </p>
                            </button>
                          );
                        })}
                        {milestonesToShow.map((ms, i) => {
                          const styles = milestoneClassNames(ms.kind);
                          const candidate = milestoneCandidateName(ms);
                          const client = milestoneClient(ms);
                          const meta = client ? `${candidate} · ${client}` : candidate;
                          const kindLabel = milestoneKindLabel(ms.kind);
                          return (
                            <button
                              key={`${ms.placement.id}-${ms.kind}-${i}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedInterview(null);
                                setSelectedDay(null);
                                setSelectedMilestone(ms);
                              }}
                              className={`block w-full text-left rounded-r px-1.5 py-1 leading-tight ${styles.wrapper}`}
                              title={`${kindLabel} · ${meta}`}
                            >
                              <p className={`text-[9px] font-semibold uppercase tracking-wide ${styles.label}`}>
                                {kindLabel}
                              </p>
                              <p className={`text-[10px] truncate ${styles.meta}`}>
                                {meta}
                              </p>
                            </button>
                          );
                        })}
                        {overflow > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInterview(null);
                              setSelectedMilestone(null);
                              setSelectedDay({ day: cd.day, month: cd.month, year: cd.year });
                            }}
                            className="text-[10px] text-gray-500 hover:text-indigo-600 px-1 text-left"
                          >
                            +{overflow} more
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {selectedDay && (() => {
            const dayInterviews = getInterviewsForDay(
              selectedDay.day,
              selectedDay.month,
              selectedDay.year,
            ).sort(
              (a, b) =>
                new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
            );
            const dayMilestones = getMilestonesForDay(
              selectedDay.day,
              selectedDay.month,
              selectedDay.year,
            );
            const dayEvents = getEventsForDay(
              selectedDay.day,
              selectedDay.month,
              selectedDay.year,
            ).sort(
              (a, b) =>
                new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
            );
            const total = dayInterviews.length + dayEvents.length + dayMilestones.length;
            const dateLabel = new Date(
              selectedDay.year,
              selectedDay.month,
              selectedDay.day,
            ).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            });
            return (
              <Card className="border-indigo-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{dateLabel}</h3>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {total === 0
                          ? "No events scheduled"
                          : `${total} event${total === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setCreateDate(
                            new Date(
                              selectedDay.year,
                              selectedDay.month,
                              selectedDay.day,
                              9,
                              0,
                            ),
                          );
                          setShowCreateEventModal(true);
                        }}
                        className="text-gray-400 hover:text-indigo-600 p-0.5 rounded hover:bg-indigo-50"
                        title="Add event on this day"
                      >
                        <Bell className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          openCreate(
                            selectedDay.day,
                            selectedDay.month,
                            selectedDay.year,
                          )
                        }
                        className="text-gray-400 hover:text-indigo-600 p-0.5 rounded hover:bg-indigo-50"
                        title="Schedule interview on this day"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setSelectedDay(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {total === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">
                      Click + to schedule an interview or the bell to add an event.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {dayInterviews.map((iv) => {
                        const purpose = interviewPurpose(iv);
                        const styles = interviewClassNames(iv.status, purpose);
                        const Icon = interviewTypeIcon(iv.type);
                        return (
                          <button
                            key={iv.id}
                            type="button"
                            onClick={() => {
                              setSelectedDay(null);
                              setSelectedMilestone(null);
                              setSelectedInterview(iv);
                            }}
                            className={`flex w-full items-start gap-2 text-left rounded-r px-2 py-1.5 hover:opacity-90 ${styles.wrapper}`}
                          >
                            <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${styles.label}`} />
                            <div className="min-w-0 flex-1">
                              <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.label} flex items-center gap-1 flex-wrap`}>
                                <span>
                                  {formatTime(iv.startTime)} ·{" "}
                                  {TYPE_OPTIONS.find((t) => t.value === iv.type)?.label || iv.type}
                                  {" · "}
                                  {/* Purpose pill on the sidebar list. The
                                      color already tells you, but spelling
                                      it out helps colorblind users and
                                      avoids ambiguity when the row is
                                      cancelled/completed (those overrides
                                      drop the purpose hue). */}
                                  <span className="ml-0.5 opacity-80">
                                    {purpose === "CLIENT" ? "Client" : "Candidate"}
                                  </span>
                                </span>
                                {(iv._count?.documents || 0) > 0 && (
                                  <Paperclip className="h-2.5 w-2.5 opacity-70" />
                                )}
                                {iv.inviteSent === false && (
                                  <BellOff className="h-2.5 w-2.5 opacity-70" />
                                )}
                              </p>
                              <p className={`text-xs truncate ${styles.meta} ${iv.status === "CANCELLED" ? "line-through" : ""}`}>
                                {iv.candidate.firstName} {iv.candidate.lastName}
                                {iv.job?.title && (
                                  <span className="text-gray-400"> · {iv.job.title}</span>
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                      {dayEvents.map((ev) => {
                        const styles = eventClassNames(ev.kind);
                        const caption = eventCaption(ev);
                        const time = ev.allDay ? "All day" : formatTime(ev.startTime);
                        const Icon = styles.Icon;
                        return (
                          <button
                            key={`ev-${ev.id}`}
                            type="button"
                            onClick={() => {
                              setSelectedDay(null);
                              setSelectedInterview(null);
                              setSelectedMilestone(null);
                              setSelectedEvent(ev);
                            }}
                            className={`flex w-full items-start gap-2 text-left rounded-r px-2 py-1.5 hover:opacity-90 ${styles.wrapper}`}
                          >
                            <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${styles.label}`} />
                            <div className="min-w-0 flex-1">
                              <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.label}`}>
                                {time} · {styles.kindLabel}
                              </p>
                              <p className={`text-xs truncate ${styles.meta}`}>
                                {ev.title}
                                {caption && (
                                  <span className="text-gray-400"> · {caption}</span>
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                      {dayMilestones.map((ms, i) => {
                        const styles = milestoneClassNames(ms.kind);
                        const candidate = milestoneCandidateName(ms);
                        const client = milestoneClient(ms);
                        const kindLabel = milestoneKindLabel(ms.kind);
                        return (
                          <button
                            key={`${ms.placement.id}-${ms.kind}-${i}`}
                            type="button"
                            onClick={() => {
                              setSelectedDay(null);
                              setSelectedInterview(null);
                              setSelectedMilestone(ms);
                            }}
                            className={`flex w-full items-start gap-2 text-left rounded-r px-2 py-1.5 hover:opacity-90 ${styles.wrapper}`}
                          >
                            <CalendarIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${styles.label}`} />
                            <div className="min-w-0 flex-1">
                              <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.label}`}>
                                {kindLabel}
                              </p>
                              <p className={`text-xs truncate ${styles.meta}`}>
                                {candidate}
                                {client && (
                                  <span className="text-gray-400"> · {client}</span>
                                )}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          {selectedMilestone && (
            <MilestoneDetailCard
              milestone={selectedMilestone}
              onClose={() => setSelectedMilestone(null)}
            />
          )}
          {selectedEvent && (() => {
            const styles = eventClassNames(selectedEvent.kind);
            const Icon = styles.Icon;
            return (
              <Card className="border-indigo-200">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{selectedEvent.title}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingEvent(selectedEvent)}
                        className="text-gray-400 hover:text-indigo-600 p-0.5 rounded hover:bg-indigo-50"
                        title="Edit event"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setSelectedEvent(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={`${styles.wrapper.replace("hover:", "")} ${styles.label} border-0`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {styles.kindLabel}
                    </Badge>
                    {selectedEvent.allDay && (
                      <Badge variant="secondary" className="text-xs">All day</Badge>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {formatDateShort(selectedEvent.startTime)}
                        {selectedEvent.allDay
                          ? ""
                          : `, ${formatTime(selectedEvent.startTime, selectedEvent.timezone)} - ${formatTime(selectedEvent.endTime, selectedEvent.timezone)}`}
                      </span>
                    </div>

                    {selectedEvent.candidate && (
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        <Link
                          href={`/candidates/${selectedEvent.candidate.id}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {selectedEvent.candidate.firstName} {selectedEvent.candidate.lastName}
                        </Link>
                      </div>
                    )}
                    {selectedEvent.job && (
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                        <Link
                          href={`/jobs/${selectedEvent.job.id}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {selectedEvent.job.title}
                        </Link>
                        {selectedEvent.job.client?.name && (
                          <span className="text-gray-400 text-xs">
                            @ {selectedEvent.job.client.name}
                          </span>
                        )}
                      </div>
                    )}
                    {selectedEvent.client && !selectedEvent.job && (
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-gray-400" />
                        <Link
                          href={`/clients/${selectedEvent.client.id}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {selectedEvent.client.name}
                        </Link>
                      </div>
                    )}

                    {selectedEvent.meetingLink && (
                      <a
                        href={selectedEvent.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline bg-indigo-50 px-2.5 py-1.5 rounded-md"
                      >
                        <Video className="h-3.5 w-3.5" /> Open link
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}

                    {selectedEvent.location && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{selectedEvent.location}</span>
                      </div>
                    )}

                    {selectedEvent.description && (
                      <div>
                        <p className="text-xs text-gray-400 uppercase mb-1">Notes</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {selectedEvent.description}
                        </p>
                      </div>
                    )}

                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-1">Created by</p>
                      <p className="text-sm">{selectedEvent.creator.name}</p>
                    </div>
                  </div>

                  <div className="border-t pt-3 flex justify-end gap-2">
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-500"
                        onClick={() => setDeletingEvent({ id: selectedEvent.id, title: selectedEvent.title || "this event" })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
          {selectedInterview && (<>
            <Card className="border-indigo-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{selectedInterview.title}</h3>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingInterview(selectedInterview)} className="text-gray-400 hover:text-indigo-600 p-0.5 rounded hover:bg-indigo-50" title="Edit interview">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setSelectedInterview(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className={STATUS_COLORS[selectedInterview.status]}>
                    {STATUS_LABELS[selectedInterview.status]}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {TYPE_OPTIONS.find((t) => t.value === selectedInterview.type)?.label || selectedInterview.type}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="h-3.5 w-3.5" />
                    <div>
                      <span>{formatDateShort(selectedInterview.startTime)}, {formatTime(selectedInterview.startTime, selectedInterview.timezone)} - {formatTime(selectedInterview.endTime, selectedInterview.timezone)}</span>
                      {selectedInterview.timezone && (
                        <p className="text-[11px] text-gray-400 mt-0.5">{getTimezoneLabel(selectedInterview.timezone)}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <Link href={`/candidates/${selectedInterview.candidate.id}`} className="text-indigo-600 hover:underline">
                      {selectedInterview.candidate.firstName} {selectedInterview.candidate.lastName}
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                    <Link href={`/jobs/${selectedInterview.job.id}`} className="text-indigo-600 hover:underline">
                      {selectedInterview.job.title}
                    </Link>
                    <span className="text-gray-400 text-xs">@ {selectedInterview.job.client.name}</span>
                  </div>

                  {/* "Internal only" notice — the candidate wasn't
                      emailed at create time. Mirrors the amber banner
                      from the create dialog so the state is the same
                      shape across surfaces. */}
                  {(selectedInterview as any).inviteSent === false && (
                    <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                      <BellOff className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                      <div className="text-xs">
                        <p className="font-medium">Internal only — no invite was sent</p>
                        <p className="text-amber-700 mt-0.5">The candidate wasn&apos;t emailed about this meeting.</p>
                      </div>
                    </div>
                  )}

                  {selectedInterview.meetingLink && (
                    <div className="space-y-1.5">
                      <a href={selectedInterview.meetingLink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline bg-indigo-50 px-2.5 py-1.5 rounded-md">
                        <Video className="h-3.5 w-3.5" /> Join Meeting
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  {selectedInterview.location && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="h-3.5 w-3.5" /><span>{selectedInterview.location}</span>
                    </div>
                  )}

                  {selectedInterview.interviewers?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-1">Interviewers</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedInterview.interviewers.map((iv) => (
                          <Badge key={iv.user.id} variant="secondary" className="text-xs">{iv.user.name}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedInterview.clientContacts && selectedInterview.clientContacts.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-1">Client Contacts</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedInterview.clientContacts.map((cc) => (
                          <Badge key={cc.contact.id} variant="secondary" className="text-xs bg-amber-50 text-amber-700">
                            {cc.contact.firstName} {cc.contact.lastName}
                            {cc.contact.title && <span className="text-amber-500 ml-0.5">· {cc.contact.title}</span>}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-gray-400 uppercase mb-1">Scheduled by</p>
                    <p className="text-sm">{selectedInterview.creator.name}</p>
                  </div>

                  {selectedInterview.notes && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-1">Notes</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedInterview.notes}</p>
                    </div>
                  )}

                  {/* Attachments — same component the dialog and the
                      job/candidate detail pages use. Quick view +
                      management without opening the edit modal. */}
                  <InterviewAttachments interviewId={selectedInterview.id} />
                </div>

                {/* Actions */}
                <div className="border-t pt-3 space-y-2">
                  {selectedInterview.status === "SCHEDULED" && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 text-green-600" onClick={() => handleStatusChange(selectedInterview.id, "COMPLETED")}>
                        Mark Completed
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-yellow-600" onClick={() => handleStatusChange(selectedInterview.id, "NO_SHOW")}>
                        No Show
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {selectedInterview.status === "SCHEDULED" && (
                      <Button size="sm" variant="outline" className="flex-1 text-red-500" onClick={() => handleStatusChange(selectedInterview.id, "CANCELLED")}>
                        Cancel
                      </Button>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="outline" className="text-red-500" onClick={() => setShowDeleteInterview(true)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Feedback Section */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4 text-gray-400" />
                    Feedback
                    {feedbackList.length > 0 && (
                      <span className="text-xs text-gray-400">({feedbackList.length})</span>
                    )}
                  </h3>
                  {!showFeedbackForm && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setShowFeedbackForm(true)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  )}
                </div>

                {/* Add feedback form */}
                {showFeedbackForm && (
                  <div className="border rounded-lg p-3 space-y-3 bg-gray-50/50">
                    {/* Type toggle */}
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setFeedbackType("INTERNAL")}
                        className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                          feedbackType === "INTERNAL"
                            ? "bg-indigo-100 text-indigo-700"
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        Internal
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedbackType("CLIENT")}
                        className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                          feedbackType === "CLIENT"
                            ? "bg-amber-100 text-amber-700"
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        Client
                      </button>
                    </div>

                    {/* Client author name */}
                    {feedbackType === "CLIENT" && (
                      <Input
                        placeholder="Client contact name..."
                        value={feedbackAuthor}
                        onChange={(e) => setFeedbackAuthor(e.target.value)}
                        className="h-8 text-xs"
                      />
                    )}

                    {/* Comment */}
                    <Textarea
                      placeholder={
                        feedbackType === "INTERNAL"
                          ? "Internal notes on the interview..."
                          : "Client feedback on the candidate..."
                      }
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      rows={3}
                      className="text-xs resize-none"
                    />

                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          setShowFeedbackForm(false);
                          setFeedbackComment("");
                          setFeedbackRating(0);
                          setFeedbackAuthor("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={submitFeedback}
                        disabled={feedbackSubmitting || !feedbackComment.trim() || (feedbackType === "CLIENT" && !feedbackAuthor.trim())}
                      >
                        {feedbackSubmitting ? "Saving..." : (
                          <><Send className="h-3 w-3 mr-1" /> Submit</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Feedback list */}
                {feedbackLoading ? (
                  <div className="space-y-2">
                    <div className="h-16 bg-gray-100 rounded animate-pulse" />
                  </div>
                ) : feedbackList.length === 0 && !showFeedbackForm ? (
                  <p className="text-xs text-gray-400 text-center py-3">
                    No feedback yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {feedbackList.map((fb) => (
                      <div
                        key={fb.id}
                        className={`rounded-lg p-3 text-xs space-y-1.5 ${
                          fb.type === "CLIENT"
                            ? "bg-amber-50 border border-amber-100"
                            : "bg-gray-50 border border-gray-100"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              className={`text-[9px] px-1.5 py-0 ${
                                fb.type === "CLIENT"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-indigo-100 text-indigo-700"
                              }`}
                            >
                              {fb.type === "CLIENT" ? "Client" : "Internal"}
                            </Badge>
                            <span className="font-medium text-gray-700">
                              {fb.authorName}
                            </span>
                          </div>
                          <span className="text-gray-400 text-[10px]">
                            {new Date(fb.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {fb.rating && (
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`h-3 w-3 ${
                                  s <= fb.rating!
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                        <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                          {fb.comment}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>)}

          {/* Upcoming events (7 days) — unified feed: interviews and
              placement milestones (first day, payment due, guarantee
              expiry) interleaved by date. The recruiter wants ONE
              "what's coming up next" surface, not two separate cards
              they have to mentally merge. Each row carries its own
              type/color/icon so the kind is unambiguous. */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Upcoming (7 days)</h3>
              {loading ? (
                <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
              ) : (() => {
                // Merge into one chronologically-sorted list.
                type FeedItem =
                  | { kind: "interview"; date: Date; iv: Interview }
                  | { kind: "milestone"; date: Date; ms: Milestone }
                  | { kind: "event"; date: Date; ev: CalendarEvent };
                const items: FeedItem[] = [
                  ...upcoming.map<FeedItem>((iv) => ({ kind: "interview", date: new Date(iv.startTime), iv })),
                  ...upcomingMilestones.map<FeedItem>((ms) => ({ kind: "milestone", date: ms.date, ms })),
                  ...upcomingEvents.map<FeedItem>((occ) => ({ kind: "event", date: occ.date, ev: occ.event })),
                ].sort((a, b) => a.date.getTime() - b.date.getTime());

                if (items.length === 0) {
                  return (
                    <p className="text-sm text-gray-400 py-4 text-center">
                      Nothing on the schedule for the next 7 days
                    </p>
                  );
                }

                return (
                  <div className="space-y-2">
                    {items.map((item, i) => {
                      if (item.kind === "interview") {
                        const iv = item.iv;
                        const isSelected = selectedInterview?.id === iv.id;
                        const Icon = interviewTypeIcon(iv.type);
                        return (
                          <button
                            key={`iv-${iv.id}`}
                            type="button"
                            onClick={() => { setSelectedMilestone(null); setSelectedDay(null); setSelectedInterview(iv); }}
                            className={`w-full text-left p-2.5 rounded-lg border-l-2 transition-colors ${
                              isSelected
                                ? "border-l-indigo-500 bg-indigo-50"
                                : "border-l-indigo-400 border border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className="h-3 w-3 text-indigo-500" />
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                                Interview
                              </span>
                              {(iv._count?.documents || 0) > 0 && (
                                <Paperclip className="h-3 w-3 text-gray-400" />
                              )}
                              <span className="ml-auto text-[10px] text-gray-400">
                                {formatDateShort(iv.startTime)} · {formatTime(iv.startTime, iv.timezone)}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-gray-900 truncate">
                              {iv.candidate.firstName} {iv.candidate.lastName}
                            </p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {iv.job.title} @ {iv.job.client.name}
                            </p>
                          </button>
                        );
                      }
                      if (item.kind === "event") {
                        const ev = item.ev;
                        const styles = eventClassNames(ev.kind);
                        const Icon = styles.Icon;
                        const caption = eventCaption(ev);
                        const isSelected = selectedEvent?.id === ev.id;
                        return (
                          <button
                            key={`ev-${ev.id}`}
                            type="button"
                            onClick={() => {
                              setSelectedInterview(null);
                              setSelectedMilestone(null);
                              setSelectedDay(null);
                              setSelectedEvent(ev);
                            }}
                            className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                              isSelected
                                ? "border-indigo-300 bg-indigo-50"
                                : `${styles.wrapper.replace("hover:", "")} border border-gray-100`
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className={`h-3 w-3 ${styles.label}`} />
                              <span className={`text-[10px] font-semibold uppercase tracking-wide ${styles.label}`}>
                                {styles.kindLabel}
                              </span>
                              <span className="ml-auto text-[10px] text-gray-400">
                                {formatDateShort(ev.startTime)}
                                {!ev.allDay && ` · ${formatTime(ev.startTime, ev.timezone)}`}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-gray-900 truncate">
                              {ev.title}
                            </p>
                            {caption && (
                              <p className="text-[11px] text-gray-500 truncate">{caption}</p>
                            )}
                          </button>
                        );
                      }
                      const ms = item.ms;
                      const styles = milestoneClassNames(ms.kind);
                      const kindLabel = milestoneKindLabel(ms.kind);
                      const candidateName = milestoneCandidateName(ms);
                      const clientName = milestoneClient(ms);
                      const meta = clientName ? `${candidateName} · ${clientName}` : candidateName;
                      const isSelected =
                        selectedMilestone?.placement.id === ms.placement.id &&
                        selectedMilestone?.kind === ms.kind;
                      return (
                        <button
                          key={`ms-${ms.placement.id}-${ms.kind}-${i}`}
                          type="button"
                          onClick={() => { setSelectedInterview(null); setSelectedDay(null); setSelectedMilestone(ms); }}
                          className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                            isSelected
                              ? "border-indigo-300 bg-indigo-50"
                              : `${styles.wrapper.replace("hover:", "")} border border-gray-100`
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-semibold uppercase tracking-wide ${styles.label}`}>
                              {kindLabel}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {ms.date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 truncate">{meta}</p>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* "What do you want to create?" chooser. Surfaces when the
          recruiter double-clicks a day or hits the inline Plus on a
          day cell / sidebar. Two big buttons so the choice is
          obvious; clicking either one routes into the matching
          modal. The header buttons skip this step — they're already
          pre-disambiguated by which button got clicked. */}
      {showCreateChooser && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                What do you want to create?
              </h2>
              <button
                onClick={() => setShowCreateChooser(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {createDate && (
              <p className="text-xs text-gray-500 -mt-2">
                {createDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={chooseEvent}
                className="rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 px-4 py-5 flex flex-col items-center gap-2 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-indigo-100 flex items-center justify-center">
                  <CalendarIcon className="h-5 w-5 text-slate-600 group-hover:text-indigo-700" />
                </div>
                <p className="text-sm font-semibold text-gray-900">Event</p>
                <p className="text-[11px] text-gray-500 text-center">
                  Follow-up, reminder, personal block
                </p>
              </button>
              <button
                type="button"
                onClick={chooseInterview}
                className="rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 px-4 py-5 flex flex-col items-center gap-2 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Video className="h-5 w-5 text-indigo-700" />
                </div>
                <p className="text-sm font-semibold text-gray-900">Interview</p>
                <p className="text-[11px] text-gray-500 text-center">
                  Candidate / client meeting with optional invite
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Interview Modal */}
      {showCreateModal && (
        <CreateInterviewModal
          defaultDate={createDate}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchInterviews(); }}
        />
      )}

      {/* Edit Interview Modal */}
      {editingInterview && (
        <EditInterviewModal
          interview={editingInterview}
          onClose={() => setEditingInterview(null)}
          onUpdated={(updated) => {
            setEditingInterview(null);
            setSelectedInterview(updated);
            fetchInterviews();
          }}
        />
      )}

      {/* Create / Edit Event Modal — Outlook-style personal block.
          Never emails the candidate; just lives on the recruiter's
          /calendar grid alongside Interviews. */}
      {showCreateEventModal && (
        <CreateEventModal
          defaultDate={createDate}
          editing={null}
          onClose={() => setShowCreateEventModal(false)}
          onSaved={() => {
            setShowCreateEventModal(false);
            fetchEvents();
          }}
        />
      )}
      {editingEvent && (
        <CreateEventModal
          defaultDate={null}
          editing={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={async () => {
            const id = editingEvent.id;
            setEditingEvent(null);
            await fetchEvents();
            // Pull the updated row back into the detail panel so the
            // change reflects immediately without a manual click.
            try {
              const res = await fetch(`/api/events/${id}`);
              if (res.ok) setSelectedEvent(await res.json());
            } catch {}
          }}
        />
      )}

      <DeleteConfirmDialog
        open={showDeleteInterview}
        onOpenChange={setShowDeleteInterview}
        itemLabel={selectedInterview?.title || "this interview"}
        itemKind="interview"
        consequences={[
          "Linked feedback and notes",
          "Any linked calendar events",
        ]}
        onConfirm={async () => {
          if (selectedInterview) await handleDelete(selectedInterview.id);
        }}
        confirmLabel="Yes, delete"
      />

      <DeleteConfirmDialog
        open={!!deletingEvent}
        onOpenChange={(open) => { if (!open) setDeletingEvent(null); }}
        itemLabel={deletingEvent?.title || ""}
        itemKind="event"
        onConfirm={async () => {
          if (deletingEvent) {
            await fetch(`/api/events/${deletingEvent.id}`, { method: "DELETE" });
            setSelectedEvent(null);
            fetchEvents();
          }
          setDeletingEvent(null);
        }}
        confirmLabel="Yes, delete"
      />
    </div>
  );
}


// ─── Edit Interview Modal ───

function EditInterviewModal({
  interview,
  onClose,
  onUpdated,
}: {
  interview: Interview;
  onClose: () => void;
  onUpdated: (updated: Interview) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Parse existing values
  const startDt = new Date(interview.startTime);
  const endDt = new Date(interview.endTime);

  const [title, setTitle] = useState(interview.title);
  const [date, setDate] = useState(startDt.toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState(
    startDt.toTimeString().slice(0, 5)
  );
  const [endTime, setEndTime] = useState(endDt.toTimeString().slice(0, 5));
  const [duration, setDuration] = useState(Math.round((endDt.getTime() - startDt.getTime()) / 60000));
  const [type, setType] = useState(interview.type);
  const [status, setStatus] = useState(interview.status);
  const [meetingLink, setMeetingLink] = useState(interview.meetingLink || "");
  const [location, setLocation] = useState(interview.location || "");
  const [timezone, setTimezone] = useState(
    interview.timezone || "America/Argentina/Buenos_Aires"
  );
  const [notes, setNotes] = useState(interview.notes || "");

  // Team members
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedInterviewers, setSelectedInterviewers] = useState<string[]>(
    interview.interviewers?.map((iv) => iv.user.id) || []
  );

  // Client contacts
  const [clientContacts, setClientContacts] = useState<ClientContactOption[]>([]);
  const [selectedClientContacts, setSelectedClientContacts] = useState<string[]>(
    interview.clientContacts?.map((cc) => cc.contact.id) || []
  );

  useEffect(() => {
    fetch("/api/users/search?q=")
      .then((r) => r.json())
      .then((data) => setTeamMembers(data.users || []))
      .catch(() => {});
    // Fetch client contacts for this job's client
    fetch(`/api/jobs/${interview.job.id}`)
      .then((r) => r.json())
      .then((job) => {
        if (job.clientId) {
          fetch(`/api/contacts?clientId=${job.clientId}`)
            .then((r) => r.json())
            .then((contacts) => {
              setClientContacts(
                (contacts || []).map((c: any) => ({
                  id: c.id,
                  firstName: c.firstName,
                  lastName: c.lastName,
                  email: c.email,
                  title: c.title,
                }))
              );
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(`${date}T${endTime}:00`);

    if (endDateTime <= startDateTime) {
      setError("End time must be after start time");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/interviews/${interview.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          type,
          status,
          meetingLink: meetingLink || null,
          location: type === "IN_PERSON" ? location : null,
          timezone,
          notes: notes || null,
          interviewerIds: selectedInterviewers,
          clientContactIds: selectedClientContacts,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Failed to update interview");
        setSaving(false);
        return;
      }

      const updated = await res.json();
      onUpdated(updated);
    } catch {
      setError("Failed to update interview");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold">Edit Interview</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {interview.candidate.firstName} {interview.candidate.lastName} — {interview.job.title} @ {interview.job.client.name}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Candidate (read-only) */}
          <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-500" />
              <span className="text-sm font-medium">
                {interview.candidate.firstName} {interview.candidate.lastName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Briefcase className="h-3 w-3" />
              {interview.job.title}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Interview title"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {(["SCHEDULED", "COMPLETED", "NO_SHOW", "CANCELLED"] as const).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      status === s
                        ? STATUS_COLORS[s]
                        : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                    }`}
                    onClick={() => setStatus(s)}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Date & Time — Calendly-style */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex gap-1">
                {[15, 30, 45, 60, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDuration(d);
                      if (startTime) {
                        const [h, m] = startTime.split(":").map(Number);
                        const totalMin = h * 60 + m + d;
                        const endH = Math.floor(totalMin / 60) % 24;
                        const endM = totalMin % 60;
                        setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
                      }
                    }}
                    className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      duration === d
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {d < 60 ? `${d}m` : d === 60 ? "1h" : "1.5h"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={startTime}
                onChange={(e) => {
                  const newStart = e.target.value;
                  setStartTime(newStart);
                  const [h, m] = newStart.split(":").map(Number);
                  const totalMin = h * 60 + m + duration;
                  const endH = Math.floor(totalMin / 60) % 24;
                  const endM = totalMin % 60;
                  setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
                }}
              >
                {Array.from({ length: 40 }, (_, i) => {
                  const h = Math.floor((i * 30 + 7 * 60) / 60);
                  const m = (i * 30 + 7 * 60) % 60;
                  if (h >= 24) return null;
                  const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                  const label = new Date(`2000-01-01T${val}`).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  return <option key={val} value={val}>{label}</option>;
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <div className="flex h-10 w-full rounded-md border border-input bg-gray-50 px-3 py-2 text-sm items-center text-gray-600">
                {endTime && new Date(`2000-01-01T${endTime}`).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
                <span className="ml-auto text-xs text-gray-400">{duration} min</span>
              </div>
            </div>
          </div>

          {/* Timezone */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" /> Timezone
            </Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <optgroup label="Americas">
                {TIMEZONE_OPTIONS.filter((t) => t.region === "Americas").map(
                  (t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.offset})
                    </option>
                  )
                )}
              </optgroup>
              <optgroup label="Europe">
                {TIMEZONE_OPTIONS.filter((t) => t.region === "Europe").map(
                  (t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.offset})
                    </option>
                  )
                )}
              </optgroup>
              <optgroup label="Asia & Middle East">
                {TIMEZONE_OPTIONS.filter((t) => t.region === "Asia").map(
                  (t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.offset})
                    </option>
                  )
                )}
              </optgroup>
              <optgroup label="Oceania">
                {TIMEZONE_OPTIONS.filter((t) => t.region === "Oceania").map(
                  (t) => (
                    <option key={t.value} value={t.value}>
                      {t.label} ({t.offset})
                    </option>
                  )
                )}
              </optgroup>
            </select>
          </div>

          {/* Interview Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const Icon = interviewTypeIcon(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                      type === opt.value
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                    onClick={() => setType(opt.value)}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Meeting Link */}
          <div className="space-y-2">
            <Label>Meeting Link</Label>
            <Input
              placeholder="https://meet.google.com/... or https://teams.microsoft.com/..."
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
            />
          </div>

          {/* Location (for IN_PERSON) */}
          {type === "IN_PERSON" && (
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                placeholder="Office address or room"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          )}

          {/* Interviewers */}
          <div className="space-y-2">
            <Label>Interviewers</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedInterviewers.map((uid) => {
                const u = teamMembers.find((m) => m.id === uid);
                return u ? (
                  <Badge key={uid} variant="secondary" className="gap-1">
                    {u.name}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedInterviewers(
                          selectedInterviewers.filter((id) => id !== uid)
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : (
                  <Badge key={uid} variant="secondary" className="gap-1">
                    {uid.slice(0, 8)}...
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedInterviewers(
                          selectedInterviewers.filter((id) => id !== uid)
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value=""
              onChange={(e) => {
                if (
                  e.target.value &&
                  !selectedInterviewers.includes(e.target.value)
                ) {
                  setSelectedInterviewers([
                    ...selectedInterviewers,
                    e.target.value,
                  ]);
                }
                e.target.value = "";
              }}
            >
              <option value="">Add interviewer...</option>
              {teamMembers
                .filter((u) => !selectedInterviewers.includes(u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Client Contacts (Hiring Company) */}
          {clientContacts.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-gray-400" /> Client Contacts
                <span className="text-xs text-gray-400 font-normal ml-1">(hiring company)</span>
              </Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedClientContacts.map((cid) => {
                  const c = clientContacts.find((cc) => cc.id === cid);
                  return c ? (
                    <Badge key={cid} variant="secondary" className="gap-1 bg-amber-50 text-amber-700">
                      {c.firstName} {c.lastName}
                      {c.title && <span className="text-amber-500">· {c.title}</span>}
                      <button type="button" onClick={() => setSelectedClientContacts(selectedClientContacts.filter((id) => id !== cid))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value=""
                onChange={(e) => {
                  if (e.target.value && !selectedClientContacts.includes(e.target.value)) {
                    setSelectedClientContacts([...selectedClientContacts, e.target.value]);
                  }
                  e.target.value = "";
                }}
              >
                <option value="">Add client contact...</option>
                {clientContacts.filter((c) => !selectedClientContacts.includes(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}{c.title ? ` (${c.title})` : ""}{c.email ? ` — ${c.email}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              placeholder="Interview agenda, preparation notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Attachments — same component the job- and candidate-side
              InterviewDialog uses, so attachment management is
              identical no matter where the recruiter opens the
              interview from. */}
          <InterviewAttachments interviewId={interview.id} />

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Placement Milestone detail (sidebar) ───

function MilestoneDetailCard({
  milestone,
  onClose,
}: {
  milestone: {
    kind: "first_day" | "payment_due" | "guarantee_expiry";
    date: Date;
    placement: any;
  };
  onClose: () => void;
}) {
  const { kind, date, placement } = milestone;
  const candidate = placement.submission?.candidate;
  const candidateName = candidate
    ? `${candidate.firstName} ${candidate.lastName}`
    : "Candidate";
  const jobTitle = placement.job?.title || "Job";
  const clientName = placement.client?.name || "Client";
  const currency = placement.currency || placement.job?.currency || "USD";
  // Mirror the calmed-down chip palette: neutral slate panel with a
  // single colored accent (emerald / indigo / amber) so the detail
  // sidebar doesn't suddenly switch to a louder color scheme than
  // the grid chip the user just clicked.
  const accent =
    kind === "first_day"
      ? { border: "border-emerald-200", text: "text-emerald-700", bg: "bg-slate-50" }
      : kind === "payment_due"
        ? { border: "border-indigo-200", text: "text-indigo-700", bg: "bg-slate-50" }
        : { border: "border-amber-200", text: "text-amber-700", bg: "bg-slate-50" };
  const headline =
    kind === "first_day"
      ? "First day"
      : kind === "payment_due"
        ? "Payment due"
        : "Guarantee expires";

  return (
    <Card className={accent.border}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${accent.text}`}>
              {headline}
            </p>
            <h3 className="font-semibold text-sm text-gray-900">{candidateName}</h3>
            <p className="text-xs text-gray-500">{jobTitle} · {clientName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-0.5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`rounded-md ${accent.bg} px-3 py-2 text-xs ${accent.text} font-medium`}>
          {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}
        </div>

        <div className="space-y-1 text-xs text-gray-600">
          {placement.salary != null && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Agreed salary</span>
              <span className="font-medium text-gray-900">
                {formatCurrencyValueLocal(Number(placement.salary), currency)}
                {placement.salaryPeriod === "MONTHLY" && (
                  <span className="text-gray-400"> /mo</span>
                )}
              </span>
            </div>
          )}
          {placement.feeAmount != null && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Fee</span>
              <span className="font-medium text-gray-900">
                {formatCurrencyValueLocal(Number(placement.feeAmount), currency)}
                {placement.feePercentage != null && (
                  <span className="text-gray-400"> ({Number(placement.feePercentage)}%)</span>
                )}
              </span>
            </div>
          )}
          {placement.startDate && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Starting date</span>
              <span className="font-medium text-gray-900">
                {formatDateOnly(placement.startDate)}
              </span>
            </div>
          )}
          {placement.paymentDueDate && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Payment due</span>
              <span className="font-medium text-gray-900">
                {formatDateOnly(placement.paymentDueDate)}
              </span>
            </div>
          )}
          {placement.guaranteeExpiry && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Guarantee expiry</span>
              <span className="font-medium text-gray-900">
                {formatDateOnly(placement.guaranteeExpiry)}
              </span>
            </div>
          )}
          {placement.invoiceStatus && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Invoice</span>
              <Badge variant="secondary" className="text-[10px]">
                {placement.invoiceStatus}
              </Badge>
            </div>
          )}
        </div>

        <Link
          href="/placements"
          className="block w-full text-center text-xs font-medium px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Open in placements
        </Link>
      </CardContent>
    </Card>
  );
}

// Light-weight currency formatter for the milestone card — same shape
// as the placements page so the visual hierarchy carries over.
function formatCurrencyValueLocal(value: number, code: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}
