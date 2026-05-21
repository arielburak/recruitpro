"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  MessageSquare,
  Star,
  Send,
  Calendar as CalendarIcon,
} from "lucide-react";
import Link from "next/link";
import { FEATURES } from "@/lib/feature-flags";

// ─── Constants ───

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const TYPE_OPTIONS = [
  { value: "VIDEO", label: "Video Call", icon: Video },
  { value: "PHONE", label: "Phone", icon: Phone },
  { value: "IN_PERSON", label: "In Person", icon: MapPin },
];

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-yellow-100 text-yellow-700",
};

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

const ALL_PLATFORM_OPTIONS = [
  { value: "google_meet", label: "Google Meet", color: "text-green-600", requiresIntegration: true, provider: "google" as const },
  { value: "microsoft_teams", label: "Microsoft Teams", color: "text-blue-600", requiresIntegration: true, provider: "microsoft" as const },
  { value: "zoom", label: "Zoom", color: "text-blue-500", requiresIntegration: false },
  { value: "custom", label: "Custom Link", color: "text-gray-600", requiresIntegration: false },
  { value: "none", label: "No Video", color: "text-gray-400", requiresIntegration: false },
];

// The Microsoft option is gated on FEATURES.microsoftIntegration so we
// don't show "Microsoft Teams" until the Azure tenant is configured.
const PLATFORM_OPTIONS = ALL_PLATFORM_OPTIONS.filter(
  (p) => !(("provider" in p) && p.provider === "microsoft" && !FEATURES.microsoftIntegration)
);

