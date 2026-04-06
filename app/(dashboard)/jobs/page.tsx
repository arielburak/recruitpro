"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Briefcase } from "lucide-react";
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from "@/lib/constants";

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => { setJobs(data); setLoading(false); });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs / Searches</h1>
          <p className="text-gray-500">{jobs.length} total</p>
        </div>
        <Link href="/jobs/new">
          <Button><Plus className="mr-2 h-4 w-4" /> Create Job</Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No jobs yet. Create your first job order.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{j.title}</h3>
                      <Badge className={JOB_STATUS_COLORS[j.status]}>{JOB_STATUS_LABELS[j.status]}</Badge>
                    </div>
                    <p className="text-sm text-gray-500">{j.client.name}</p>
                    <div className="flex gap-4 mt-1 text-xs text-gray-400">
                      {j.location && <span>{j.location}</span>}
                      {j.salary && <span>{j.salary}</span>}
                      <span>{j._count.submissions} candidates</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400">
                    {j.assignments?.map((a: any) => a.user.name).join(", ")}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
