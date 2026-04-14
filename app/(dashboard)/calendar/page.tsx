"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import Link from "next/link";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TYPE_ICONS: Record<string, any> = {
  VIDEO: Video,
  PHONE: Phone,
  IN_PERSON: MapPin,
};

const TYPE_LABELS: Record<string, string> = {
  VIDEO: "Video Call",
  PHONE: "Phone",
  IN_PERSON: "In Person",
};

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
  notes?: string;
  meetingLink?: string;
  location?: string;
  candidate: { id: string; firstName: string; lastName: string };
  job: { id: string; title: string; client: { name: string } };
  creator: { name: string };
  interviewers: { user: { id: string; name: string } }[];
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "week">("month");
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    fetchInterviews();
  }, [year, month]);

  async function fetchInterviews() {
    setLoading(true);
    try {
      // Fetch a wide range to cover month view
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month + 2, 0).toISOString();
      const res = await fetch(`/api/interviews?start=${start}&end=${end}`);
      if (res.ok) {
        const data = await res.json();
        setInterviews(data);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function goToday() {
    setCurrentDate(new Date());
  }

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarDays: { day: number; month: number; year: number; isCurrentMonth: boolean }[] = [];

  // Previous month's trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    calendarDays.push({
      day: daysInPrevMonth - i,
      month: month - 1,
      year: month === 0 ? year - 1 : year,
      isCurrentMonth: false,
    });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push({ day: d, month, year, isCurrentMonth: true });
  }

  // Next month's leading days to fill 6 rows
  const remaining = 42 - calendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    calendarDays.push({
      day: d,
      month: month + 1,
      year: month === 11 ? year + 1 : year,
      isCurrentMonth: false,
    });
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
    .filter((iv) => {
      const t = new Date(iv.startTime).getTime();
      return t >= nowMs && t <= weekFromNow && iv.status === "SCHEDULED";
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatDateShort(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-gray-500">Interview schedule</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-lg font-semibold min-w-[180px] text-center">
                    {MONTHS[month]} {year}
                  </h2>
                  <Button variant="outline" size="sm" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={goToday} className="ml-2 text-xs">
                    Today
                  </Button>
                </div>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 border-t border-l">
                {calendarDays.map((cd, idx) => {
                  const dayInterviews = getInterviewsForDay(cd.day, cd.month, cd.year);
                  const todayClass = isToday(cd.day, cd.month, cd.year);

                  return (
                    <div
                      key={idx}
                      className={`min-h-[90px] border-r border-b p-1 ${
                        cd.isCurrentMonth ? "bg-white" : "bg-gray-50"
                      }`}
                    >
                      <div className={`text-xs font-medium mb-0.5 ${
                        todayClass
                          ? "bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center"
                          : cd.isCurrentMonth ? "text-gray-900" : "text-gray-400"
                      }`}>
                        {cd.day}
                      </div>
                      <div className="space-y-0.5">
                        {dayInterviews.slice(0, 3).map((iv) => (
                          <button
                            key={iv.id}
                            type="button"
                            onClick={() => setSelectedInterview(iv)}
                            className={`w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate ${
                              iv.status === "CANCELLED"
                                ? "bg-red-50 text-red-600 line-through"
                                : iv.status === "COMPLETED"
                                ? "bg-green-50 text-green-700"
                                : "bg-indigo-50 text-indigo-700"
                            } hover:opacity-80 transition-opacity`}
                          >
                            {formatTime(iv.startTime)} {iv.candidate.firstName} {iv.candidate.lastName.charAt(0)}.
                          </button>
                        ))}
                        {dayInterviews.length > 3 && (
                          <p className="text-[10px] text-gray-400 px-1">
                            +{dayInterviews.length - 3} more
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Upcoming + Detail */}
        <div className="space-y-4">
          {/* Selected interview detail */}
          {selectedInterview && (
            <Card className="border-indigo-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">{selectedInterview.title}</h3>
                  <button
                    onClick={() => setSelectedInterview(null)}
                    className="text-gray-400 hover:text-gray-600 text-xs"
                  >
                    Close
                  </button>
                </div>

                <Badge className={STATUS_COLORS[selectedInterview.status]}>
                  {STATUS_LABELS[selectedInterview.status]}
                </Badge>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {formatDateShort(selectedInterview.startTime)},{" "}
                      {formatTime(selectedInterview.startTime)} - {formatTime(selectedInterview.endTime)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-gray-600">
                    {(() => {
                      const Icon = TYPE_ICONS[selectedInterview.type] || Video;
                      return <Icon className="h-3.5 w-3.5" />;
                    })()}
                    <span>{TYPE_LABELS[selectedInterview.type] || selectedInterview.type}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    <Link
                      href={`/candidates/${selectedInterview.candidate.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {selectedInterview.candidate.firstName} {selectedInterview.candidate.lastName}
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                    <Link
                      href={`/jobs/${selectedInterview.job.id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {selectedInterview.job.title}
                    </Link>
                    <span className="text-gray-400">@ {selectedInterview.job.client.name}</span>
                  </div>

                  {selectedInterview.meetingLink && (
                    <a
                      href={selectedInterview.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Join Meeting
                    </a>
                  )}

                  {selectedInterview.location && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{selectedInterview.location}</span>
                    </div>
                  )}

                  {selectedInterview.interviewers?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-1">Interviewers</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedInterview.interviewers.map((iv) => (
                          <Badge key={iv.user.id} variant="secondary" className="text-xs">
                            {iv.user.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedInterview.notes && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase mb-1">Notes</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedInterview.notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming interviews */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm mb-3">Upcoming (7 days)</h3>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : upcoming.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No upcoming interviews</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((iv) => (
                    <button
                      key={iv.id}
                      type="button"
                      onClick={() => setSelectedInterview(iv)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                        selectedInterview?.id === iv.id
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {(() => {
                          const Icon = TYPE_ICONS[iv.type] || Video;
                          return <Icon className="h-3 w-3 text-gray-400" />;
                        })()}
                        <span className="text-xs font-medium truncate">
                          {iv.candidate.firstName} {iv.candidate.lastName}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">{iv.job.title}</p>
                      <p className="text-[11px] text-gray-400">
                        {formatDateShort(iv.startTime)} · {formatTime(iv.startTime)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
