"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Users,
  Building2,
  Plus,
  ArrowRight,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { formatDate } from "@/lib/utils";

export default function ClientDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/client-portal/dashboard")
      .then((res) => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const statusIcon: Record<string, any> = {
    PENDING: <Clock className="h-3.5 w-3.5 text-amber-500" />,
    ACCEPTED: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
    DECLINED: <XCircle className="h-3.5 w-3.5 text-red-400" />,
  };

  const statusColor: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    ACCEPTED: "bg-green-50 text-green-700 border-green-200",
    DECLINED: "bg-red-50 text-red-600 border-red-200",
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {data?.client?.name || "Dashboard"}
          </h1>
          <p className="text-gray-500 text-sm">
            Manage your job postings and recruiting partnerships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/client-portal/jobs/new">
            <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
              <Plus className="h-4 w-4" />
              Post a Job
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/client-portal/login" })}
            className="gap-1.5"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Open Positions</p>
              <p className="text-3xl font-bold mt-1">{data?.stats?.openJobs || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50">
              <Briefcase className="h-6 w-6 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Candidates Shared</p>
              <p className="text-3xl font-bold mt-1">{data?.stats?.totalCandidates || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-50">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Recruiters</p>
              <p className="text-3xl font-bold mt-1">{data?.stats?.activeRecruiters || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-indigo-50">
              <Building2 className="h-6 w-6 text-indigo-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Your Job Postings</h2>
        </div>

        {!data?.jobs || data.jobs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No jobs posted yet</h3>
              <p className="text-gray-500 text-sm mb-4">
                Post your first job and invite recruiting firms to start sourcing candidates.
              </p>
              <Link href="/client-portal/jobs/new">
                <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Post Your First Job
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.jobs.map((job: any) => (
              <Card key={job.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{job.title}</h3>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${
                            job.status === "OPEN"
                              ? "bg-green-50 text-green-700"
                              : job.status === "FILLED"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        {job.location && <span>{job.location}</span>}
                        {job.jobType && <span>{job.jobType}</span>}
                        {job.salaryRange && <span>{job.salaryRange}</span>}
                        <span>Posted {formatDate(job.createdAt)}</span>
                      </div>

                      {/* Engagements */}
                      {job.engagements?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {job.engagements.map((eng: any) => (
                            <div
                              key={eng.id}
                              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${statusColor[eng.status]}`}
                            >
                              {statusIcon[eng.status]}
                              <span className="font-medium">{eng.organization.name}</span>
                              <span className="opacity-70">{eng.status.toLowerCase()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Link href={`/client-portal/jobs/${job.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1 text-gray-500">
                        View
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
