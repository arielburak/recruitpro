"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Share2, Users, GripVertical } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export default function JobDetailPage() {
  const params = useParams();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${params.id}`);
    if (res.ok) setJob(await res.json());
    setLoading(false);
  }, [params.id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  async function searchCandidates(query: string) {
    setCandidateSearch(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/candidates?search=${encodeURIComponent(query)}&mine=false&limit=10`);
    const data = await res.json();
    setSearchResults(data.candidates || []);
    setSearching(false);
  }

  async function addCandidateToJob(candidateId: string) {
    await fetch(`/api/jobs/${params.id}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    setShowAddCandidate(false);
    setCandidateSearch("");
    setSearchResults([]);
    fetchJob();
  }

  async function moveSubmission(submissionId: string, stageId: string) {
    await fetch(`/api/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    fetchJob();
  }

  async function toggleShare(submissionId: string, shared: boolean) {
    await fetch(`/api/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSharedWithClient: shared }),
    });
    fetchJob();
  }

  if (loading) return <div className="h-96 bg-gray-100 rounded-lg animate-pulse" />;
  if (!job) return <p className="text-gray-500">Job not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/jobs">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{job.title}</h1>
              <Badge className={JOB_STATUS_COLORS[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
            </div>
            <p className="text-gray-500">
              {job.client.name}
              {job.location && ` - ${job.location}`}
              {job.salary && ` - ${job.salary}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddCandidate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Candidate
          </Button>
          <Dialog open={showAddCandidate} onOpenChange={setShowAddCandidate}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Candidate to Pipeline</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="Search candidates by name..."
                value={candidateSearch}
                onChange={(e) => searchCandidates(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {searching && <p className="text-sm text-gray-400 p-2">Searching...</p>}
                {searchResults.map((c) => {
                  const alreadyAdded = job.submissions.some((s: any) => s.candidateId === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => !alreadyAdded && addCandidateToJob(c.id)}
                      disabled={alreadyAdded}
                      className="w-full text-left p-3 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <p className="font-medium">{c.firstName} {c.lastName}</p>
                      <p className="text-sm text-gray-500">
                        {[c.currentTitle, c.currentCompany].filter(Boolean).join(" at ")}
                      </p>
                      {alreadyAdded && <p className="text-xs text-gray-400">Already in pipeline</p>}
                    </button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <KanbanBoard
            stages={job.stages}
            submissions={job.submissions}
            onMove={moveSubmission}
            onToggleShare={toggleShare}
          />
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Client</p>
                  <p className="font-medium">{job.client.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <Badge className={JOB_STATUS_COLORS[job.status]}>{JOB_STATUS_LABELS[job.status]}</Badge>
                </div>
                {job.location && (
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p>{job.location}</p>
                  </div>
                )}
                {job.salary && (
                  <div>
                    <p className="text-sm text-gray-500">Salary</p>
                    <p>{job.salary}</p>
                  </div>
                )}
                {job.feeAmount && (
                  <div>
                    <p className="text-sm text-gray-500">Fee</p>
                    <p>{job.feeType === "PERCENTAGE" ? `${job.feeAmount}%` : `$${job.feeAmount}`}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Assigned</p>
                  <p>{job.assignments?.map((a: any) => a.user.name).join(", ") || "None"}</p>
                </div>
              </div>
              {job.description && (
                <div>
                  <p className="text-sm text-gray-500">Description</p>
                  <p className="whitespace-pre-wrap mt-1">{job.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
