"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Trophy, Handshake, Send, Video } from "lucide-react";

// Recruiter performance leaderboard. Self-contained client widget so
// it can re-fetch when the period filter changes without bouncing the
// whole dashboard page through SSR. Hits /api/dashboard/recruiter-
// performance for the aggregated rows; the heavy bucketing logic
// lives there.

type Range = "30d" | "qtr" | "ytd" | "all";

type Row = {
  userId: string;
  name: string;
  email: string;
  submissions: number;
  offers: number;
  interviews: number;
  placements: number;
};

const RANGES: { key: Range; label: string }[] = [
  { key: "30d", label: "Last 30d" },
  { key: "qtr", label: "This quarter" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All time" },
];

function rangeWindow(r: Range): { from: Date; to: Date } {
  const now = new Date();
  const to = now;
  if (r === "30d") {
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from, to };
  }
  if (r === "qtr") {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    return { from, to };
  }
  if (r === "ytd") {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from, to };
  }
  // all-time: bound at the unix epoch — covers every real row in the
  // ATS without leaking a "no filter" path through to the API.
  return { from: new Date(0), to };
}

export function RecruiterPerformance() {
  const [range, setRange] = useState<Range>("30d");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = rangeWindow(range);
    setLoading(true);
    fetch(
      `/api/dashboard/recruiter-performance?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    )
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((data) => setRows(Array.isArray(data.rows) ? data.rows : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base inline-flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          Recruiter performance
        </CardTitle>
        <div className="inline-flex rounded-md border bg-white p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                range === r.key
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-5 py-6 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            <Users className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            No activity in this period yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                <th className="text-left px-5 py-2.5">Recruiter</th>
                <th className="text-right px-3 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    <Send className="h-3 w-3" /> Submissions
                  </span>
                </th>
                <th className="text-right px-3 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    <Video className="h-3 w-3" /> Interviews
                  </span>
                </th>
                <th className="text-right px-3 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    <Handshake className="h-3 w-3" /> Offers
                  </span>
                </th>
                <th className="text-right px-5 py-2.5">
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="h-3 w-3" /> Placements
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.userId}
                  className="border-b border-gray-50 hover:bg-gray-50/50 last:border-b-0"
                >
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    <p className="text-[11px] text-gray-400">{r.email}</p>
                  </td>
                  <td className="text-right px-3 py-2.5 text-gray-900">
                    {r.submissions}
                  </td>
                  <td className="text-right px-3 py-2.5 text-gray-900">
                    {r.interviews}
                  </td>
                  <td className="text-right px-3 py-2.5 text-amber-600 font-medium">
                    {r.offers}
                  </td>
                  <td className="text-right px-5 py-2.5 text-emerald-600 font-semibold">
                    {r.placements}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
