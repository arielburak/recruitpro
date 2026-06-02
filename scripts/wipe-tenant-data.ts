/**
 * Reusable "wipe all tenant data" script. Used to reset an environment
 * back to a clean slate for QA / general MVP testing without dropping
 * the agency-side identity (Organization + User accounts stay).
 *
 * Scopes:
 *   --scope=work        Candidates, Jobs, Placements, Interviews,
 *                       Submissions, Comments, Documents, Activities,
 *                       Calendar events, PipelineStages, JobAssignments.
 *                       Keeps Client / ClientUser / Contact / OrganizationClient.
 *
 *   --scope=clients     Everything in "work" + Clients, ClientUsers,
 *                       Contacts, ClientJob, FirmEngagement,
 *                       PendingFirmInvite, OrganizationClient,
 *                       ClientPipelineStage, ClientNotification,
 *                       ClientPortalToken, UserInvite (pending invites
 *                       carry candidate-ish emails; safer to drop).
 *
 *   --scope=all         Above + Organization + User + Account
 *                       (NextAuth) + Subscription. After running,
 *                       you have to sign up from scratch.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/wipe-tenant-data.ts \
 *     --scope=clients --yes
 *
 * Without --yes it runs in dry-run mode and just prints counts.
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

type Scope = "work" | "clients" | "all";

function parseArgs() {
  let scope: Scope = "work";
  let yes = false;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--scope=")) {
      const v = arg.slice("--scope=".length);
      if (v !== "work" && v !== "clients" && v !== "all") {
        throw new Error(`Unknown scope: ${v}`);
      }
      scope = v;
    } else if (arg === "--yes") {
      yes = true;
    } else {
      throw new Error(`Unknown arg: ${arg}`);
    }
  }
  return { scope, yes };
}

function maskDbHost(url: string | undefined) {
  if (!url) return "(none)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const { scope, yes } = parseArgs();
  const { prisma } = await import("../lib/prisma");

  console.log("================================================");
  console.log(" Wipe tenant data");
  console.log("================================================");
  console.log(` DB:    ${maskDbHost(process.env.DATABASE_URL)}`);
  console.log(` Scope: ${scope}`);
  console.log(` Mode:  ${yes ? "EXECUTE (--yes)" : "dry-run (counts only)"}`);
  console.log("");

  // Counts before. Useful as a sanity check + as the dry-run output.
  const before = {
    candidates: await prisma.candidate.count(),
    jobs: await prisma.job.count(),
    submissions: await prisma.candidateSubmission.count(),
    placements: await prisma.placement.count(),
    interviews: await prisma.interview.count(),
    comments: await prisma.comment.count(),
    documents: await prisma.document.count(),
    activities: await prisma.activity.count(),
    calendarEvents: await prisma.calendarEvent.count(),
    pipelineStages: await prisma.pipelineStage.count(),
    jobAssignments: await prisma.jobAssignment.count(),
    candidateRatings: await prisma.candidateRating.count(),
    interviewFeedback: await prisma.interviewFeedback.count(),
    interviewAssignments: await prisma.interviewAssignment.count(),
    interviewClientContacts: await prisma.interviewClientContact.count(),
    clients: await prisma.client.count(),
    clientUsers: await prisma.clientUser.count(),
    clientJobs: await prisma.clientJob.count(),
    clientJobMembers: await prisma.clientJobMember.count(),
    clientPipelineStages: await prisma.clientPipelineStage.count(),
    clientNotifications: await prisma.clientNotification.count(),
    clientPortalTokens: await prisma.clientPortalToken.count(),
    contacts: await prisma.contact.count(),
    organizationClients: await prisma.organizationClient.count(),
    firmEngagements: await prisma.firmEngagement.count(),
    pendingFirmInvites: await prisma.pendingFirmInvite.count(),
    userInvites: await prisma.userInvite.count(),
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    subscriptions: await prisma.subscription.count(),
  };
  console.log("Row counts before:");
  for (const [k, v] of Object.entries(before)) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
  console.log("");

  if (!yes) {
    console.log("Dry-run only. Re-run with --yes to actually wipe.");
    await prisma.$disconnect();
    return;
  }

  // Delete order matters: children first, then parents. Each block
  // covers one scope step so widening the scope just appends another
  // block at the end.

  // ----- WORK -----
  console.log("Deleting work data...");
  // Calendar events reference job/candidate/client via SetNull, but
  // they live inside the same agency tenant so we drop them too.
  await prisma.calendarEvent.deleteMany({});
  await prisma.interviewFeedback.deleteMany({});
  await prisma.interviewClientContact.deleteMany({});
  await prisma.interviewAssignment.deleteMany({});
  await prisma.interview.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.candidateRating.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.placement.deleteMany({});
  await prisma.candidateSubmission.deleteMany({});
  await prisma.pipelineStage.deleteMany({});
  await prisma.jobAssignment.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.candidate.deleteMany({});

  if (scope === "work") {
    await printAfter(prisma, before, scope);
    await prisma.$disconnect();
    return;
  }

  // ----- CLIENTS -----
  console.log("Deleting client data...");
  await prisma.pendingFirmInvite.deleteMany({});
  await prisma.firmEngagement.deleteMany({});
  await prisma.clientJobMember.deleteMany({});
  await prisma.clientJob.deleteMany({});
  await prisma.clientNotification.deleteMany({});
  await prisma.clientPortalToken.deleteMany({});
  await prisma.clientUser.deleteMany({});
  await prisma.clientPipelineStage.deleteMany({});
  await prisma.organizationClient.deleteMany({});
  // Contacts are agency-tracked hiring managers; PII (email/phone).
  await prisma.contact.deleteMany({});
  await prisma.client.deleteMany({});
  // Pending UserInvites carry email addresses of people who never
  // joined — wipe them as part of "no contact data left behind".
  await prisma.userInvite.deleteMany({});

  if (scope === "clients") {
    await printAfter(prisma, before, scope);
    await prisma.$disconnect();
    return;
  }

  // ----- ALL -----
  console.log("Deleting org + user identity...");
  await prisma.subscription.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.userNotification.deleteMany({});
  await prisma.userIntegration.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  await printAfter(prisma, before, scope);
  await prisma.$disconnect();
}

async function printAfter(prisma: any, before: Record<string, number>, scope: Scope) {
  const after: Record<string, number> = {};
  for (const k of Object.keys(before)) {
    after[k] = await (prisma as any)[modelFromCountKey(k)].count();
  }
  console.log("");
  console.log("Row counts after:");
  for (const k of Object.keys(before)) {
    const b = before[k];
    const a = after[k];
    const delta = a - b;
    console.log(`  ${k.padEnd(28)} ${String(a).padStart(6)} (was ${b}, ${delta >= 0 ? "+" : ""}${delta})`);
  }
  console.log("");
  console.log(`Wipe (--scope=${scope}) complete.`);
}

// Map of our before/after keys back to prisma client model names.
// We declare it once here so the loop above can be data-driven.
function modelFromCountKey(k: string): string {
  const map: Record<string, string> = {
    candidates: "candidate",
    jobs: "job",
    submissions: "candidateSubmission",
    placements: "placement",
    interviews: "interview",
    comments: "comment",
    documents: "document",
    activities: "activity",
    calendarEvents: "calendarEvent",
    pipelineStages: "pipelineStage",
    jobAssignments: "jobAssignment",
    candidateRatings: "candidateRating",
    interviewFeedback: "interviewFeedback",
    interviewAssignments: "interviewAssignment",
    interviewClientContacts: "interviewClientContact",
    clients: "client",
    clientUsers: "clientUser",
    clientJobs: "clientJob",
    clientJobMembers: "clientJobMember",
    clientPipelineStages: "clientPipelineStage",
    clientNotifications: "clientNotification",
    clientPortalTokens: "clientPortalToken",
    contacts: "contact",
    organizationClients: "organizationClient",
    firmEngagements: "firmEngagement",
    pendingFirmInvites: "pendingFirmInvite",
    userInvites: "userInvite",
    organizations: "organization",
    users: "user",
    subscriptions: "subscription",
  };
  const m = map[k];
  if (!m) throw new Error(`No model mapping for ${k}`);
  return m;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
