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
  CheckCircle,
  Clock,
  XCircle,
  LogOut,
  TrendingUp,
  Search,
  Sparkles,
  BarChart3,
  Target,
  Handshake,
  Eye,
  Mail,
  UserPlus,
  X,
  Copy,
  Check,
  UserX,
  MoreHorizontal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut } from "next-auth/react";
import { formatDate } from "@/lib/utils";

export default function ClientDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Team management state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteTitle, setInviteTitle] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ type: "success" | "error"; message: string; link?: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [teamMenuOpen, setTeamMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/client-portal/dashboard")
      .then((res) => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchTeam();
  }, []);

  async function fetchTeam() {
    try {
      const res = await fetch("/api/client-portal/team");
      if (res.ok) {
        setTeamMembers(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("[fetchTeam] Failed:", res.status, err);
      }
    } catch (e) {
      console.error("[fetchTeam] Error:", e);
    }
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const res = await fetch("/api/client-portal/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inviteName.trim(), email: inviteEmail.trim(), title: inviteTitle.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        const debugInfo = data.debug ? ` [session: ${JSON.stringify(data.debug)}]` : "";
        setInviteResult({ type: "error", message: (data.error || "Failed to invite") + debugInfo });
      } else {
        setInviteResult({
          type: "success",
          message: data.reactivated ? "Team member reactivated!" : "Invitation created!",
          link: data.inviteLink,
        });
        setInviteName("");
        setInviteTitle("");
        setInviteEmail("");
        fetchTeam();
      }
    } catch {
      setInviteResult({ type: "error", message: "Something went wrong" });
    }
    setInviting(false);
  }

  async function toggleMember(id: string, isActive: boolean) {
    await fetch(`/api/client-portal/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setTeamMenuOpen(null);
    fetchTeam();
  }

  async function removeMember(id: string) {
    if (!confirm("Remove this team member? This cannot be undone.")) return;
    await fetch(`/api/client-portal/team/${id}`, { method: "DELETE" });
    setTeamMenuOpen(null);
    fetchTeam();
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-10 w-56 bg-gray-200 rounded-lg animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
          <div className="h-64 bg-gray-200 rounded-2xl animate-pulse" />
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

  const openJobs = data?.stats?.openJobs || 0;
  const totalCandidates = data?.stats?.totalCandidates || 0;
  const activeRecruiters = data?.stats?.activeRecruiters || 0;
  const totalJobs = data?.jobs?.length || 0;

  // Count pending engagements
  const pendingEngagements = (data?.jobs || []).reduce(
    (acc: number, job: any) =>
      acc + (job.engagements?.filter((e: any) => e.status === "PENDING")?.length || 0),
    0
  );

  const stats = [
    {
      label: "Open Positions",
      value: openJobs,
      icon: Briefcase,
      gradient: "from-emerald-500 to-teal-600",
    },
    {
      label: "Candidates Shared",
      value: totalCandidates,
      icon: Users,
      gradient: "from-blue-500 to-indigo-600",
    },
    {
      label: "Active Recruiters",
      value: activeRecruiters,
      icon: Handshake,
      gradient: "from-violet-500 to-purple-600",
    },
    {
      label: "Total Jobs",
      value: totalJobs,
      icon: BarChart3,
      gradient: "from-amber-500 to-orange-600",
    },
  ];

  const hasJobs = data?.jobs && data.jobs.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {data?.client?.name || "Dashboard"}
          </h1>
          <p className="text-gray-500 text-sm">
            {data?.client?.industry ? `${data.client.industry} · ` : ""}
            Manage your hiring pipeline
          </p>
        </div>
        <Link href="/client-portal/jobs/new">
          <Button className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" />
            Post a Job
          </Button>
        </Link>
      </div>

      {/* Pending Engagements Alert */}
      {pendingEngagements > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-xl flex-shrink-0">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-900 text-sm">
              {pendingEngagements} recruiting firm{pendingEngagements > 1 ? "s" : ""} waiting to respond
            </p>
            <p className="text-xs text-amber-700">Check your job postings to see engagement status</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm hover:shadow-md transition-all">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-sm`}>
                  <stat.icon className="h-4 w-4 text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Action / Empty State */}
      {!hasJobs && (
        <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 rounded-2xl p-8 text-white shadow-lg">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-2">Get started with your first job posting</h2>
              <p className="text-emerald-100 text-sm mb-5 max-w-lg">
                Post a job description and invite recruiting firms on the platform to source candidates for you. It&apos;s free to post and manage.
              </p>
              <div className="flex gap-3">
                <Link href="/client-portal/jobs/new">
                  <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-50 transition shadow">
                    <Plus className="h-4 w-4" />
                    Post a Job
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Postings */}
      {hasJobs && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Your Job Postings</h2>
            <Link href="/client-portal/jobs/new">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                New Job
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {data.jobs.map((job: any) => {
              const accepted = job.engagements?.filter((e: any) => e.status === "ACCEPTED").length || 0;
              const pending = job.engagements?.filter((e: any) => e.status === "PENDING").length || 0;
              const total = job.engagements?.length || 0;

              return (
                <Card key={job.id} className="border-0 shadow-sm hover:shadow-md transition-all group">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Link href={`/client-portal/jobs/${job.id}`}>
                            <h3 className="font-semibold text-gray-900 hover:text-emerald-600 transition">
                              {job.title}
                            </h3>
                          </Link>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              job.status === "OPEN"
                                ? "bg-emerald-50 text-emerald-700"
                                : job.status === "FILLED"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {job.status}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                          {job.location && <span>{job.location}</span>}
                          {job.jobType && (
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">{job.jobType}</span>
                          )}
                          {job.salaryRange && <span>{job.salaryRange}</span>}
                          <span className="text-gray-400">Posted {formatDate(job.createdAt)}</span>
                        </div>

                        {/* Engagement Summary */}
                        {total > 0 && (
                          <div className="flex items-center gap-4 text-xs">
                            {accepted > 0 && (
                              <div className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-3 w-3" />
                                <span className="font-medium">{accepted} active</span>
                              </div>
                            )}
                            {pending > 0 && (
                              <div className="flex items-center gap-1 text-amber-600">
                                <Clock className="h-3 w-3" />
                                <span className="font-medium">{pending} pending</span>
                              </div>
                            )}
                            <span className="text-gray-400">{total} firm{total !== 1 ? "s" : ""} invited</span>
                          </div>
                        )}

                        {/* Firm Badges */}
                        {job.engagements?.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {job.engagements.map((eng: any) => (
                              <div
                                key={eng.id}
                                className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${statusColor[eng.status]}`}
                              >
                                {statusIcon[eng.status]}
                                <span className="font-medium">{eng.organization.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Link href={`/client-portal/jobs/${job.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1 text-gray-400 group-hover:text-emerald-600 transition">
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Members */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-600" />
            Team Members
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { setShowInvite(!showInvite); setInviteResult(null); }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Member
          </Button>
        </div>

        {/* Invite Form */}
        {showInvite && (
          <Card className="border-emerald-200 mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">Invite a Team Member</h4>
                <button onClick={() => setShowInvite(false)}>
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <form onSubmit={inviteMember} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="John Smith"
                      className="text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Job Title</Label>
                    <Input
                      value={inviteTitle}
                      onChange={(e) => setInviteTitle(e.target.value)}
                      placeholder="e.g. VP of Engineering"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="john@company.com"
                    className="text-sm"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                  disabled={inviting}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {inviting ? "Sending..." : "Send Invitation"}
                </Button>
              </form>
              {inviteResult && (
                <div className={`mt-3 text-xs p-2.5 rounded-lg ${inviteResult.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                  <p>{inviteResult.message}</p>
                  {inviteResult.link && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        readOnly
                        value={inviteResult.link}
                        className="flex-1 bg-white border rounded px-2 py-1 text-[11px] text-gray-600 truncate"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(inviteResult.link!);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                        }}
                        className="shrink-0 p-1 rounded hover:bg-green-100"
                        title="Copy link"
                      >
                        {copiedLink ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Members List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teamMembers.map((member) => (
            <Card key={member.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                      {member.name?.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                      {member.title && <p className="text-[11px] text-gray-500 truncate">{member.title}</p>}
                      <p className="text-xs text-gray-400 truncate">{member.email}</p>
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setTeamMenuOpen(teamMenuOpen === member.id ? null : member.id)}
                      className="p-1 rounded hover:bg-gray-100"
                    >
                      <MoreHorizontal className="h-4 w-4 text-gray-400" />
                    </button>
                    {teamMenuOpen === member.id && (
                      <div className="absolute right-0 top-8 z-10 bg-white border rounded-lg shadow-lg py-1 w-40">
                        {member.isActive ? (
                          <button
                            onClick={() => toggleMember(member.id, false)}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <UserX className="h-3.5 w-3.5" /> Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleMember(member.id, true)}
                            className="w-full text-left px-3 py-1.5 text-sm text-emerald-600 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Reactivate
                          </button>
                        )}
                        <button
                          onClick={() => removeMember(member.id)}
                          className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <X className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {!member.isActive && (
                  <Badge variant="secondary" className="mt-2 text-[10px] bg-gray-100 text-gray-500">Inactive</Badge>
                )}
              </CardContent>
            </Card>
          ))}
          {teamMembers.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full text-center py-6">
              No team members yet. Click &quot;Add Member&quot; to invite your colleagues.
            </p>
          )}
        </div>
      </div>

      {/* Quick Insights Row */}
      {hasJobs && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hiring Funnel */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-emerald-500" />
                Hiring Progress
              </CardTitle>
              <p className="text-xs text-gray-400">Overview of your recruitment activity</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { label: "Jobs Posted", value: totalJobs, max: Math.max(totalJobs, 10), color: "bg-emerald-500" },
                  { label: "Firms Engaged", value: activeRecruiters, max: Math.max(totalJobs * 3, 10), color: "bg-indigo-500" },
                  { label: "Candidates Shared", value: totalCandidates, max: Math.max(totalCandidates, 20), color: "bg-blue-500" },
                ].map((item) => {
                  const pct = Math.min((item.value / item.max) * 100, 100);
                  return (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{item.label}</span>
                        <span className="font-bold text-gray-900">{item.value}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${item.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* How It Works / Tips */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-violet-500" />
                Tips to Hire Faster
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  {
                    icon: Search,
                    title: "Invite more firms",
                    desc: "Each job can have multiple recruiting firms competing to find the best talent.",
                    color: "bg-blue-100 text-blue-600",
                  },
                  {
                    icon: Users,
                    title: "Review candidates quickly",
                    desc: "Recruiters are more responsive when you rate and provide feedback promptly.",
                    color: "bg-emerald-100 text-emerald-600",
                  },
                  {
                    icon: Briefcase,
                    title: "Keep job descriptions detailed",
                    desc: "The more context you provide, the better candidates your firms will source.",
                    color: "bg-violet-100 text-violet-600",
                  },
                ].map((tip) => (
                  <div key={tip.title} className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${tip.color} flex-shrink-0`}>
                      <tip.icon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{tip.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{tip.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
