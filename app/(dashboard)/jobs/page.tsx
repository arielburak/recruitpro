"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Briefcase, Trash2 } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/constants";

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => { setJobs(data); setLoading(false); });
  }, []);

  async function deleteJob(id: string, title: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${title}"? This will remove all pipeline data. This cannot be undone.`)) return;
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setJobs(jobs.filter((j) => j.id !== id));
  }

  const filtered = search
    ? jobs.filter((j) =>
        j.title.toLowerCase().includes(search.toLowerCase()) ||
        j.client.name.toLowerCase().includes(search.toLowerCase()) ||
        (j.location || "").toLowerCase().includes(search.toLowerCase())
      )
    : jobs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs / Searches</h1>
          <p className="text-sm text-gray-500">{jobs.length} total</p>
        </div>
        <Link href="/jobs/new">
          <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" /> Create Job</Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by title, client, location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-9 text-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-1">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-11 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Briefcase className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {search ? "No jobs match your search" : "No jobs yet. Create your first job order."}
          </p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_100px_140px_100px_80px] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <div>Title</div>
            <div>Client</div>
            <div>Status</div>
            <div>Location</div>
            <div>Assigned</div>
            <div className="text-right">Cands</div>
          </div>

          {/* Rows */}
          {filtered.map((j: any, i: number) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="block">
              <div className={`group grid grid-cols-[1fr_1fr_100px_140px_100px_80px] gap-0 px-4 py-2.5 items-center hover:bg-indigo-50/50 transition-colors cursor-pointer ${
                i < filtered.length - 1 ? "border-b border-gray-100" : ""
              }`}>
                {/* Title */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{j.title}</p>
                </div>

                {/* Client */}
                <div className="min-w-0">
                  <p className="text-sm text-gray-500 truncate">{j.client.name}</p>
                </div>

                {/* Status */}
                <div>
                  <Badge className={`${JOB_STATUS_COLORS[j.status]} text-[10px] px-1.5 py-0`}>
                    {JOB_STATUS_LABELS[j.status]}
                  </Badge>
                </div>

                {/* Location */}
                <div className="min-w-0">
                  {j.location ? (
                    <p className="text-xs text-gray-500 truncate">{j.location}</p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </div>

                {/* Assigned */}
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 truncate">
                    {j.assignments?.map((a: any) => a.user.name).join(", ") || "—"}
                  </p>
                </div>

                {/* Candidates count */}
                <div className="text-right flex items-center justify-end gap-1">
                  {j._count.submissions > 0 ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {j._count.submissions}
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                  <button
                    onClick={(e) => deleteJob(j.id, j.title, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-0.5 rounded ml-1"
                    title="Delete job"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
