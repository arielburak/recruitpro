"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Video,
  Phone,
  MapPin,
  Clock,
  User,
  Briefcase,
  X,
  ExternalLink,
  Calendar as CalendarIcon,
} from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
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
  candidateName: string;
  jobTitle: string;
};

export default function ClientCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);

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
            <p className="text-gray-500 text-sm">Track upcoming interviews for your open positions</p>
          </div>
        </div>
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
                      className={`min-h-[90px] border-r border-b p-1.5 ${
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
                            onClick={() => setSelectedInterview(iv)}
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 truncate pr-2">{selectedInterview.title}</h3>
                  <button onClick={() => setSelectedInterview(null)} className="p-1 hover:bg-gray-100 rounded">
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
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
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 text-center text-sm text-gray-400 py-8">
                Click an interview on the calendar to view details
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

          {/* Empty State Help */}
          {interviews.length === 0 && !loading && (
            <Card>
              <CardContent className="p-4 text-center">
                <CalendarIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No interviews scheduled yet</p>
                <p className="text-xs text-gray-400 mt-1">Your recruiting firms will schedule interviews as candidates progress through the pipeline.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
