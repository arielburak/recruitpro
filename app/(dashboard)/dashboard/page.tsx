import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Briefcase,
  Users,
  CheckCircle,
  ArrowRight,
  Building2,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;

  if (!orgId) return null;

  const [activeJobs, totalCandidates, placements, totalClients, recentActivities] =
    await Promise.all([
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
      prisma.client.count({ where: { organizationId: orgId } }),
      prisma.activity.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { user: { select: { name: true } } },
      }),
    ]);

  const isNewUser = totalCandidates === 0 && activeJobs === 0 && totalClients === 0;

  const stats = [
    {
      label: "Active Searches",
      value: activeJobs,
      icon: Briefcase,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Total Candidates",
      value: totalCandidates,
      icon: Users,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
    },
    {
      label: "Placements",
      value: placements,
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  const quickStartSteps = [
    {
      icon: Building2,
      title: "Add your first client",
      desc: "Set up a hiring company you recruit for",
      href: "/clients/new",
      color: "bg-blue-50 text-blue-600",
      done: totalClients > 0,
    },
    {
      icon: Briefcase,
      title: "Create a job order",
      desc: "Open a search with a customizable pipeline",
      href: "/jobs/new",
      color: "bg-violet-50 text-violet-600",
      done: activeJobs > 0,
    },
    {
      icon: UserPlus,
      title: "Add candidates",
      desc: "Start building your talent database",
      href: "/candidates/new",
      color: "bg-emerald-50 text-emerald-600",
      done: totalCandidates > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500">
          Welcome back, {session?.user?.name}
        </p>
      </div>

      {isNewUser && (
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-1">
                Welcome to RecruitPro!
              </h2>
              <p className="text-indigo-100 text-sm">
                Your workspace is ready. Follow these steps to get started
                with your first search.
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            {quickStartSteps.map((step, i) => (
              <Link
                key={step.title}
                href={step.href}
                className={`flex items-start gap-3 p-4 rounded-xl transition ${
                  step.done
                    ? "bg-white/10 opacity-60"
                    : "bg-white/15 hover:bg-white/25"
                }`}
              >
                <div className="p-2 bg-white/20 rounded-lg shrink-0">
                  <step.icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold opacity-60">
                      STEP {i + 1}
                    </span>
                    {step.done && (
                      <CheckCircle className="w-3.5 h-3.5 text-green-300" />
                    )}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivities.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">
                No activity yet. Start by adding a client, creating a job,
                or adding candidates.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 text-sm"
                >
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-gray-700">{activity.description}</p>
                    <p className="text-gray-400 text-xs">
                      {activity.user?.name} &middot;{" "}
                      {formatDate(activity.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
