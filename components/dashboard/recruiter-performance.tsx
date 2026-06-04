"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Trophy,
  Send,
  Video,
  Handshake,
  Users,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
  X,
} from "lucide-react";
import {
  RecruiterPerformanceDrilldown,
  type DrilldownMetric,
} from "./recruiter-performance-drilldown";
import {
  DateRangePicker,
  resolveDateRange,
  fmtRangeShort,
  type DatePresetKey,
} from "./date-range-picker";

// Recruiter performance dashboard — the metrics surface a sales-ops
// person would open every Monday. Independent client component so
// the period + recruiter filters can re-fetch without bouncing the
// whole dashboard SSR.
//
// Layout:
//   ┌── header (title · range picker · recruiter filter · compare) ──┐
//   ┌── totals strip (Submissions / Interviews / Offers / Placements
//      with delta-vs-prior chips when compare is on)                 ┐
//   ┌── sortable per-recruiter table                                  ┐
//
// API: /api/dashboard/recruiter-performance accepts from / to /
// recruiterIds / compare. Bucketing rules live there; this file
// is presentation only.

type Row = {
  userId: string;
  name: string;
  email: string;
  submissions: number;
  interviews: number;
  offers: number;
  placements: number;
  conversionPct: number;
};

type RosterUser = { id: string; name: string; email: string };

type Totals = {
  submissions: number;
  interviews: number;
  offers: number;
  placements: number;
};

type ApiResponse = {
  from: string;
  to: string;
  recruiters: RosterUser[];
  rows: Row[];
  totals: Totals;
  prior: { totals: Totals; from: string; to: string } | null;
};


type SortKey = "submissions" | "interviews" | "offers" | "placements" | "conversionPct";

