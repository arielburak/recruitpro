import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Briefcase,
  Users,
  CheckCircle,
  ArrowRight,
  Inbox,
  Building2,
  UserPlus,
  Sparkles,
  MessageSquare,
  Star,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Zap,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Upload,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import {
  PipelineChart,
  ActivityTrendChart,
  SourceBreakdownChart,
  JobStatusChart,
  RecruiterLeaderboard,
} from "@/components/dashboard-charts";
import { RecruiterPerformance } from "@/components/dashboard/recruiter-performance";
import { PipelineDistribution } from "@/components/dashboard/pipeline-distribution";
import { MigrateBanner, MigrateBannerStatic } from "@/components/dashboard/migrate-banner";

// Force dynamic rendering. The page already depends on getServerSession
// + prisma so Next.js auto-detects this, but stating it explicitly
// prevents an accidental static-render upstream from quietly caching
// a snapshot of the dashboard across deploys (we hit exactly that
// pattern while debugging the migration banner: browser kept serving
// a stale HTML from before the banner was added).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;

  if (!orgId) return null;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Org age drives the first-week migration banner (see MigrateBanner).
  // We fetch this outside the Promise.all so the banner can render
  // even if any of the dashboard stat queries fail — it's a hint, not
  // a hard dependency.
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { createdAt: true },
  });
  const daysSinceSignup = org
    ? Math.floor((now.getTime() - new Date(org.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;
  const isWithinFirstWeek = daysSinceSignup <= 7;

  const [
    activeJobs,
    totalCandidates,
    placements,
    totalClients,
    recentActivities,
    recentFeedback,
    pendingEngagements,
    // New queries for charts
    candidatesThisMonth,
    candidatesLastMonth,
    placementsThisMonth,
    placementsLastMonth,
    pipelineData,
    activityByDay,
    candidatesBySource,
    jobsByStatus,
    recruiterStats,
    recentSubmissions,
  ] = await Promise.all([
    prisma.job.count({
      where: { organizationId: orgId, status: { in: ["OPEN", "ACTIVE"] } },
    }),
    prisma.candidate.count({ where: { organizationId: orgId } }),
    prisma.candidateSubmission.count({
      where: {
        job: { organizationId: orgId },
        stage: { name: "Placed" },
      },
    }),
    // Shared-Client model (PR #139): a Client now belongs to many
    // agencies via OrganizationClient. The dashboard's "Clients"
    // count is meant to be "clients THIS firm is engaged with",
    // not "every Client row in the DB" — that's why an agency with
    // 11 engaged clients was seeing 338 (the global pool).
    prisma.organizationClient.count({ where: { organizationId: orgId } }),
    prisma.activity.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.comment.findMany({
      where: {
        type: "CLIENT_VISIBLE",
        submission: { job: { organizationId: orgId } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        clientUser: { select: { name: true } },
        user: { select: { name: true } },
        submission: {
          select: {
            candidate: { select: { id: true, firstName: true, lastName: true } },
            job: { select: { title: true, id: true } },
          },
        },
      },
    }),
    prisma.firmEngagement.count({
      where: { organizationId: orgId, status: "PENDING" },
    }),
    // Candidates added this month
    prisma.candidate.count({
      where: { organizationId: orgId, createdAt: { gte: thirtyDaysAgo } },
    }),
    // Candidates added last month
    prisma.candidate.count({
      where: { organizationId: orgId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
    }),
    // Placements this month
    prisma.candidateSubmission.count({
      where: {
        job: { organizationId: orgId },
        stage: { name: "Placed" },
        updatedAt: { gte: thirtyDaysAgo },
      },
    }),
    // Placements last month
    prisma.candidateSubmission.count({
      where: {
        job: { organizationId: orgId },
        stage: { name: "Placed" },
        updatedAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
    }),
    // Pipeline stage distribution (all active jobs)
    prisma.pipelineStage.findMany({
      where: { job: { organizationId: orgId, status: { in: ["OPEN", "ACTIVE"] } } },
      include: { _count: { select: { submissions: true } } },
      orderBy: { order: "asc" },
    }),
    // Activity count by day (last 14 days)
    prisma.activity.findMany({
      where: { organizationId: orgId, createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
      select: { createdAt: true },
    }),
    // Candidate sources
    prisma.candidate.findMany({
      where: { organizationId: orgId, source: { not: null } },
      select: { source: true },
    }),
    // Jobs by status
    prisma.job.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: { id: true },
    }),
    // Recruiter leaderboard. We pull every active user so we can join
    // a separate "placements per recruiter" aggregate below — `_count`
    // can't reach across the submission → candidate.owner relation in
    // a single query, so the placement count is wired in after the
    // fetch.
    prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        _count: { select: { candidates: true, submissions: true } },
      },
      orderBy: { candidates: { _count: "desc" } },
      take: 5,
    }),
    // Recent submissions
    prisma.candidateSubmission.findMany({
      where: { job: { organizationId: orgId } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        candidate: { select: { firstName: true, lastName: true, id: true } },
        job: { select: { title: true, id: true } },
        stage: { select: { name: true, color: true } },
      },
    }),
  ]);

  // Aggregate pipeline data by stage name
  const pipelineAgg = new Map<string, number>();
  for (const stage of pipelineData) {
    pipelineAgg.set(stage.name, (pipelineAgg.get(stage.name) || 0) + stage._count.submissions);
  }
  const pipelineChartData = Array.from(pipelineAgg.entries()).map(([name, count]) => ({ name, count }));

  // Aggregate activity by day
  const dayMap = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dayMap.set(key, 0);
  }
  for (const a of activityByDay) {
    const key = new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) || 0) + 1);
  }
  const activityTrendData = Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));

  // Aggregate sources
  const sourceMap = new Map<string, number>();
  for (const c of candidatesBySource) {
    const src = c.source || "Unknown";
    sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
  }
  const sourceChartData = Array.from(sourceMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Job status chart data
  const jobStatusData = jobsByStatus.map((j) => ({ status: j.status, count: j._count.id }));

  // Recruiter leaderboard
  // Placements attributed to each recruiter via the placed candidate's
  // owner. groupBy on Placement directly can't traverse through the
  // submission → candidate join, so we pull the placements and bucket
  // by candidate.ownerId in JS — cheap given the volume.
  const placementsWithOwner = await prisma.placement.findMany({
    where: { organizationId: orgId },
    select: {
      submission: { select: { candidate: { select: { ownerId: true } } } },
    },
  });
  const placementsByRecruiter = new Map<string, number>();
  for (const p of placementsWithOwner) {
    const ownerId = p.submission?.candidate?.ownerId;
    if (!ownerId) continue;
    placementsByRecruiter.set(ownerId, (placementsByRecruiter.get(ownerId) || 0) + 1);
  }

  const recruiterData = recruiterStats.map((r) => ({
    name: r.name,
    candidates: r._count.candidates,
    submissions: r._count.submissions,
    placements: placementsByRecruiter.get(r.id) || 0,
  }));

  const isNewUser = totalCandidates === 0 && activeJobs === 0 && totalClients === 0;

  // Trend calculation policy: only show a MoM % when both windows
  // have enough events to make the ratio meaningful. With ≥ 3 events
  // in BOTH the current and prior 30-day windows the % is real signal;
  // anything below that is noise from sparse data, test churn, or
  // "we just launched and there's no history yet." Returning null
  // tells the card to render the absolute number alone — cleaner than
  // a misleading "+100% / -73%" pulled from a tiny sample.
  function meaningfulTrend(current: number, prior: number): number | null {
    const MIN_SAMPLE = 3;
    if (current < MIN_SAMPLE || prior < MIN_SAMPLE) return null;
    return Math.round(((current - prior) / prior) * 100);
  }
  const candidateTrend = meaningfulTrend(candidatesThisMonth, candidatesLastMonth);
  const placementTrend = meaningfulTrend(placementsThisMonth, placementsLastMonth);

  const totalInPipeline = pipelineChartData.reduce((sum, d) => sum + d.count, 0);

  const stats = [
    {
      label: "Active Searches",
      value: activeJobs,
      icon: Briefcase,
      gradient: "from-blue-500 to-blue-600",
      lightBg: "bg-blue-50",
      lightColor: "text-blue-600",
      href: "/jobs",
    },
    {
      label: "Total Candidates",
      value: totalCandidates,
      icon: Users,
      gradient: "from-indigo-500 to-violet-600",
      lightBg: "bg-indigo-50",
      lightColor: "text-indigo-600",
      trend: candidateTrend,
      trendLabel: "vs last 30d",
      href: "/candidates",
    },
    {
      label: "In Pipeline",
      value: totalInPipeline,
      icon: Target,
      gradient: "from-violet-500 to-purple-600",
      lightBg: "bg-violet-50",
      lightColor: "text-violet-600",
      href: "/jobs",
    },
    {
      label: "Placements",
      value: placements,
      icon: CheckCircle,
      gradient: "from-emerald-500 to-green-600",
      lightBg: "bg-emerald-50",
      lightColor: "text-emerald-600",
      trend: placementTrend,
      trendLabel: "vs last 30d",
      href: "/placements",
    },
    {
      label: "Clients",
      value: totalClients,
      icon: Building2,
      gradient: "from-amber-500 to-orange-600",
      lightBg: "bg-amber-50",
      lightColor: "text-amber-600",
      href: "/clients",
    },
  ];

  const quickStartSteps = [
    {
      icon: Building2,
      title: "Add your first client",
      desc: "Set up a hiring company you recruit for",
      href: "/clients/new",
      done: totalClients > 0,
    },
    {
      icon: Briefcase,
      title: "Create a job order",
      desc: "Open a search with a customizable pipeline",
      href: "/jobs/new",
      done: activeJobs > 0,
    },
    {
      icon: UserPlus,
      title: "Add candidates",
      desc: "Start building your talent database",
      href: "/candidates/new",
      done: totalCandidates > 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-gray-500">
            Welcome back, {session?.user?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/candidates/new">
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm">
              <UserPlus className="h-4 w-4" />
              Add Candidate
            </button>
          </Link>
          <Link href="/jobs/new">
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition shadow-sm">
              <Briefcase className="h-4 w-4" />
              New Job
            </button>
          </Link>
        </div>
      </div>

      {/* Pending Engagements Banner */}
      {pendingEngagements > 0 && (
        <Link href="/engagements">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between hover:shadow-md transition group">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-xl">
                <Inbox className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-amber-900">
                  {pendingEngagements} new engagement request{pendingEngagements > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-700">
                  Hiring companies want to work with you
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-amber-400 group-hover:translate-x-1 transition-transform" />
          </div>
        </Link>
      )}

      {/* Welcome Banner for New Users */}
      {isNewUser && (
        <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-1">Welcome to Recruiting ATS!</h2>
              <p className="text-indigo-100 text-sm">
                Your workspace is ready. Follow these steps to get started.
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            {quickStartSteps.map((step, i) => (
              <Link
                key={step.title}
                href={step.href}
                className={`flex items-start gap-3 p-4 rounded-xl transition ${
                  step.done ? "bg-white/10 opacity-60" : "bg-white/15 hover:bg-white/25"
                }`}
              >
                <div className="p-2 bg-white/20 rounded-lg shrink-0">
                  <step.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold opacity-60">STEP {i + 1}</span>
                    {step.done && <CheckCircle className="w-3.5 h-3.5 text-green-300" />}
                  </div>
                  <p className="font-semibold text-sm mt-0.5">{step.title}</p>
                  <p className="text-xs text-indigo-200 mt-0.5">{step.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 opacity-50 shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* First-week migration nudge. Day-0 is inlined as plain JSX
          here (no client component, no localStorage) so it ships in
          the initial HTML and can't be hidden by any client-side
          path. Day 1+ keeps using the dismissable Client Component. */}
      {isWithinFirstWeek && daysSinceSignup <= 0 && (
        <div className="bg-gradient-to-r from-cyan-50 via-sky-50 to-indigo-50 border border-sky-200 rounded-2xl p-5">
          <div className="flex items-start gap-4 pr-6">
            <div className="p-2.5 bg-sky-100 rounded-xl shrink-0">
              <Upload className="w-5 h-5 text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sky-900">Coming from another ATS?</p>
              <p className="text-sm text-sky-800/80 mt-0.5">
                Bring your candidates, clients, and open searches over in one shot — CSV or TSV from Bullhorn,
                JobAdder, Loxo, Crelate, or wherever you live today. The mapping wizard handles renamed columns.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <Link
                  href="/import"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Start importing
                  <ArrowRight className="h-3 w-3" />
                </Link>
                <span className="text-[11px] text-sky-700/70">
                  Your first day — 7 days left
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      {isWithinFirstWeek && daysSinceSignup > 0 && (
        <MigrateBanner daysSinceSignup={daysSinceSignup} orgId={orgId} />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:shadow-md transition-all group cursor-pointer border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-sm`}>
                    <stat.icon className="h-4 w-4 text-white" />
                  </div>
                  {/* trend === null is the explicit "not enough sample
                      to draw a meaningful % from" signal — render
                      nothing. trend === 0 is "flat exactly" which is
                      also worth hiding (a 0% chip is visual noise). */}
                  {"trend" in stat && stat.trend !== undefined && stat.trend !== null && stat.trend !== 0 && (
                    <div className={`flex items-center gap-0.5 text-xs font-medium ${
                      stat.trend > 0 ? "text-emerald-600" : "text-red-500"
                    }`}>
                      {stat.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {stat.trend > 0 ? "+" : ""}{stat.trend}%
                    </div>
                  )}
                </div>
                <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recruiter performance — surfaces here right under the stat
          strip so the metrics that drive comp / reviews are the
          first thing a sales-ops lead sees. Self-contained client
          widget so its filters (date range, recruiter picker,
          compare-vs-prior) re-fetch independently of the SSR shell. */}
      <RecruiterPerformance />

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Distribution — client-side so the date range
            picker can re-aggregate without re-running the SSR
            dashboard. Uses the shared DateRangePicker so the
            "time" semantics match the Recruiter Performance widget
            above. */}
        <PipelineDistribution />

        {/* Activity Trend */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-indigo-500" />
              Activity (Last 14 Days)
            </CardTitle>
            <p className="text-xs text-gray-400">Daily team activity across all actions</p>
          </CardHeader>
          <CardContent>
            <ActivityTrendChart data={activityTrendData} />
          </CardContent>
        </Card>
      </div>

      {/* Secondary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Candidate Sources */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChartIcon className="h-4 w-4 text-violet-500" />
              Candidate Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SourceBreakdownChart data={sourceChartData} />
          </CardContent>
        </Card>

        {/* Job Status */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-blue-500" />
              Jobs by Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JobStatusChart data={jobStatusData} />
          </CardContent>
        </Card>

        {/* Recruiter Leaderboard */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-amber-500" />
              Top Recruiters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecruiterLeaderboard data={recruiterData} />
          </CardContent>
        </Card>
      </div>

      {/* Per-recruiter performance, scoped to a picked time range.
          Renders client-side so the period filter is interactive
          without re-running the whole server-side dashboard query. */}
      <RecruiterPerformance />

      {/* Bottom Row: Recent Submissions + Activity + Feedback */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Submissions */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-violet-500" />
              Recent Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentSubmissions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No submissions yet</p>
            ) : (
              <div className="space-y-3">
                {recentSubmissions.map((sub: any) => (
                  <div key={sub.id} className="flex items-center gap-3">
                    <div
                      className="w-2 h-8 rounded-full flex-shrink-0"
                      style={{ backgroundColor: sub.stage.color || "#6366f1" }}
                    />
                    <div className="flex-1 min-w-0">
                      <Link href={`/candidates/${sub.candidate.id}`} className="text-sm font-medium text-gray-900 hover:text-indigo-600 truncate block">
                        {sub.candidate.firstName} {sub.candidate.lastName}
                      </Link>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Link href={`/jobs/${sub.job.id}`} className="hover:text-indigo-600 truncate">
                          {sub.job.title}
                        </Link>
                        <span className="text-gray-300">&middot;</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                          {sub.stage.name}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                      {formatDate(sub.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-gray-500" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activity yet</p>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 text-xs leading-relaxed">{activity.description}</p>
                      <p className="text-gray-400 text-[10px] mt-0.5">
                        {activity.user?.name} &middot; {formatDate(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client Feedback */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-emerald-500" />
              Client Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentFeedback.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No client feedback yet</p>
            ) : (
              <div className="space-y-3">
                {recentFeedback.map((fb: any) => {
                  let displayContent = fb.content;
                  let rating = null;
                  let clientName = fb.clientUser?.name || fb.user?.name || "Client";
                  try {
                    const parsed = JSON.parse(fb.content);
                    if (parsed && typeof parsed === "object") {
                      displayContent = parsed.text || "";
                      rating = parsed.rating;
                      if (parsed.clientName) clientName = parsed.clientName;
                    }
                  } catch {}

                  return (
                    <div key={fb.id} className="flex items-start gap-2.5 text-sm">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-xs text-emerald-700">{clientName}</span>
                          {rating && (
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <Star
                                  key={n}
                                  className={`h-2.5 w-2.5 ${n <= rating ? "text-yellow-500 fill-yellow-500" : "text-gray-200"}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        {displayContent && (
                          <p className="text-gray-600 text-xs mt-0.5 line-clamp-2">{displayContent}</p>
                        )}
                        {fb.submission && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            on{" "}
                            <Link href={`/candidates/${fb.submission.candidate.id}`} className="text-indigo-600 hover:underline">
                              {fb.submission.candidate.firstName} {fb.submission.candidate.lastName}
                            </Link>
                            {" "}for{" "}
                            <Link href={`/jobs/${fb.submission.job.id}`} className="text-indigo-600 hover:underline">
                              {fb.submission.job.title}
                            </Link>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
