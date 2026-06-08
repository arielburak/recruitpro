"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  UserCheck,
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
  // Mirror del lookup que ya viven en my-team y settings: si el email
  // pegado ya es un Contact del cliente, lo avisamos + pre-llenamos
  // name/title para que no haya duplicado de contacto al invitar.
  const [contactMatch, setContactMatch] = useState<{
    name: string;
    title: string | null;
    email: string;
  } | null>(null);

  // Firms Engaged drawer
  const [firmsOpen, setFirmsOpen] = useState(false);
  const [firms, setFirms] = useState<
    | { organizationId: string; name: string; jobsCount: number; pendingCount: number; candidatesShared: number }[]
    | null
  >(null);
  const [firmsLoading, setFirmsLoading] = useState(false);

  async function openFirmsDrawer() {
    setFirmsOpen(true);
    if (firms !== null) return;
    setFirmsLoading(true);
    try {
      const res = await fetch("/api/client-portal/firms-engaged");
      if (res.ok) {
        const data = await res.json();
        setFirms(data.firms || []);
      } else {
        setFirms([]);
      }
    } catch {
      setFirms([]);
    }
    setFirmsLoading(false);
  }

  useEffect(() => {
    fetch("/api/client-portal/dashboard")
      .then((res) => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    fetchTeam();
  }, []);

  // Live contact lookup: si el email tipeado en el invite ya es un
  // Contact del cliente (subido por la agencia), avisamos + pre-llenamos
  // name/title para no duplicar. Mismo patron que en my-team/settings.
  useEffect(() => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      setContactMatch(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/client-portal/contact-lookup?email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.match) {
          setContactMatch(null);
          return;
        }
        setContactMatch(data.match);
        setInviteName((prev) => (prev.trim() ? prev : data.match.name));
        setInviteTitle((prev) => (prev.trim() ? prev : data.match.title || ""));
      } catch {}
    }, 400);
    return () => clearTimeout(handle);
  }, [inviteEmail]);

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
        setContactMatch(null);
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

  type Stat = {
    label: string;
    value: number;
    icon: typeof Briefcase;
    gradient: string;
    href?: string;
    onClick?: () => void;
  };
  const stats: Stat[] = [
    {
      label: "Open Positions",
      value: openJobs,
      icon: Briefcase,
      gradient: "from-emerald-500 to-teal-600",
      href: "/client-portal/jobs",
    },
    {
      label: "Candidates Shared",
      value: totalCandidates,
      icon: Users,
      gradient: "from-blue-500 to-indigo-600",
      href: "/client-portal/candidates",
    },
    {
      label: "Active Recruiters",
      value: activeRecruiters,
      icon: Handshake,
      gradient: "from-violet-500 to-purple-600",
      // No dedicated "recruiters" page in the client portal — open the
      // same Firms Engaged drawer used by the Hiring Progress widget so
      // the click does land somewhere useful instead of dead-ending.
      onClick: activeRecruiters > 0 ? openFirmsDrawer : undefined,
    },
    {
      label: "Total Jobs",
      value: totalJobs,
      icon: BarChart3,
      gradient: "from-amber-500 to-orange-600",
      href: "/client-portal/jobs",
    },
  ];

  const hasJobs = data?.jobs && data.jobs.length > 0;
  const hasAgencyJobs = (data?.agencyJobs?.length || 0) > 0;
  const hasAnyJobs = hasJobs || hasAgencyJobs;

  // Unified Jobs list. Two upstream sources:
  //   - data.jobs        → ClientJob records the client posted themselves
  //                        (with engagements / firm invites). Link to the
  //                        ClientJob detail page so they can manage firms.
  //   - data.agencyJobs  → Job records an agency runs ON BEHALF of the
  //                        client. The ClientJob detail page can't render
  //                        these, so they link to the filtered candidates
  //                        view instead.
  // We tag each row with a `_source` so the card knows which footer + link
  // to render, and sort newest first across both sources.
  const allJobs = hasAnyJobs
    ? [
        ...(data?.jobs || []).map((j: any) => ({ ...j, _source: "self" as const })),
        ...(data?.agencyJobs || []).map((j: any) => ({ ...j, _source: "agency" as const })),
      ].sort((a, b) => {
        const at = new Date(a.createdAt || 0).getTime();
        const bt = new Date(b.createdAt || 0).getTime();
        return bt - at;
      })
    : [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Stub-Client onboarding banner. Appears when the workspace
          was bootstrapped from a Google OAuth signup (or a
          quick-share invite the recruiter sent) and we haven't
          collected real company info yet. Inline form so the user
          can complete it without leaving the dashboard. */}
      {data?.client?.isStub && (
        <StubOnboardingBanner
          defaultName={data?.client?.name || ""}
          defaultIndustry={data?.client?.industry || ""}
          onSaved={() => {
            // Hard reload so the header + every server-rendered
            // surface picks up the new name without a stale render.
            window.location.reload();
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {data?.client?.name || "Dashboard"}
          </h1>
          <p className="text-gray-500 text-sm">
            {data?.client?.industry ? `${data.client.industry} · ` : ""}
            Hiring pipeline, shared searches and candidates from your recruiting firms
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
        <Link href="/client-portal/jobs">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition group">
            <div className="p-2 bg-amber-100 rounded-xl flex-shrink-0">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-amber-900 text-sm">
                {pendingEngagements} recruiting firm{pendingEngagements > 1 ? "s" : ""} waiting to respond
              </p>
              <p className="text-xs text-amber-700">Check your job postings to see firm status</p>
            </div>
            <ArrowRight className="h-5 w-5 text-amber-400 group-hover:translate-x-1 transition-transform shrink-0" />
          </div>
        </Link>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const interactive = !!stat.href || !!stat.onClick;
          const inner = (
            <Card
              className={`border-0 shadow-sm transition-all ${interactive ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" : ""}`}
            >
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
          );
          if (stat.href) {
            return (
              <Link key={stat.label} href={stat.href}>
                {inner}
              </Link>
            );
          }
          if (stat.onClick) {
            return (
              <button
                key={stat.label}
                type="button"
                onClick={stat.onClick}
                className="text-left"
              >
                {inner}
              </button>
            );
          }
          return <div key={stat.label}>{inner}</div>;
        })}
      </div>

      {/* Quick Action / Empty State */}
      {!hasAnyJobs && (
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

      {/* Jobs — unified list of self-posted ClientJobs and agency-managed
          Jobs. A small tag on each card identifies the source ("Posted by
          you" vs "via Firm"); the card body / link target differ but the
          visual layout is consistent so the section reads as one list. */}
      {hasAnyJobs && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Jobs</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {allJobs.length} total
                {hasAgencyJobs && hasJobs ? (
                  <> · {data.jobs.length} posted by you · {data.agencyJobs.length} from your recruiters</>
                ) : hasAgencyJobs ? (
                  <> · {data.agencyJobs.length} from your recruiters</>
                ) : (
                  <> · all posted by you</>
                )}
              </p>
            </div>
            <Link href="/client-portal/jobs/new">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                New Job
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {allJobs.map((job: any) => {
              const isAgency = job._source === "agency";
              const detailHref = isAgency
                ? `/client-portal/candidates?jobId=${job.id}`
                : `/client-portal/jobs/${job.id}`;
              const accepted = job.engagements?.filter((e: any) => e.status === "ACCEPTED").length || 0;
              const pending = job.engagements?.filter((e: any) => e.status === "PENDING").length || 0;
              const total = job.engagements?.length || 0;

              return (
                <Card key={`${job._source}-${job.id}`} className="border-0 shadow-sm hover:shadow-md transition-all group">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Link href={detailHref}>
                            <h3 className="font-semibold text-gray-900 hover:text-emerald-600 transition">
                              {job.title}
                            </h3>
                          </Link>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${
                              job.status === "OPEN" || job.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-700"
                                : job.status === "FILLED"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {job.status}
                          </Badge>
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              isAgency
                                ? "bg-violet-50 text-violet-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {isAgency
                              ? job.firmName
                                ? `via ${job.firmName}`
                                : "via your recruiter"
                              : "Posted by you"}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500 mb-3 flex-wrap">
                          {job.location && <span>{job.location}</span>}
                          {job.jobType && (
                            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">{job.jobType}</span>
                          )}
                          {job.salaryRange && <span>{job.salaryRange}</span>}
                          {job.createdAt && (
                            <span className="text-gray-400">Posted {formatDate(job.createdAt)}</span>
                          )}
                        </div>

                        {isAgency ? (
                          // Agency-managed: highlight the candidate share count
                          // as the actionable signal (review them).
                          <div className="flex items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <Users className="h-3 w-3" />
                              {job.candidatesShared} candidate{job.candidatesShared === 1 ? "" : "s"} shared
                            </span>
                          </div>
                        ) : (
                          // Self-posted: engagement summary + firm badges.
                          <>
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
                          </>
                        )}
                      </div>

                      <Link href={detailHref}>
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
              {contactMatch && (
                <div className="mb-3 flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <UserCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">
                      {contactMatch.name} is already a contact on file
                      {contactMatch.title ? ` (${contactMatch.title})` : ""}.
                    </p>
                    <p className="text-blue-700/80 mt-0.5">
                      We pre-filled their info. Submitting will give them portal access too.
                    </p>
                  </div>
                </div>
              )}
              <form onSubmit={inviteMember} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name *</Label>
                    <Input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="e.g. María López"
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
                {(() => {
                  const items = [
                    { label: "Jobs Posted", value: totalJobs, color: "bg-emerald-500", href: "/client-portal/jobs" as string | undefined, onClick: undefined as undefined | (() => void) },
                    { label: "Firms Engaged", value: activeRecruiters, color: "bg-indigo-500", href: undefined as string | undefined, onClick: activeRecruiters > 0 ? openFirmsDrawer : undefined as undefined | (() => void) },
                    { label: "Candidates Shared", value: totalCandidates, color: "bg-blue-500", href: "/client-portal/candidates" as string | undefined, onClick: undefined as undefined | (() => void) },
                  ];
                  // Max compartido entre las 3 barras — sino valores
                  // iguales rendean anchos distintos (cada item tenia
                  // su propio max calculado distinto). Floor de 10
                  // para que cuando todo es 0 o 1 las barras no se
                  // vean comicamente vacias.
                  const sharedMax = Math.max(10, ...items.map((i) => i.value));
                  return items.map((item) => {
                    const pct = Math.min((item.value / sharedMax) * 100, 100);
                  const interactive = !!item.href || !!item.onClick;
                  const Row = (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className={`text-gray-600 ${interactive ? "group-hover:text-indigo-600" : ""} flex items-center gap-1.5`}>
                          {item.label}
                          {interactive && <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </span>
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
                  const wrapperClass = "group block w-full text-left rounded-md -mx-1.5 px-1.5 py-0.5 hover:bg-indigo-50/40 transition-colors";
                  if (item.href) {
                    return (
                      <Link key={item.label} href={item.href} className={wrapperClass}>
                        {Row}
                      </Link>
                    );
                  }
                  if (item.onClick) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        className={wrapperClass}
                      >
                        {Row}
                      </button>
                    );
                  }
                  return <div key={item.label}>{Row}</div>;
                });
                })()}
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

      <Dialog open={firmsOpen} onOpenChange={setFirmsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-4 w-4 text-indigo-500" />
              Recruiting firms engaged
            </DialogTitle>
            <p className="text-xs text-gray-500 mt-1">
              Firms actively sourcing for your open jobs. Counts include every job and candidate they&apos;ve worked with you on.
            </p>
          </DialogHeader>
          {firmsLoading ? (
            <div className="py-8 space-y-2">
              <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            </div>
          ) : !firms || firms.length === 0 ? (
            <p className="py-8 text-sm text-gray-400 text-center">No firms engaged yet.</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {firms.map((firm) => (
                <div
                  key={firm.organizationId}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                    {firm.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{firm.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {firm.jobsCount} job{firm.jobsCount === 1 ? "" : "s"}
                      {firm.pendingCount > 0 && (
                        <> · <span className="text-amber-600">{firm.pendingCount} pending invite{firm.pendingCount === 1 ? "" : "s"}</span></>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{firm.candidatesShared}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                      candidate{firm.candidatesShared === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Small inline form rendered at the top of the dashboard for stub
// Clients (Google OAuth self-signups, quick-share invites that
// haven't filled in real company info yet). Save → PATCH the new
// /api/client-portal/setup endpoint → reload so the header / every
// other server-rendered surface picks up the curated name.
function StubOnboardingBanner({
  defaultName,
  defaultIndustry,
  onSaved,
}: {
  defaultName: string;
  defaultIndustry: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [industry, setIndustry] = useState(defaultIndustry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/client-portal/setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), industry: industry.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || "Could not save");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-200 rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 bg-emerald-100 rounded-lg shrink-0">
          <Sparkles className="w-5 h-5 text-emerald-700" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-emerald-900">Tell us about your company</p>
          <p className="text-sm text-emerald-800/80 mt-0.5">
            We bootstrapped your workspace from your email domain. Confirm or update the details below so your recruiters see the right company name.
          </p>
        </div>
      </div>
      <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-start">
        <div className="space-y-1">
          <Label className="text-xs">Company name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            required
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Industry</Label>
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Technology"
          />
        </div>
        <Button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-700 md:mt-[22px]"
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