const TIMEZONE_OPTIONS = [
  // Americas
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", offset: "UTC-3", region: "Americas" },
  { value: "America/Sao_Paulo", label: "São Paulo", offset: "UTC-3", region: "Americas" },
  { value: "America/Santiago", label: "Santiago", offset: "UTC-3", region: "Americas" },
  { value: "America/Bogota", label: "Bogotá", offset: "UTC-5", region: "Americas" },
  { value: "America/Lima", label: "Lima", offset: "UTC-5", region: "Americas" },
  { value: "America/Mexico_City", label: "Mexico City", offset: "UTC-6", region: "Americas" },
  { value: "America/New_York", label: "New York (ET)", offset: "UTC-5/4", region: "Americas" },
  { value: "America/Chicago", label: "Chicago (CT)", offset: "UTC-6/5", region: "Americas" },
  { value: "America/Denver", label: "Denver (MT)", offset: "UTC-7/6", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)", offset: "UTC-8/7", region: "Americas" },
  { value: "America/Toronto", label: "Toronto", offset: "UTC-5/4", region: "Americas" },
  { value: "America/Vancouver", label: "Vancouver", offset: "UTC-8/7", region: "Americas" },
  // Europe
  { value: "Europe/London", label: "London (GMT/BST)", offset: "UTC+0/1", region: "Europe" },
  { value: "Europe/Paris", label: "Paris (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Berlin", label: "Berlin (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Madrid", label: "Madrid (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Rome", label: "Rome (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Amsterdam", label: "Amsterdam (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Moscow", label: "Moscow (MSK)", offset: "UTC+3", region: "Europe" },
  // Asia & Middle East
  { value: "Asia/Dubai", label: "Dubai (GST)", offset: "UTC+4", region: "Asia" },
  { value: "Asia/Kolkata", label: "Mumbai (IST)", offset: "UTC+5:30", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", offset: "UTC+8", region: "Asia" },
  { value: "Asia/Shanghai", label: "Shanghai (CST)", offset: "UTC+8", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", offset: "UTC+9", region: "Asia" },
  { value: "Asia/Seoul", label: "Seoul (KST)", offset: "UTC+9", region: "Asia" },
  // Oceania
  { value: "Australia/Sydney", label: "Sydney (AEST)", offset: "UTC+10/11", region: "Oceania" },
  { value: "Pacific/Auckland", label: "Auckland (NZST)", offset: "UTC+12/13", region: "Oceania" },
];

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
  candidate: { id: string; firstName: string; lastName: string };
  job: { id: string; title: string; client: { name: string } };
  creator: { name: string };
  interviewers: { user: { id: string; name: string } }[];
  clientContacts?: { contact: { id: string; firstName: string; lastName: string; email?: string; title?: string } }[];
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

// ─── Component ───

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [interviews, setInterviews] = useState<Interview[]>([]);
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

  // Placement milestones derived from the loaded placements. Three
  // kinds per placement, each only emitted when the underlying date
  // exists — so a placement with no actual startDate yet won't put a
  // "first day" pill on the wrong square.
  type MilestoneKind = "first_day" | "payment_due" | "guarantee_expiry";
  type Milestone = { kind: MilestoneKind; date: Date; placement: any };

  const milestones: Milestone[] = (() => {
    const out: Milestone[] = [];
    for (const p of placements) {
      if (p.startDate) out.push({ kind: "first_day", date: new Date(p.startDate), placement: p });
      if (p.paymentDueDate) out.push({ kind: "payment_due", date: new Date(p.paymentDueDate), placement: p });
      if (p.guaranteeExpiry) out.push({ kind: "guarantee_expiry", date: new Date(p.guaranteeExpiry), placement: p });
    }
    return out;
  })();

  function getMilestonesForDay(day: number, m: number, y: number) {
    return milestones.filter((ms) => {
      const d = ms.date;
      return d.getDate() === day && d.getMonth() === m && d.getFullYear() === y;
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
  // below in the same color but lighter weight. Subtle background +
  // matching left border accent reads more like a typical pro
  // calendar event than a flat colored pill.
  function milestoneClassNames(kind: MilestoneKind): { wrapper: string; label: string; meta: string } {
    if (kind === "first_day") {
      return {
        wrapper: "bg-emerald-50 hover:bg-emerald-100 border-l-2 border-emerald-500",
        label: "text-emerald-800",
        meta: "text-emerald-700",
      };
    }
    if (kind === "payment_due") {
      return {
        wrapper: "bg-amber-50 hover:bg-amber-100 border-l-2 border-amber-500",
        label: "text-amber-800",
        meta: "text-amber-700",
      };
    }
    return {
      wrapper: "bg-rose-50 hover:bg-rose-100 border-l-2 border-rose-500",
      label: "text-rose-800",
      meta: "text-rose-700",
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

  function openCreate(day: number, m: number, y: number) {
    setCreateDate(new Date(y, m, day, 9, 0));
    setShowCreateModal(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this interview?")) return;
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
          <p className="text-sm text-gray-500">Interview schedule</p>
        </div>
        <Button onClick={() => { setCreateDate(new Date()); setShowCreateModal(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Schedule Interview
        </Button>
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
                  const todayHighlight = isToday(cd.day, cd.month, cd.year);
                  // Interviews + milestones share the same 3-row cap so
                  // the calendar grid doesn't grow unevenly. Interviews
                  // win the top slot — they're the time-sensitive
                  // "show up at 3pm" event; milestones are date-only
                  // reminders.
                  const totalEvents = dayInterviews.length + dayMilestones.length;
                  // Show up to 6 chips per day before collapsing the rest
                  // behind "+N more". Cells are sized to fit that many
                  // comfortably; if it's still not enough, the day-detail
                  // sidebar covers the full list.
                  const CELL_CAP = 6;
                  const interviewsToShow = dayInterviews.slice(0, CELL_CAP);
                  const milestonesToShow = dayMilestones.slice(
                    0,
                    Math.max(0, CELL_CAP - interviewsToShow.length),
                  );
                  const overflow = totalEvents - interviewsToShow.length - milestonesToShow.length;

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
                          return (
                            <button
                              key={iv.id}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedMilestone(null); setSelectedDay(null); setSelectedInterview(iv); }}
                              className={`block w-full text-left rounded-r px-1.5 py-1 leading-tight ${styles.wrapper}`}
                              title={`${purpose === "CLIENT" ? "Client interview" : "Candidate call"} · ${time} · ${typeLabel} · ${meta}`}
                            >
                              <p className={`text-[9px] font-semibold uppercase tracking-wide ${styles.label}`}>
                                {time} · {typeLabel}
                              </p>
                              <p className={`text-[10px] truncate ${styles.meta} ${iv.status === "CANCELLED" ? "line-through" : ""}`}>
                                {meta}
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
            const total = dayInterviews.length + dayMilestones.length;
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
                        onClick={() =>
                          openCreate(
                            selectedDay.day,
                            selectedDay.month,
                            selectedDay.year,
                          )
                        }
                        className="text-gray-400 hover:text-indigo-600 p-0.5 rounded hover:bg-indigo-50"
                        title="Schedule on this day"
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
                      Click + to schedule an interview on this day.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {dayInterviews.map((iv) => {
                        const purpose = interviewPurpose(iv);
                        const styles = interviewClassNames(iv.status, purpose);
                        const Icon =
                          TYPE_OPTIONS.find((t) => t.value === iv.type)?.icon ||
                          Video;
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
                              <p className={`text-[10px] font-semibold uppercase tracking-wide ${styles.label}`}>
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
                    <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleDelete(selectedInterview.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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

                    {/* Star rating */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 mr-1">Rating:</span>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setFeedbackRating(feedbackRating === s ? 0 : s)}
                          className="p-0.5"
                        >
                          <Star
                            className={`h-4 w-4 transition-colors ${
                              s <= feedbackRating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-300 hover:text-yellow-300"
                            }`}
                          />
                        </button>
                      ))}
                      {feedbackRating > 0 && (
                        <span className="text-xs text-gray-400 ml-1">{feedbackRating}/5</span>
                      )}
                    </div>

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

          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Upcoming (7 days)</h3>
              {loading ? (
                <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}</div>
              ) : upcoming.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No upcoming interviews</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((iv) => (
                    <button key={iv.id} type="button" onClick={() => { setSelectedMilestone(null); setSelectedInterview(iv); }}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                        selectedInterview?.id === iv.id ? "border-indigo-300 bg-indigo-50" : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        {(() => { const Icon = TYPE_OPTIONS.find((t) => t.value === iv.type)?.icon || Video; return <Icon className="h-3 w-3 text-gray-400" />; })()}
                        <span className="text-xs font-medium truncate">{iv.candidate.firstName} {iv.candidate.lastName}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">{iv.job.title} @ {iv.job.client.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {formatDateShort(iv.startTime)} · {formatTime(iv.startTime, iv.timezone)}
                        {iv.timezone && <span className="ml-1 text-gray-300">({getTimezoneLabel(iv.timezone)})</span>}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Placement milestones feed — first days, payment dues,
              and guarantee expirations falling inside the same
              7-day window. Same on-click behavior as a grid chip:
              opens the milestone detail sidebar. Hidden entirely
              when there's nothing upcoming so it doesn't add empty
              chrome. */}
          {!loading && upcomingMilestones.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3">Placements (7 days)</h3>
                <div className="space-y-2">
                  {upcomingMilestones.map((ms, i) => {
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
                        key={`${ms.placement.id}-${ms.kind}-${i}`}
                        type="button"
                        onClick={() => {
                          setSelectedInterview(null);
                          setSelectedDay(null);
                          setSelectedMilestone(ms);
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                          isSelected
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${styles.label}`}>
                            {kindLabel}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {ms.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 truncate">{meta}</p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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
    </div>
  );
}

// ─── Create Interview Modal ───

function CreateInterviewModal({
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

  // Interview purpose
  const [purpose, setPurpose] = useState<"CANDIDATE" | "CLIENT" | null>(null);

  // Notify mode: false = ATS-only record (no emails fire), true = full
  // invite path (candidate + client contacts get the calendar invite).
  // Default off — recruiters mostly use this view as a tracking ledger
  // for interviews that are already scheduled elsewhere. They opt in
  // when they actually need to invite people.
  const [notifyAttendees, setNotifyAttendees] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate ? defaultDate.toISOString().split("T")[0] : "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [duration, setDuration] = useState(30);
  const [type, setType] = useState("VIDEO");
  const [platform, setPlatform] = useState("google_meet");
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const [notes, setNotes] = useState("");

  // Google Calendar integration status
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  // Microsoft Teams integration status
  const [msConnected, setMsConnected] = useState(false);
  const [msEmail, setMsEmail] = useState<string | null>(null);

  // Candidate search
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState<CandidateOption[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateOption | null>(null);
  const [candidateDropdownOpen, setCandidateDropdownOpen] = useState(false);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const candidateRef = useRef<HTMLDivElement>(null);

  // Submission (job) selection
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");

  // Team members for interviewers
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedInterviewers, setSelectedInterviewers] = useState<string[]>([]);
  const [recruiterOwnerId, setRecruiterOwnerId] = useState("");

  // Client contacts
  const [clientContacts, setClientContacts] = useState<ClientContactOption[]>([]);
  const [selectedClientContacts, setSelectedClientContacts] = useState<string[]>([]);

  // Fetch team members + google status
  useEffect(() => {
    fetch("/api/users/search?q=")
      .then((r) => r.json())
      .then((data) => setTeamMembers(data.users || []))
      .catch(() => {});
    fetch("/api/integrations/google/status")
      .then((r) => r.json())
      .then((data) => {
        setGoogleConnected(data.connected || false);
        setGoogleEmail(data.email || null);
      })
      .catch(() => {});
    fetch("/api/integrations/microsoft/status")
      .then((r) => r.json())
      .then((data) => {
        setMsConnected(data.connected || false);
        setMsEmail(data.email || null);
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (candidateRef.current && !candidateRef.current.contains(e.target as Node)) {
        setCandidateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search candidates with debounce
  useEffect(() => {
    if (candidateSearch.length < 2) { setCandidateResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearchingCandidates(true);
      try {
        const res = await fetch(`/api/candidates?search=${encodeURIComponent(candidateSearch)}&limit=10&mine=false`);
        if (res.ok) {
          const data = await res.json();
          // We need submissions, fetch each candidate's detail
          const candidates = data.candidates || [];
          // For now just show candidates - we'll fetch submissions when selected
          setCandidateResults(candidates.map((c: any) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            submissions: [],
          })));
          setCandidateDropdownOpen(true);
        }
      } catch { /* silent */ }
      setSearchingCandidates(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [candidateSearch]);

  // Fetch client contacts when submission changes
  useEffect(() => {
    if (!selectedSubmissionId || !selectedCandidate) return;
    const sub = selectedCandidate.submissions.find((s) => s.id === selectedSubmissionId);
    if (!sub) return;
    // We need the clientId — fetch it from the job
    fetch(`/api/jobs/${sub.job.id}`)
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
  }, [selectedSubmissionId, selectedCandidate]);

  async function selectCandidate(candidate: CandidateOption) {
    // Fetch full candidate with submissions
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`);
      if (res.ok) {
        const full = await res.json();
        const withSubs: CandidateOption = {
          id: full.id,
          firstName: full.firstName,
          lastName: full.lastName,
          submissions: (full.submissions || []).map((s: any) => ({
            id: s.id,
            job: { id: s.job.id, title: s.job.title, client: { name: s.job.client?.name || "" } },
          })),
        };
        setSelectedCandidate(withSubs);
        setCandidateDropdownOpen(false);
        setCandidateSearch("");
        setTitle(`Interview - ${full.firstName} ${full.lastName}`);
        if (withSubs.submissions.length === 1) {
          setSelectedSubmissionId(withSubs.submissions[0].id);
        }
        if (full.ownerId) {
          setRecruiterOwnerId(full.ownerId);
        }
        // Reset client contacts when candidate changes
        setSelectedClientContacts([]);
        setClientContacts([]);
      }
    } catch { /* silent */ }
  }

  const selectedSubmission = selectedCandidate?.submissions.find((s) => s.id === selectedSubmissionId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCandidate || !selectedSubmissionId || !date || !startTime || !endTime) {
      setError("Please fill in all required fields");
      return;
    }

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
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || `Interview - ${selectedCandidate.firstName} ${selectedCandidate.lastName}`,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          type,
          candidateId: selectedCandidate.id,
          jobId: selectedSubmission!.job.id,
          submissionId: selectedSubmissionId,
          platform,
          meetingLink: meetingLink || undefined,
          location: type === "IN_PERSON" ? location : undefined,
          timezone,
          notes: notes || undefined,
          interviewerIds: selectedInterviewers.length > 0 ? selectedInterviewers : undefined,
          clientContactIds: selectedClientContacts.length > 0 ? selectedClientContacts : undefined,
          notifyAttendees,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold">Schedule Interview</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}

          {/* Purpose Selector */}
          {!purpose ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 font-medium">What type of interview is this?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPurpose("CANDIDATE")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-center group"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                    <User className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Candidate Call</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Screen or interview a candidate directly</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setPurpose("CLIENT"); setNotifyAttendees(false); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-center group"
                >
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                    <Building2 className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Client Interview</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Log an interview between the candidate and the client (no emails sent)</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
          <>

          {/* Purpose Badge */}
          <div className="flex items-center justify-between">
            <Badge className={`text-xs ${purpose === "CANDIDATE" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700"}`}>
              {purpose === "CANDIDATE" ? "Candidate Call" : "Client Interview"}
            </Badge>
            <button type="button" onClick={() => { setPurpose(null); setSelectedCandidate(null); setSelectedSubmissionId(""); setTitle(""); setSelectedClientContacts([]); }}
              className="text-xs text-gray-400 hover:text-gray-600">Change type</button>
          </div>

          {/* Candidate Search */}
          <div className="space-y-2">
            <Label>Candidate *</Label>
            {selectedCandidate ? (
              <div className="flex items-center justify-between p-2.5 bg-indigo-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-medium">{selectedCandidate.firstName} {selectedCandidate.lastName}</span>
                </div>
                <button type="button" onClick={() => { setSelectedCandidate(null); setSelectedSubmissionId(""); setTitle(""); }}
                  className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div ref={candidateRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Search candidates by name..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    onFocus={() => candidateResults.length > 0 && setCandidateDropdownOpen(true)}
                  />
                </div>
                {candidateDropdownOpen && candidateResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {candidateResults.map((c) => (
                      <button key={c.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors"
                        onClick={() => selectCandidate(c)}>
                        {c.firstName} {c.lastName}
                      </button>
                    ))}
                  </div>
                )}
                {searchingCandidates && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
              </div>
            )}
          </div>

          {/* Job / Submission Selection */}
          {selectedCandidate && (
            <div className="space-y-2">
              <Label>Job / Pipeline *</Label>
              {selectedCandidate.submissions.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                  This candidate has no active job submissions. Submit them to a job first.
                </p>
              ) : (
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedSubmissionId} onChange={(e) => setSelectedSubmissionId(e.target.value)} required>
                  <option value="">Select a job...</option>
                  {selectedCandidate.submissions.map((s) => (
                    <option key={s.id} value={s.id}>{s.job.title} @ {s.job.client.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Interview - Candidate Name" />
          </div>

          {/* Date & Time — Calendly-style */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date *</Label>
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
                      // Auto-update end time
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
              <Label>Start Time *</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={startTime}
                onChange={(e) => {
                  const newStart = e.target.value;
                  setStartTime(newStart);
                  // Auto-update end time based on duration
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
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <optgroup label="Americas">
                {TIMEZONE_OPTIONS.filter((t) => t.region === "Americas").map((t) => (
                  <option key={t.value} value={t.value}>{t.label} ({t.offset})</option>
                ))}
              </optgroup>
              <optgroup label="Europe">
                {TIMEZONE_OPTIONS.filter((t) => t.region === "Europe").map((t) => (
                  <option key={t.value} value={t.value}>{t.label} ({t.offset})</option>
                ))}
              </optgroup>
              <optgroup label="Asia & Middle East">
                {TIMEZONE_OPTIONS.filter((t) => t.region === "Asia").map((t) => (
                  <option key={t.value} value={t.value}>{t.label} ({t.offset})</option>
                ))}
              </optgroup>
              <optgroup label="Oceania">
                {TIMEZONE_OPTIONS.filter((t) => t.region === "Oceania").map((t) => (
                  <option key={t.value} value={t.value}>{t.label} ({t.offset})</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Interview Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button"
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                    type === opt.value ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => setType(opt.value)}>
                  <opt.icon className="h-4 w-4" />{opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meeting Platform (for VIDEO type) */}
          {type === "VIDEO" && (
            <div className="space-y-2">
              <Label>Meeting Platform</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {PLATFORM_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>

              {platform === "google_meet" && googleConnected && (
                <div className="flex items-start gap-2 bg-green-50 p-2.5 rounded-lg text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-green-800 font-medium text-xs">Google Meet link will be auto-generated</p>
                    <p className="text-green-600 text-xs">
                      Connected as <strong>{googleEmail}</strong>. A calendar event with Meet link will be created and sent to all participants.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Disconnect ${googleEmail} and connect a different Google account?`)) return;
                        try {
                          await fetch("/api/integrations/google/status", { method: "DELETE" });
                        } catch {}
                        window.location.href = "/api/integrations/google/connect";
                      }}
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mt-1 underline underline-offset-2"
                    >
                      Switch Google account
                    </button>
                  </div>
                </div>
              )}

              {platform === "google_meet" && !googleConnected && (
                <div className="bg-amber-50 p-2.5 rounded-lg text-sm space-y-1.5">
                  <p className="text-amber-700 text-xs">
                    Google Calendar not connected. <a href="/settings/integrations" className="text-indigo-600 hover:underline font-medium">Connect in Settings</a> to auto-generate Meet links, or paste a link manually below.
                  </p>
                  <Input placeholder="https://meet.google.com/xxx-xxxx-xxx" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
                </div>
              )}

              {platform === "microsoft_teams" && msConnected && (
                <div className="flex items-start gap-2 bg-green-50 p-2.5 rounded-lg text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-green-800 font-medium text-xs">Teams meeting link will be auto-generated</p>
                    <p className="text-green-600 text-xs">
                      Connected as <strong>{msEmail}</strong>. An Outlook calendar event with a Teams link will be created and sent to all participants.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Disconnect ${msEmail} and connect a different Microsoft account?`)) return;
                        try {
                          await fetch("/api/integrations/microsoft/status", { method: "DELETE" });
                        } catch {}
                        window.location.href = "/api/integrations/microsoft/connect";
                      }}
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mt-1 underline underline-offset-2"
                    >
                      Switch Microsoft account
                    </button>
                  </div>
                </div>
              )}

              {platform === "microsoft_teams" && !msConnected && (
                <div className="bg-amber-50 p-2.5 rounded-lg text-sm space-y-1.5">
                  <p className="text-amber-700 text-xs">
                    Microsoft Teams not connected. <a href="/settings/integrations" className="text-indigo-600 hover:underline font-medium">Connect in Settings</a> to auto-generate Teams links, or paste a link manually below.
                  </p>
                  <Input placeholder="https://teams.microsoft.com/l/meetup-join/..." value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
                </div>
              )}

              {platform === "zoom" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">Paste your Zoom meeting link below</p>
                  <Input placeholder="https://zoom.us/j/..." value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
                </div>
              )}

              {platform === "custom" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">Paste any meeting or scheduling link</p>
                  <Input placeholder="https://..." value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {/* Location (for IN_PERSON) */}
          {type === "IN_PERSON" && (
            <div className="space-y-2">
              <Label>Location</Label>
              <Input placeholder="Office address or room" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          )}

          {/* Recruiter Owner */}
          <div className="space-y-2">
            <Label>Recruiter Owner</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={recruiterOwnerId} onChange={(e) => setRecruiterOwnerId(e.target.value)}>
              <option value="">Select recruiter...</option>
              {teamMembers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
            <p className="text-xs text-gray-400">Owner of the candidate. Used for tracking and metrics.</p>
          </div>

          {/* Include Team Members */}
          <div className="space-y-2">
            <Label>Include Team Members</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedInterviewers.map((uid) => {
                const u = teamMembers.find((m) => m.id === uid);
                return u ? (
                  <Badge key={uid} variant="secondary" className="gap-1">
                    {u.name}
                    <button type="button" onClick={() => setSelectedInterviewers(selectedInterviewers.filter((id) => id !== uid))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })}
            </div>
            <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              value="" onChange={(e) => {
                if (e.target.value && !selectedInterviewers.includes(e.target.value)) {
                  setSelectedInterviewers([...selectedInterviewers, e.target.value]);
                }
                e.target.value = "";
              }}>
              <option value="">Add team member...</option>
              {teamMembers.filter((u) => !selectedInterviewers.includes(u.id)).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Client Contacts (for Client Interview purpose) */}
          {purpose === "CLIENT" && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-amber-500" /> Client Contacts
                <span className="text-xs text-gray-400 font-normal ml-1">(will receive invite)</span>
              </Label>
              {clientContacts.length === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
                  {!selectedCandidate
                    ? "Select a candidate first to load client contacts for that job."
                    : !selectedSubmissionId
                    ? "Select a job/pipeline to load client contacts."
                    : "No contacts found for this client. Add contacts from the Clients section first."}
                </p>
              ) : (
                <>
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
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value="" onChange={(e) => {
                      if (e.target.value && !selectedClientContacts.includes(e.target.value)) {
                        setSelectedClientContacts([...selectedClientContacts, e.target.value]);
                      }
                      e.target.value = "";
                    }}>
                    <option value="">Add client contact...</option>
                    {clientContacts.filter((c) => !selectedClientContacts.includes(c.id)).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName}{c.title ? ` (${c.title})` : ""}{c.email ? ` — ${c.email}` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedClientContacts.length > 0 && notifyAttendees && (
                    <p className="text-xs text-amber-600">
                      {selectedClientContacts.length} contact{selectedClientContacts.length > 1 ? "s" : ""} will receive an interview invite email.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={3} placeholder="Interview agenda, preparation notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Notify toggle — only meaningful for Candidate Call interviews
              (the recruiter wants to coordinate directly with the
              candidate). Client Interviews are ATS-only by definition: the
              client already runs that meeting, we just want it on the
              recruiter's tracking ledger. */}
          {purpose === "CANDIDATE" ? (
            <label className="flex items-start gap-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={notifyAttendees}
                onChange={(e) => setNotifyAttendees(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-sm text-gray-900">Send calendar invite by email</p>
                <p className="text-[11px] text-gray-500">
                  Off by default — saves as an ATS record only. Tick to email the candidate a calendar invite.
                </p>
              </div>
            </label>
          ) : (
            <div className="flex items-start gap-2.5 pt-1 text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-3 py-2">
              <CheckCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>
                Client interviews save as an internal ATS record. No emails are sent — the
                client coordinates the meeting on their side.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !selectedCandidate || !selectedSubmissionId}>
              {saving ? "Saving..." : notifyAttendees ? "Save & send invite" : "Save to ATS"}
            </Button>
          </div>

          </>
          )}
        </form>
      </div>
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
              {TYPE_OPTIONS.map((opt) => (
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
                  <opt.icon className="h-4 w-4" />
                  {opt.label}
                </button>
              ))}
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
  const accent =
    kind === "first_day"
      ? { border: "border-emerald-200", text: "text-emerald-700", bg: "bg-emerald-50" }
      : kind === "payment_due"
        ? { border: "border-amber-200", text: "text-amber-700", bg: "bg-amber-50" }
        : { border: "border-rose-200", text: "text-rose-700", bg: "bg-rose-50" };
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
          {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
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
                {new Date(placement.startDate).toLocaleDateString()}
              </span>
            </div>
          )}
          {placement.paymentDueDate && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Payment due</span>
              <span className="font-medium text-gray-900">
                {new Date(placement.paymentDueDate).toLocaleDateString()}
              </span>
            </div>
          )}
          {placement.guaranteeExpiry && (
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Guarantee expiry</span>
              <span className="font-medium text-gray-900">
                {new Date(placement.guaranteeExpiry).toLocaleDateString()}
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
