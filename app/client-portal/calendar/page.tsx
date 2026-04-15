"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  ExternalLink,
  Calendar as CalendarIcon,
  Users,
  Pencil,
  Save,
} from "lucide-react";

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

const TYPE_ICONS: Record<string, any> = { VIDEO: Video, PHONE: Phone, IN_PERSON: MapPin };
const TYPE_LABELS: Record<string, string> = { VIDEO: "Video Call", PHONE: "Phone", IN_PERSON: "In Person" };

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

const TIMEZONE_OPTIONS = [
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires", offset: "UTC-3", region: "Americas" },
  { value: "America/Sao_Paulo", label: "São Paulo", offset: "UTC-3", region: "Americas" },
  { value: "America/New_York", label: "New York (ET)", offset: "UTC-5/4", region: "Americas" },
  { value: "America/Chicago", label: "Chicago (CT)", offset: "UTC-6/5", region: "Americas" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)", offset: "UTC-8/7", region: "Americas" },
  { value: "America/Mexico_City", label: "Mexico City", offset: "UTC-6", region: "Americas" },
  { value: "America/Bogota", label: "Bogotá", offset: "UTC-5", region: "Americas" },
  { value: "Europe/London", label: "London (GMT/BST)", offset: "UTC+0/1", region: "Europe" },
  { value: "Europe/Paris", label: "Paris (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Europe/Madrid", label: "Madrid (CET)", offset: "UTC+1/2", region: "Europe" },
  { value: "Asia/Dubai", label: "Dubai (GST)", offset: "UTC+4", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore (SGT)", offset: "UTC+8", region: "Asia" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)", offset: "UTC+9", region: "Asia" },
  { value: "Australia/Sydney", label: "Sydney (AEST)", offset: "UTC+10/11", region: "Oceania" },
];

// ─── Types ───

type Interview = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
  meetingLink?: string;
  location?: string;
  timezone: string;
  notes?: string;
  candidateName: string;
  jobTitle: string;
  createdBy?: string;
  interviewers?: string[];
};

type SharedCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  currentTitle: string | null;
  submissions: { id: string; jobId: string; jobTitle: string }[];
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
};

// ─── Component ───

