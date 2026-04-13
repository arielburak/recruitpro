"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Building, Search, Check, X, Plus } from "lucide-react";

interface Job {
  id: string;
  title: string;
  status: string;
  client: { name: string };
  stages: { id: string; name: string }[];
}

interface AssignToJobsDialogProps {
  candidateId: string;
  candidateName: string;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}

export function AssignToJobsDialog({ candidateId, candidateName, open, onClose, onAssigned }: AssignToJobsDialogProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      fetchJobs();
      setSelected(new Set());
      setSearch("");
      setError("");
    }
  }, [open, candidateId]);

  async function fetchJobs() {
    setLoading(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/assign`);
      if (res.ok) {
        setJobs(await res.json());
      }
    } catch {}
    setLoading(false);
  }

  function toggleJob(jobId: string) {
    const next = new Set(selected);
    if (next.has(jobId)) {
      next.delete(jobId);
    } else {
      next.add(jobId);
    }
    setSelected(next);
  }

  async function handleAssign() {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/candidates/${candidateId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error || "Assignment failed");
        return;
      }
      onAssigned();
      onClose();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredJobs = jobs.filter(
    (j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.client.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-bold">Assign to Jobs</h2>
            <p className="text-sm text-gray-500">
              Select jobs for {candidateName}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs or clients..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              {jobs.length === 0
                ? "No available jobs to assign. This candidate may already be submitted to all open jobs."
                : "No jobs match your search."}
            </div>
          ) : (
            filteredJobs.map((job) => {
              const isSelected = selected.has(job.id);
              return (
                <button
                  key={job.id}
                  onClick={() => toggleJob(job.id)}
                  className={`w-full text-left p-3 rounded-lg border transition flex items-center gap-3 ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "bg-indigo-600 border-indigo-600" : "border-gray-300"
                    }`}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {job.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Building className="h-3 w-3 text-gray-300 flex-shrink-0" />
                      <span className="text-xs text-gray-500 truncate">
                        {job.client.name}
                      </span>
                      <Badge variant="secondary" className="text-xs py-0">
                        {job.status}
                      </Badge>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500">
              {selected.size} job{selected.size !== 1 ? "s" : ""} selected
            </span>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAssign}
              disabled={selected.size === 0 || submitting}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {submitting ? "Assigning..." : `Assign to ${selected.size} Job${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