export function RecruiterPerformance() {
  const [preset, setPreset] = useState<DatePresetKey>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const [compare, setCompare] = useState(true);

  // Selected recruiters — empty Set = ALL (the picker UI shows
  // every roster member as "active" in that case).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [recruiterFilterOpen, setRecruiterFilterOpen] = useState(false);
  const recruiterFilterRef = useRef<HTMLDivElement>(null);

  // Drill-down drawer state. Clicking a number in the table opens
  // the drawer pre-scoped to the same period + filter + the picked
  // recruiter / metric.
  const [drilldown, setDrilldown] = useState<{ recruiterId: string; metric: DrilldownMetric } | null>(null);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [sortBy, setSortBy] = useState<SortKey>("placements");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Close the recruiter-filter popover on outside click. The date
  // picker handles its own popover lifecycle inside DateRangePicker.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        recruiterFilterRef.current &&
        !recruiterFilterRef.current.contains(e.target as Node)
      ) {
        setRecruiterFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const window = useMemo(() => resolveDateRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  useEffect(() => {
    const params = new URLSearchParams({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    });
    if (compare) params.set("compare", "prior");
    if (picked.size > 0) params.set("recruiterIds", Array.from(picked).join(","));
    setLoading(true);
    fetch(`/api/dashboard/recruiter-performance?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ApiResponse | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [window.from.getTime(), window.to.getTime(), compare, picked]);

  const rows = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.rows].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [data, sortBy, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  }

  const recruiters = data?.recruiters || [];
  const allSelected = picked.size === 0 || picked.size === recruiters.length;

  function togglePicked(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      // "All" mode normalises to a full set first so we can subtract.
      if (next.size === 0) {
        for (const r of recruiters) next.add(r.id);
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Collapse "everyone picked" back to the empty-means-all
      // sentinel so the request stops sending the long list.
      if (next.size === recruiters.length) return new Set();
      return next;
    });
  }

  function pickAll() {
    setPicked(new Set());
  }
  function pickNone() {
    // Use the full roster ids but with one removed → unambiguously
    // "not all". Actually: tracking "none picked" as empty conflicts
    // with the "empty means all" sentinel. Easiest: drop to a Set
    // with a non-existent id so the request returns no rows. We use
    // a literal "__none__" so the server's includes-check rejects
    // it and zero rows surface — explicit empty state.
    setPicked(new Set(["__none__"]));
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-gray-100 px-5 py-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 shrink-0">
            <Trophy className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 leading-tight">
              Recruiter performance
            </h2>
            <p className="text-[11px] text-gray-500 leading-tight">
              {data
                ? fmtRangeShort(new Date(data.from), new Date(data.to))
                : "—"}
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Date range picker — shared with the other dashboard
              widgets so the dashboard's mental model of "time" stays
              consistent across charts. */}
          <DateRangePicker
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onChange={({ preset: p, customFrom: cf, customTo: ct }) => {
              setPreset(p);
              setCustomFrom(cf || "");
              setCustomTo(ct || "");
            }}
          />

          {/* Recruiter multi-select */}
          <div ref={recruiterFilterRef} className="relative">
            <button
              type="button"
              onClick={() => setRecruiterFilterOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border rounded-md hover:bg-gray-50"
            >
              <Users className="h-3.5 w-3.5 text-gray-400" />
              {allSelected
                ? "All recruiters"
                : picked.has("__none__")
                  ? "No recruiters"
                  : `${picked.size} recruiter${picked.size === 1 ? "" : "s"}`}
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </button>
            {recruiterFilterOpen && (
              <div className="absolute right-0 mt-1 z-30 w-64 bg-white border rounded-lg shadow-lg p-2 max-h-72 overflow-y-auto">
                <div className="flex items-center justify-between mb-1 px-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                    Filter
                  </span>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={pickAll}
                      className="text-indigo-600 hover:underline"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={pickNone}
                      className="text-gray-400 hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {recruiters.map((r) => {
                    const isOn = picked.size === 0
                      ? true
                      : !picked.has("__none__") && picked.has(r.id);
                    return (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => togglePicked(r.id)}
                          className="h-3.5 w-3.5"
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 truncate">{r.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{r.email}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Compare-to-prior toggle */}
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Compare
          </label>
        </div>
      </div>

      {/* Active filters chips — only show non-default selections so the
          header stays calm in the common case. */}
      {!allSelected && !picked.has("__none__") && (
        <div className="px-5 pt-3 flex flex-wrap items-center gap-1.5">
          {Array.from(picked).map((id) => {
            const u = recruiters.find((r) => r.id === id);
            if (!u) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[11px] px-2 py-0.5 rounded-full"
              >
                {u.name}
                <button
                  type="button"
                  onClick={() => togglePicked(id)}
                  className="hover:text-indigo-900"
                  aria-label={`Remove ${u.name}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Totals strip */}
      <div className="px-5 pt-4 pb-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TotalTile
          icon={Send}
          color="indigo"
          label="Submissions"
          value={data?.totals.submissions ?? 0}
          prior={data?.prior?.totals.submissions ?? null}
          loading={loading}
          tooltip="Candidates the recruiter put in front of a client in this period (counted at submission creation, attributed to the candidate's owner)."
        />
        <TotalTile
          icon={Video}
          color="blue"
          label="Interviews"
          value={data?.totals.interviews ?? 0}
          prior={data?.prior?.totals.interviews ?? null}
          loading={loading}
          tooltip="Interviews scheduled with a start time in this period, for candidates owned by the recruiter."
        />
        <TotalTile
          icon={Handshake}
          color="amber"
          label="Offers"
          value={data?.totals.offers ?? 0}
          prior={data?.prior?.totals.offers ?? null}
          loading={loading}
          tooltip="Distinct candidate-job submissions that reached the Offered stage during this period — including ones that later became Placements or were rejected. Counted once per submission, so a candidate bounced in/out of Offered on the same job doesn't double-count."
        />
        <TotalTile
          icon={Trophy}
          color="emerald"
          label="Placements"
          value={data?.totals.placements ?? 0}
          prior={data?.prior?.totals.placements ?? null}
          loading={loading}
          tooltip="Placements created in this period. The placement's explicit Recruiter override takes precedence; otherwise it falls back to the candidate's owner."
        />
      </div>

      <CardContent className="p-0">
        {loading ? (
          <div className="px-5 py-6 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            <Users className="h-7 w-7 text-gray-300 mx-auto mb-2" />
            No activity in this period for the picked recruiters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60 border-y border-gray-100">
                <tr className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                  <th className="text-left px-5 py-2.5">Recruiter</th>
                  <SortableHeader
                    label="Submissions"
                    icon={Send}
                    active={sortBy === "submissions"}
                    dir={sortDir}
                    onClick={() => toggleSort("submissions")}
                    tooltip="Candidates this recruiter put in front of a client in the period."
                  />
                  <SortableHeader
                    label="Interviews"
                    icon={Video}
                    active={sortBy === "interviews"}
                    dir={sortDir}
                    onClick={() => toggleSort("interviews")}
                    tooltip="Interviews scheduled with a start time in the period, for candidates owned by this recruiter."
                  />
                  <SortableHeader
                    label="Offers"
                    icon={Handshake}
                    active={sortBy === "offers"}
                    dir={sortDir}
                    onClick={() => toggleSort("offers")}
                    tooltip="Distinct submissions that reached the Offered stage in this period — counted once per candidate-job pair, even if they bounced in/out. Includes ones that later became Placements or were rejected."
                  />
                  <SortableHeader
                    label="Placements"
                    icon={Trophy}
                    active={sortBy === "placements"}
                    dir={sortDir}
                    onClick={() => toggleSort("placements")}
                    tooltip="Placements created in the period. Placement's Recruiter override wins; otherwise attributed to the candidate's owner."
                  />
                  <SortableHeader
                    label="Placement %"
                    active={sortBy === "conversionPct"}
                    dir={sortDir}
                    onClick={() => toggleSort("conversionPct")}
                    tooltip="Placements ÷ Submissions × 100. Of every 100 candidates this recruiter sent to a client, how many ended up placed."
                  />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.userId}
                    className="border-b border-gray-50 hover:bg-gray-50/50 last:border-b-0"
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{r.name}</p>
                      <p className="text-[11px] text-gray-400">{r.email}</p>
                    </td>
                    <DrilldownCell
                      value={r.submissions}
                      onOpen={() => setDrilldown({ recruiterId: r.userId, metric: "submissions" })}
                    />
                    <DrilldownCell
                      value={r.interviews}
                      onOpen={() => setDrilldown({ recruiterId: r.userId, metric: "interviews" })}
                    />
                    <DrilldownCell
                      value={r.offers}
                      tone="amber"
                      onOpen={() => setDrilldown({ recruiterId: r.userId, metric: "offers" })}
                    />
                    <DrilldownCell
                      value={r.placements}
                      tone="emerald"
                      onOpen={() => setDrilldown({ recruiterId: r.userId, metric: "placements" })}
                    />
                    <td className="text-right px-5 py-3 text-gray-700">
                      {r.submissions > 0 ? `${r.conversionPct}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {drilldown && (
        <RecruiterPerformanceDrilldown
          metric={drilldown.metric}
          recruiterId={drilldown.recruiterId}
          from={window.from}
          to={window.to}
          onClose={() => setDrilldown(null)}
        />
      )}
    </Card>
  );
}

function TotalTile({
  icon: Icon,
  color,
  label,
  value,
  prior,
  loading,
  tooltip,
}: {
  icon: any;
  color: "indigo" | "blue" | "amber" | "emerald";
  label: string;
  value: number;
  prior: number | null;
  loading: boolean;
  // Plain-English explanation of how the metric is computed. Shows
  // up on hover so an operator who didn't build this can read what
  // the number actually means before relying on it.
  tooltip?: string;
}) {
  const colorMap = {
    indigo: "bg-indigo-50 text-indigo-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  } as const;

  const delta = prior !== null ? value - prior : null;
  const pct = prior !== null && prior > 0 ? Math.round(((value - prior) / prior) * 100) : null;

  return (
    <div className="rounded-xl border bg-white p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium inline-flex items-center gap-1">
          {label}
          {tooltip && (
            <Info
              className="h-3 w-3 text-gray-300 hover:text-gray-500 cursor-help"
              aria-label={tooltip}
              // Native browser tooltip — works without extra portal/
              // provider wiring. Plenty for a one-line explanation.
              // eslint-disable-next-line react/no-unknown-property
              {...({ title: tooltip } as any)}
            />
          )}
        </span>
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${colorMap[color]}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>
      {loading ? (
        <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-semibold text-gray-900 tracking-tight">{value}</p>
      )}
      {delta !== null && !loading && (
        <div className="flex items-center gap-1 text-[11px]">
          {delta === 0 ? (
            <>
              <Minus className="h-3 w-3 text-gray-400" />
              <span className="text-gray-400">No change vs prior</span>
            </>
          ) : delta > 0 ? (
            <>
              <TrendingUp className="h-3 w-3 text-emerald-600" />
              <span className="text-emerald-600 font-medium">
                +{delta}
                {pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct}%)` : ""}
              </span>
            </>
          ) : (
            <>
              <TrendingDown className="h-3 w-3 text-rose-600" />
              <span className="text-rose-600 font-medium">
                {delta}
                {pct !== null ? ` (${pct}%)` : ""}
              </span>
            </>
          )}
          <span className="text-gray-400">vs prior</span>
        </div>
      )}
    </div>
  );
}

