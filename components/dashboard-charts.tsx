"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = [
  "#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#818cf8",
  "#60a5fa", "#38bdf8", "#22d3ee", "#34d399", "#fbbf24",
];

const STAGE_COLORS: Record<string, string> = {
  Sourced: "#94a3b8",
  "Internal Review": "#60a5fa",
  Submitted: "#818cf8",
  Interview: "#a78bfa",
  Offer: "#f59e0b",
  Placed: "#22c55e",
};

export function PipelineChart({ data }: { data: { name: string; count: number }[] }) {
  if (!data || data.length === 0) return <EmptyChart label="No pipeline data yet" />;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
          cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
          {data.map((entry, i) => (
            <Cell key={i} fill={STAGE_COLORS[entry.name] || COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ActivityTrendChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) return <EmptyChart label="No activity data yet" />;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <defs>
          <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
        />
        <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} fill="url(#activityGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SourceBreakdownChart({ data }: { data: { name: string; value: number }[] }) {
  if (!data || data.length === 0) return <EmptyChart label="No source data yet" />;

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {data.slice(0, 6).map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-gray-600 truncate max-w-[120px]">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{item.value}</span>
              <span className="text-xs text-gray-400">({total > 0 ? Math.round((item.value / total) * 100) : 0}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JobStatusChart({ data }: { data: { status: string; count: number }[] }) {
  if (!data || data.length === 0) return <EmptyChart label="No jobs yet" />;

  const STATUS_COLORS: Record<string, string> = {
    OPEN: "#60a5fa",
    ACTIVE: "#6366f1",
    ON_HOLD: "#f59e0b",
    FILLED: "#22c55e",
    CLOSED: "#94a3b8",
  };

  const STATUS_LABELS: Record<string, string> = {
    OPEN: "Open",
    ACTIVE: "Active",
    ON_HOLD: "On Hold",
    FILLED: "Filled",
    CLOSED: "Closed",
  };

  // Max compartido entre todas las barras — calculado una sola vez,
  // no por iteracion. Cualquier item con count === maxCount llega a
  // 100%; el resto proporcional.
  const maxCount = data.length > 0 ? Math.max(...data.map((d) => d.count || 0)) : 0;

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const safeCount = Number.isFinite(item.count) ? item.count : 0;
        const pct = maxCount > 0 ? (safeCount / maxCount) * 100 : 0;
        return (
          <div key={item.status} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{STATUS_LABELS[item.status] || item.status}</span>
              <span className="font-bold text-gray-900">{safeCount}</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[item.status] || "#6366f1" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RecruiterLeaderboard({
  data,
}: {
  data: { name: string; candidates: number; submissions: number; placements: number }[];
}) {
  if (!data || data.length === 0) return <EmptyChart label="No recruiter data yet" />;

  return (
    <div className="space-y-3">
      {data.map((recruiter, i) => (
        <div key={recruiter.name} className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
            i === 0 ? "bg-gradient-to-br from-amber-400 to-amber-600" :
            i === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500" :
            i === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800" :
            "bg-gradient-to-br from-indigo-400 to-indigo-600"
          }`}>
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900 truncate">{recruiter.name}</p>
            <div className="flex gap-3 text-xs text-gray-500">
              <span>{recruiter.candidates} candidates</span>
              <span>{recruiter.submissions} submissions</span>
              <span className="font-semibold text-emerald-600">
                {recruiter.placements} placement{recruiter.placements === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">
      {label}
    </div>
  );
}
