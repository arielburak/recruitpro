"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { PipelineChart } from "@/components/dashboard-charts";
import {
  DateRangePicker,
  resolveDateRange,
  fmtRangeShort,
  type DatePresetKey,
} from "./date-range-picker";

// Pipeline Distribution widget with a time-range filter.
//
// "Submissions that had any activity in this period, bucketed by
// their current stage" — interpretation chosen to answer the
// user's question: which candidates moved through the pipeline
// in the picked window. A submission moved to Placed in March is
// NOT counted in February; one created Jan 5 and last updated
// Jan 20 is counted under its current stage for any range that
// covers Jan 20.
//
// Backed by /api/dashboard/pipeline-distribution which does the
// aggregation server-side. Self-contained client component so the
// picker reruns the fetch without a page reload.

type ApiResponse = {
  from: string;
  to: string;
  data: { name: string; count: number }[];
  total: number;
};

export function PipelineDistribution() {
  const [preset, setPreset] = useState<DatePresetKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const window = useMemo(
    () => resolveDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    });
    setLoading(true);
    fetch(`/api/dashboard/pipeline-distribution?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ApiResponse | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [window.from.getTime(), window.to.getTime()]);

  const total = data?.total ?? 0;
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base inline-flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-500" />
            Pipeline Distribution
          </CardTitle>
          <p className="text-[11px] text-gray-500 mt-1">
            {data
              ? `${total} submission${total === 1 ? "" : "s"} active in ${fmtRangeShort(new Date(data.from), new Date(data.to))}`
              : "—"}
          </p>
        </div>
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[280px] bg-gray-50 rounded animate-pulse" />
        ) : (
          <PipelineChart data={data?.data || []} />
        )}
      </CardContent>
    </Card>
  );
}