export default function ClientCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);

  // Edit mode
  const [editingInterview, setEditingInterview] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    date: "",
    startTime: "09:00",
    endTime: "09:30",
    type: "VIDEO",
    status: "SCHEDULED",
    meetingLink: "",
    location: "",
    timezone: "America/Argentina/Buenos_Aires",
    notes: "",
  });

  function startEditInterview(iv: Interview) {
    const start = new Date(iv.startTime);
    const end = new Date(iv.endTime);
    setEditForm({
      title: iv.title || "",
      date: start.toISOString().split("T")[0],
      startTime: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      endTime: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
      type: iv.type || "VIDEO",
      status: iv.status || "SCHEDULED",
      meetingLink: iv.meetingLink || "",
      location: iv.location || "",
      timezone: iv.timezone || "America/Argentina/Buenos_Aires",
      notes: iv.notes || "",
    });
    setEditingInterview(true);
  }

  async function saveEditInterview() {
    if (!selectedInterview) return;
    setSavingEdit(true);
    try {
      const startDateTime = new Date(`${editForm.date}T${editForm.startTime}:00`);
      const endDateTime = new Date(`${editForm.date}T${editForm.endTime}:00`);
      const res = await fetch(`/api/client-portal/interviews/${selectedInterview.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          type: editForm.type,
          status: editForm.status,
          meetingLink: editForm.meetingLink || undefined,
          location: editForm.type === "IN_PERSON" ? editForm.location : undefined,
          timezone: editForm.timezone,
          notes: editForm.notes || undefined,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedInterview(updated);
        setEditingInterview(false);
        fetchInterviews();
      }
    } catch {}
    setSavingEdit(false);
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    fetchInterviews();
  }, [year, month]);

  async function fetchInterviews() {
    setLoading(true);
    try {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month + 2, 0).toISOString();
      const res = await fetch(`/api/client-portal/interviews?start=${start}&end=${end}`);
      if (res.ok) setInterviews(await res.json());
    } catch { /* silent */ }
    setLoading(false);
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

  // Upcoming interviews (next 7 days)
  const nowMs = Date.now();
  const weekFromNow = nowMs + 7 * 24 * 60 * 60 * 1000;
  const upcoming = interviews
    .filter((iv) => new Date(iv.startTime).getTime() >= nowMs && new Date(iv.startTime).getTime() <= weekFromNow && iv.status === "SCHEDULED")
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

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

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
  }

  function openCreate(day: number, m: number, y: number) {
    setCreateDate(new Date(y, m, day, 9, 0));
    setShowCreateModal(true);
  }

  const TypeIcon = selectedInterview ? TYPE_ICONS[selectedInterview.type] || Video : Video;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <CalendarIcon className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Interview Calendar</h1>
            <p className="text-gray-500 text-sm">Schedule and track interviews for your open positions</p>
          </div>
        </div>
        <Button
          onClick={() => { setCreateDate(new Date()); setShowCreateModal(true); }}
          className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Schedule Interview
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-4">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {MONTHS[month]} {year}
                </h2>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 border-t border-l">
                {calendarDays.map((cell, idx) => {
                  const dayInterviews = getInterviewsForDay(cell.day, cell.month, cell.year);
                  const todayCell = isToday(cell.day, cell.month, cell.year);

                  return (
                    <div
                      key={idx}
                      onClick={() => cell.isCurrentMonth && openCreate(cell.day, cell.month, cell.year)}
                      className={`min-h-[90px] border-r border-b p-1.5 cursor-pointer hover:bg-gray-50 transition-colors ${
                        cell.isCurrentMonth ? "bg-white" : "bg-gray-50"
                      } ${todayCell ? "bg-emerald-50/50" : ""}`}
                    >
                      <div className={`text-xs font-medium mb-1 ${
                        todayCell
                          ? "text-emerald-600 bg-emerald-100 w-6 h-6 rounded-full flex items-center justify-center"
                          : cell.isCurrentMonth ? "text-gray-700" : "text-gray-400"
                      }`}>
                        {cell.day}
                      </div>
                      <div className="space-y-0.5">
                        {dayInterviews.slice(0, 3).map((iv) => (
                          <button
                            key={iv.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedInterview(iv); }}
                            className={`w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate ${
                              iv.status === "CANCELLED"
                                ? "bg-red-50 text-red-600 line-through"
                                : iv.status === "COMPLETED"
                                ? "bg-green-50 text-green-700"
                                : "bg-emerald-100 text-emerald-700"
                            } hover:opacity-80 transition-opacity`}
                          >
                            {formatTime(iv.startTime, iv.timezone)} {iv.candidateName.split(" ")[0]}
                          </button>
                        ))}
                        {dayInterviews.length > 3 && (
                          <p className="text-[10px] text-gray-400 px-1">+{dayInterviews.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Interview Detail Panel */}
          {selectedInterview ? (
            <Card className="border-emerald-200">
              <CardContent className="p-4">
                {editingInterview ? (
                  /* ── Edit Mode ── */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-semibold text-gray-900">Edit Interview</h3>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingInterview(false)}>Cancel</Button>
                        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={saveEditInterview} disabled={savingEdit}>
                          <Save className="h-3 w-3" />{savingEdit ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Title</Label>
                      <Input className="h-8 text-sm" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Date</Label>
                      <Input type="date" className="h-8 text-sm" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Start</Label>
                        <select className="flex h-8 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                          value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}>
                          {Array.from({ length: 40 }, (_, i) => {
                            const h = Math.floor((i * 30 + 7 * 60) / 60);
                            const m = (i * 30 + 7 * 60) % 60;
                            if (h >= 24) return null;
                            const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                            const label = new Date(`2000-01-01T${val}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                            return <option key={val} value={val}>{label}</option>;
                          })}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">End</Label>
                        <select className="flex h-8 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                          value={editForm.endTime} onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}>
                          {Array.from({ length: 40 }, (_, i) => {
                            const h = Math.floor((i * 30 + 7 * 60) / 60);
                            const m = (i * 30 + 7 * 60) % 60;
                            if (h >= 24) return null;
                            const val = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                            const label = new Date(`2000-01-01T${val}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                            return <option key={val} value={val}>{label}</option>;
                          })}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Type</Label>
                      <div className="grid grid-cols-3 gap-1">
                        {TYPE_OPTIONS.map((opt) => (
                          <button key={opt.value} type="button"
                            className={`flex items-center justify-center gap-1 p-1.5 rounded border text-[11px] transition-colors ${
                              editForm.type === opt.value ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 hover:bg-gray-50"
                            }`}
                            onClick={() => setEditForm({ ...editForm, type: opt.value })}>
                            <opt.icon className="h-3 w-3" />{opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Status</Label>
                      <select className="flex h-8 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                        value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                        <option value="SCHEDULED">Scheduled</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELLED">Cancelled</option>
                        <option value="NO_SHOW">No Show</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Timezone</Label>
                      <select className="flex h-8 w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                        value={editForm.timezone} onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}>
                        {TIMEZONE_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>{t.label} ({t.offset})</option>
                        ))}
                      </select>
                    </div>

                    {editForm.type === "VIDEO" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Meeting Link</Label>
                        <Input className="h-8 text-sm" placeholder="https://meet.google.com/..." value={editForm.meetingLink} onChange={(e) => setEditForm({ ...editForm, meetingLink: e.target.value })} />
                      </div>
                    )}

                    {editForm.type === "IN_PERSON" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Location</Label>
                        <Input className="h-8 text-sm" placeholder="Office address" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={3} className="text-sm" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                    </div>
                  </div>
                ) : (
                  /* ── View Mode ── */
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900 truncate pr-2">{selectedInterview.title}</h3>
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEditInterview(selectedInterview)} className="p-1 hover:bg-gray-100 rounded" title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                        <button onClick={() => { setSelectedInterview(null); setEditingInterview(false); }} className="p-1 hover:bg-gray-100 rounded">
                          <X className="h-3.5 w-3.5 text-gray-400" />
                        </button>
                      </div>
                    </div>

                    <Badge className={`text-xs mb-3 ${STATUS_COLORS[selectedInterview.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[selectedInterview.status] || selectedInterview.status}
                    </Badge>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-start gap-2.5">
                        <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium">{formatDate(selectedInterview.startTime)}</p>
                          <p className="text-gray-500">
                            {formatTime(selectedInterview.startTime, selectedInterview.timezone)} – {formatTime(selectedInterview.endTime, selectedInterview.timezone)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <User className="h-4 w-4 text-gray-400 shrink-0" />
                        <p>{selectedInterview.candidateName}</p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <Briefcase className="h-4 w-4 text-gray-400 shrink-0" />
                        <p className="text-gray-600">{selectedInterview.jobTitle}</p>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <TypeIcon className="h-4 w-4 text-gray-400 shrink-0" />
                        <p className="text-gray-600">{TYPE_LABELS[selectedInterview.type] || selectedInterview.type}</p>
                      </div>

                      {selectedInterview.location && (
                        <div className="flex items-center gap-2.5">
                          <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                          <p className="text-gray-600">{selectedInterview.location}</p>
                        </div>
                      )}

                      {selectedInterview.interviewers && selectedInterview.interviewers.length > 0 && (
                        <div className="flex items-start gap-2.5">
                          <Users className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Team Members</p>
                            {selectedInterview.interviewers.map((name, i) => (
                              <p key={i} className="text-gray-600">{name}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedInterview.notes && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-gray-500 mb-1">Notes</p>
                          <p className="text-gray-600 text-sm whitespace-pre-wrap">{selectedInterview.notes}</p>
                        </div>
                      )}

                      {selectedInterview.meetingLink && (
                        <a
                          href={selectedInterview.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 text-sm font-medium mt-2"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Join Meeting
                        </a>
                      )}

                      {selectedInterview.createdBy && (
                        <p className="text-xs text-gray-400 pt-2 border-t">
                          Scheduled by {selectedInterview.createdBy}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 text-center text-sm text-gray-400 py-8">
                Click an interview on the calendar to view details, or click a day to schedule a new one
              </CardContent>
            </Card>
          )}

          {/* Upcoming Interviews */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-600" />
                Upcoming (7 days)
              </h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No upcoming interviews this week
                </p>
              ) : (
                <div className="space-y-2">
                  {upcoming.slice(0, 8).map((iv) => {
                    const Icon = TYPE_ICONS[iv.type] || Video;
                    return (
                      <button
                        key={iv.id}
                        onClick={() => setSelectedInterview(iv)}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-xs font-medium text-gray-900 truncate">{iv.candidateName}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 ml-5.5">
                          {formatDate(iv.startTime)} · {formatTime(iv.startTime, iv.timezone)}
                        </p>
                        <p className="text-[11px] text-gray-400 ml-5.5 truncate">{iv.jobTitle}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Empty State */}
          {interviews.length === 0 && !loading && (
            <Card>
              <CardContent className="p-4 text-center">
                <CalendarIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No interviews scheduled yet</p>
                <p className="text-xs text-gray-400 mt-1">Click the button above or any day on the calendar to schedule your first interview.</p>
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

  // Form state
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate ? defaultDate.toISOString().split("T")[0] : "");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [duration, setDuration] = useState(30);
  const [type, setType] = useState("VIDEO");
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const [notes, setNotes] = useState("");

  // Candidate search
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState<SharedCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<SharedCandidate | null>(null);
  const [candidateDropdownOpen, setCandidateDropdownOpen] = useState(false);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const candidateRef = useRef<HTMLDivElement>(null);

  // Submission (job) selection
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");

  // Team members
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);

  // Fetch team members on mount
  useEffect(() => {
    fetch("/api/client-portal/team")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTeamMembers(data);
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

  // Load all candidates on mount + search with debounce
  useEffect(() => {
    const timeout = setTimeout(async () => {
      setSearchingCandidates(true);
      try {
        const url = candidateSearch.length >= 2
          ? `/api/client-portal/candidates?search=${encodeURIComponent(candidateSearch)}`
          : "/api/client-portal/candidates";
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setCandidateResults(data);
          if (candidateSearch.length >= 2) setCandidateDropdownOpen(true);
        }
      } catch { /* silent */ }
      setSearchingCandidates(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [candidateSearch]);

  function selectCandidate(candidate: SharedCandidate) {
    setSelectedCandidate(candidate);
    setCandidateDropdownOpen(false);
    setCandidateSearch("");
    setTitle(`Interview - ${candidate.firstName} ${candidate.lastName}`);
    if (candidate.submissions.length === 1) {
      setSelectedSubmissionId(candidate.submissions[0].id);
    }
  }

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
      const res = await fetch("/api/client-portal/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || `Interview - ${selectedCandidate.firstName} ${selectedCandidate.lastName}`,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          type,
          candidateId: selectedCandidate.id,
          submissionId: selectedSubmissionId,
          meetingLink: meetingLink || undefined,
          location: type === "IN_PERSON" ? location : undefined,
          timezone,
          notes: notes || undefined,
          teamMemberIds: selectedTeamMembers.length > 0 ? selectedTeamMembers : undefined,
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

          {/* Candidate Search */}
          <div className="space-y-2">
            <Label>Candidate *</Label>
            {selectedCandidate ? (
              <div className="flex items-center justify-between p-2.5 bg-emerald-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-emerald-500" />
                  <div>
                    <span className="text-sm font-medium">{selectedCandidate.firstName} {selectedCandidate.lastName}</span>
                    {selectedCandidate.currentTitle && (
                      <span className="text-xs text-gray-500 ml-2">{selectedCandidate.currentTitle}</span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => { setSelectedCandidate(null); setSelectedSubmissionId(""); setTitle(""); }}
                  className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div ref={candidateRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    placeholder="Search shared candidates..."
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    onFocus={() => candidateResults.length > 0 && setCandidateDropdownOpen(true)}
                  />
                </div>
                {candidateDropdownOpen && candidateResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {candidateResults.map((c) => (
                      <button key={c.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 transition-colors"
                        onClick={() => selectCandidate(c)}>
                        <span className="font-medium">{c.firstName} {c.lastName}</span>
                        {c.currentTitle && <span className="text-gray-400 ml-2 text-xs">{c.currentTitle}</span>}
                        <span className="text-gray-400 text-xs block">{c.submissions.map((s) => s.jobTitle).join(", ")}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchingCandidates && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
                {!searchingCandidates && candidateResults.length === 0 && candidateSearch.length >= 2 && (
                  <p className="text-xs text-gray-400 mt-1">No shared candidates found</p>
                )}
              </div>
            )}
          </div>

          {/* Job / Submission Selection */}
          {selectedCandidate && (
            <div className="space-y-2">
              <Label>Job Position *</Label>
              {selectedCandidate.submissions.length === 1 ? (
                <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg text-sm">
                  <Briefcase className="h-4 w-4 text-gray-400" />
                  <span>{selectedCandidate.submissions[0].jobTitle}</span>
                </div>
              ) : (
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedSubmissionId} onChange={(e) => setSelectedSubmissionId(e.target.value)} required>
                  <option value="">Select a position...</option>
                  {selectedCandidate.submissions.map((s) => (
                    <option key={s.id} value={s.id}>{s.jobTitle}</option>
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

          {/* Date & Duration */}
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
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {d < 60 ? `${d}m` : d === 60 ? "1h" : "1.5h"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Start & End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Time *</Label>
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
                    hour: "numeric", minute: "2-digit", hour12: true,
                  });
                  return <option key={val} value={val}>{label}</option>;
                })}
              </select>
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <div className="flex h-10 w-full rounded-md border border-input bg-gray-50 px-3 py-2 text-sm items-center text-gray-600">
                {endTime && new Date(`2000-01-01T${endTime}`).toLocaleTimeString("en-US", {
                  hour: "numeric", minute: "2-digit", hour12: true,
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
              {TIMEZONE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label} ({t.offset})</option>
              ))}
            </select>
          </div>

          {/* Interview Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button"
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                    type === opt.value ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => setType(opt.value)}>
                  <opt.icon className="h-4 w-4" />{opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meeting Link (for VIDEO) */}
          {type === "VIDEO" && (
            <div className="space-y-2">
              <Label>Meeting Link</Label>
              <Input placeholder="https://meet.google.com/... or https://zoom.us/..." value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
              <p className="text-xs text-gray-400">Paste a Google Meet, Zoom, or Teams link</p>
            </div>
          )}

          {/* Location (for IN_PERSON) */}
          {type === "IN_PERSON" && (
            <div className="space-y-2">
              <Label>Location</Label>
              <Input placeholder="Office address or room" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          )}

          {/* Team Members */}
          {teamMembers.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-gray-400" /> Include Team Members
              </Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedTeamMembers.map((uid) => {
                  const u = teamMembers.find((m) => m.id === uid);
                  return u ? (
                    <Badge key={uid} variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700">
                      {u.name}
                      <button type="button" onClick={() => setSelectedTeamMembers(selectedTeamMembers.filter((id) => id !== uid))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null;
                })}
              </div>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value="" onChange={(e) => {
                  if (e.target.value && !selectedTeamMembers.includes(e.target.value)) {
                    setSelectedTeamMembers([...selectedTeamMembers, e.target.value]);
                  }
                  e.target.value = "";
                }}>
                <option value="">Add team member...</option>
                {teamMembers.filter((u) => !selectedTeamMembers.includes(u.id)).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={3} placeholder="Interview agenda, preparation notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving || !selectedCandidate || !selectedSubmissionId}>
              {saving ? "Scheduling..." : "Schedule Interview"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
