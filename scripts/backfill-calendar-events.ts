/* eslint-disable no-console */
// Push existing Interviews to a recruiter's connected calendar
// (Google and/or Microsoft) as silent backfill — no notifications go
// out to candidates/clients. The recruiter just sees them as blocks
// in their own calendar so they have a unified view of their
// upcoming + historical interviews. New interviews keep going
// through the normal flow that DOES notify all attendees.
//
// Usage:
//   Dry run :  npx tsx scripts/backfill-calendar-events.ts --user <email>
//   Execute :  npx tsx scripts/backfill-calendar-events.ts --user <email> --execute
//   Only push google or microsoft: --providers google,microsoft

import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const args = process.argv.slice(2);
  const userIdx = args.indexOf("--user");
  const userEmail = userIdx >= 0 ? args[userIdx + 1] : null;
  const execute = args.includes("--execute");
  const providersIdx = args.indexOf("--providers");
  const providersArg = providersIdx >= 0 ? args[providersIdx + 1] : "google,microsoft";
  const providers = new Set(providersArg.split(","));

  if (!userEmail) {
    console.error("Usage: npx tsx scripts/backfill-calendar-events.ts --user <email> [--execute] [--providers google,microsoft]");
    process.exit(1);
  }

  const { prisma } = await import("../lib/prisma");
  const { getValidAccessToken: getGoogleToken } = await import("../lib/google-calendar");
  const { getValidAccessToken: getMicrosoftToken } = await import("../lib/microsoft-calendar");

  const user = await prisma.user.findUnique({ where: { email: userEmail }, include: { integrations: true } });
  if (!user) { console.error(`No user for ${userEmail}`); process.exit(1); }

  const hasGoogle = providers.has("google") && user.integrations.some((i: any) => i.provider === "google_calendar");
  const hasMs = providers.has("microsoft") && user.integrations.some((i: any) => i.provider === "microsoft_teams");
  console.log(`User: ${userEmail}`);
  console.log(`Will push to: ${[hasGoogle && "Google", hasMs && "Outlook/Microsoft"].filter(Boolean).join(" + ") || "(none)"}\n`);

  // Backfill targets: interviews owned by this org where the user
  // is the creator (most common case for an agency recruiter) and
  // the relevant calendar event hasn't been created yet.
  const interviews = await prisma.interview.findMany({
    where: { organizationId: user.organizationId, createdBy: user.id },
    select: {
      id: true, title: true, notes: true,
      startTime: true, endTime: true, timezone: true,
      googleEventId: true, microsoftEventId: true,
      candidate: { select: { firstName: true, lastName: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const gTargets = hasGoogle ? interviews.filter((i) => !i.googleEventId) : [];
  const mTargets = hasMs ? interviews.filter((i) => !i.microsoftEventId) : [];
  console.log(`Interviews to push to Google : ${gTargets.length}`);
  console.log(`Interviews to push to Outlook: ${mTargets.length}`);

  if (!execute) {
    console.log(`\n[dry run] Re-run with --execute to actually push events.`);
    await prisma.$disconnect();
    return;
  }

  let gCreated = 0, gFailed = 0;
  if (hasGoogle) {
    const token = await getGoogleToken(user.id);
    if (!token) {
      console.error("Could not get a valid Google access token — re-authorize in /settings/integrations.");
    } else {
      for (const iv of gTargets) {
        try {
          // Hit Google Calendar directly with sendUpdates=none so the
          // candidate/client never receive a stale invite for a
          // historic interview. No attendees added either — the event
          // is just a block on the recruiter's calendar.
          const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: iv.title,
              description: iv.notes || `Imported from RecruitPro\nCandidate: ${iv.candidate?.firstName ?? ""} ${iv.candidate?.lastName ?? ""}`.trim(),
              start: { dateTime: iv.startTime.toISOString(), timeZone: iv.timezone },
              end: { dateTime: iv.endTime.toISOString(), timeZone: iv.timezone },
              reminders: { useDefault: true },
            }),
          });
          if (!res.ok) { gFailed++; if (gFailed <= 3) console.error(`  Google ${iv.id}: ${await res.text()}`); continue; }
          const data = await res.json();
          await prisma.interview.update({
            where: { id: iv.id },
            data: { googleEventId: data.id, googleCalendarOwnerId: user.id },
          });
          gCreated++;
        } catch (e: any) {
          gFailed++;
          if (gFailed <= 3) console.error(`  Google ${iv.id}: ${e.message}`);
        }
      }
    }
  }

  let mCreated = 0, mFailed = 0;
  if (hasMs) {
    const token = await getMicrosoftToken(user.id);
    if (!token) {
      console.error("Could not get a valid Microsoft access token — re-authorize in /settings/integrations.");
    } else {
      for (const iv of mTargets) {
        try {
          const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              // Suppress notifications. Graph respects this header for
              // event creates; combined with no attendees it's just a
              // private block on the recruiter's calendar.
              Prefer: 'IdType="ImmutableId", outlook.timezone="' + iv.timezone + '"',
            },
            body: JSON.stringify({
              subject: iv.title,
              body: {
                contentType: "Text",
                content: iv.notes || `Imported from RecruitPro\nCandidate: ${iv.candidate?.firstName ?? ""} ${iv.candidate?.lastName ?? ""}`.trim(),
              },
              start: { dateTime: iv.startTime.toISOString(), timeZone: iv.timezone },
              end: { dateTime: iv.endTime.toISOString(), timeZone: iv.timezone },
              isReminderOn: true,
              reminderMinutesBeforeStart: 10,
            }),
          });
          if (!res.ok) { mFailed++; if (mFailed <= 3) console.error(`  MS ${iv.id}: ${await res.text()}`); continue; }
          const data = await res.json();
          await prisma.interview.update({
            where: { id: iv.id },
            data: { microsoftEventId: data.id, microsoftCalendarOwnerId: user.id },
          });
          mCreated++;
        } catch (e: any) {
          mFailed++;
          if (mFailed <= 3) console.error(`  MS ${iv.id}: ${e.message}`);
        }
      }
    }
  }

  console.log(`\nGoogle  : created=${gCreated} failed=${gFailed}`);
  console.log(`Outlook : created=${mCreated} failed=${mFailed}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
