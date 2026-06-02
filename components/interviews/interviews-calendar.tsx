"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { InterviewRow } from "./interviews-list";

// Mini month-grid calendar scoped to a single page's interviews
// (job or candidate). Same data shape as InterviewsList so the
// parent just swaps the rendered view; the dialog wiring stays
// the same via the shared onRowClick callback.
//
// Color language matches the global /calendar page so a recruiter
// doesn't have to relearn the affordances: indigo = scheduled,
// green = completed, red = cancelled (with strikethrough), gray
// = no-show. Status overrides any purpose tint since "did it
// happen?" is the more actionable signal at-a-glance.

const STATUS_CHIP: Record<string, string> = {
  SCHEDULED: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
  COMPLETED: "bg-green-100 text-green-800 hover:bg-green-200",
  CANCELLED: "bg-red-100 text-red-800 hover:bg-red-200 line-through",
  NO_SHOW: "bg-gray-100 text-gray-700 hover:bg-gray-200",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  interviews: InterviewRow[];
  attendeeKind: "job" | "candidate";
  onRowClick: (iv: InterviewRow) => void;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function InterviewsCalendar({ interviews, attendeeKind, onRowClick }: Props) {
  // Seed the displayed month on whichever month has the next upcoming
  // interview. If the recruiter is staring at a job with all
  // interviews a week out, we don't want them to land on today's
  // empty grid — start where the action is.
  const seedMonth = useMemo(() => {
    const today = new Date();
    const future = interviews
      .filter((iv) => iv.status === "SCHEDULED")
      .map((iv) => new Date(iv.startTime))
      .filter((d) => d >= today)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return startOfMonth(future || today);
  }, [interviews]);

  const [cursor, setCursor] = useState<Date>(seedMonth);

  // Bucket by yyyy-m-d so the day cells don't have to filter every
  // render. Keys are local-time dates (cell rendering also uses local
  // time), so a 23:30 interview on the 14th doesn't slip into the 15th.
  const byDay = useMemo(() => {
    const m = new Map<string, InterviewRow[]>();
    for (const iv of interviews) {
      const d = new Date(iv.startTime);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = m.get(key) || [];
      arr.push(iv);
      m.set(key, arr);
    }
    for (const [, arr] of m) {
      arr.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
    }
    return m;
  }, [interviews]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function prevMonth() { setCursor(new Date(year, month - 1, 1)); }
  function nextMonth() { setCursor(new Date(year, month + 1, 1)); }
  function goToday() { setCursor(startOfMonth(new Date())); }

  if (interviews.length === 0) {
    return (
      <div className="border rounded-xl bg-white p-8 text-center text-gray-500">
        No interviews scheduled yet.
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday} className="ml-1 text-xs">
            Today
          </Button>
        </div>
        <h3 className="text-sm font-semibold text-gray-900">{monthLabel}</h3>
        <div className="w-[120px]" />
      </div>

      <div className="grid grid-cols-7 border-b bg-gray-50">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-center"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr">
        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
          <div key={`blank-${i}`} className="min-h-[100px] border-r border-b bg-gray-50/30" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayDate = new Date(year, month, day);
          const key = `${year}-${month}-${day}`;
          const events = byDay.get(key) || [];
          const isToday = isSameDay(dayDate, today);
          return (
            <div
              key={day}
              className={`min-h-[100px] border-r border-b p-1.5 ${
                isToday ? "bg-indigo-50/40" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] font-medium ${
                    isToday ? "text-indigo-700" : "text-gray-500"
                  }`}
                >
                  {day}
                </span>
                {events.length > 2 && (
                  <span className="text-[9px] text-gray-400">{events.length}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {events.slice(0, 3).map((iv) => {
                  const t = new Date(iv.startTime).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  const secondary =
                    attendeeKind === "job"
                      ? iv.candidate
                        ? `${iv.candidate.firstName} ${iv.candidate.lastName.charAt(0)}.`
                        : ""
                      : iv.job?.title || "";
                  return (
                    <button
                      key={iv.id}
                      type="button"
                      onClick={() => onRowClick(iv)}
                      className={`block w-full text-left rounded px-1 py-0.5 text-[10px] truncate font-medium transition-colors ${
                        STATUS_CHIP[iv.status] || "bg-gray-100 text-gray-700"
                      }`}
                      title={`${t} · ${iv.title || iv.type}${secondary ? ` · ${secondary}` : ""}`}
                    >
                      <span className="font-semibold mr-1">{t}</span>
                      {secondary || iv.title || iv.type}
                    </button>
                  );
                })}
                {events.length > 3 && (
                  <p className="text-[10px] text-gray-400 px-1">
                    + {events.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