function DrilldownCell({
  value,
  tone,
  onOpen,
}: {
  value: number;
  tone?: "amber" | "emerald";
  onOpen: () => void;
}) {
  const cls =
    tone === "amber"
      ? "text-amber-600 font-medium"
      : tone === "emerald"
        ? "text-emerald-600 font-semibold"
        : "text-gray-900";
  return (
    <td className="text-right px-3 py-3">
      {value > 0 ? (
        <button
          type="button"
          onClick={onOpen}
          className={`${cls} hover:underline cursor-pointer`}
          title="See the underlying rows"
        >
          {value}
        </button>
      ) : (
        <span className="text-gray-400">{value}</span>
      )}
    </td>
  );
}

function SortableHeader({
  label,
  icon: Icon,
  active,
  dir,
  onClick,
  tooltip,
}: {
  label: string;
  icon?: any;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  // Hover-explanation for the column. Surfaces an Info icon when set
  // so an operator can hover to see how the column is computed.
  tooltip?: string;
}) {
  const Arrow = !active ? ArrowUpDown : dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <th
      className="text-right px-3 py-2.5 cursor-pointer select-none hover:text-gray-700"
      onClick={onClick}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        {tooltip && (
          <Info
            className="h-2.5 w-2.5 text-gray-300 hover:text-gray-500 cursor-help"
            aria-label={tooltip}
            // Stop the click from triggering the column sort when the
            // user is just trying to read the explanation.
            onClick={(e) => e.stopPropagation()}
            {...({ title: tooltip } as any)}
          />
        )}
        <Arrow className={`h-2.5 w-2.5 ${active ? "text-indigo-600" : "text-gray-300"}`} />
      </span>
    </th>
  );
}
