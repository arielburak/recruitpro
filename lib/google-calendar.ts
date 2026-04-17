import { prisma } from "./prisma";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

// Scopes needed for Calendar + Meet
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/**
 * Build the Google OAuth URL for Calendar integration
 */
export function getGoogleCalendarAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    // "select_account" forces the Google account picker even if the user
    // is already signed into Google, so switching accounts per-user works
    // correctly. "consent" ensures we always get a refresh_token back.
    prompt: "select_account consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  }>;
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh Google token");
  }

  return res.json();
}

/**
 * Get a valid access token for a user, refreshing if needed
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const integration = await (prisma as any).userIntegration.findUnique({
    where: { userId_provider: { userId, provider: "google_calendar" } },
  });

  if (!integration) return null;

  // Check if token is expired (with 5 min buffer)
  const now = new Date();
  const buffer = 5 * 60 * 1000;
  if (integration.expiresAt && integration.expiresAt.getTime() - buffer > now.getTime()) {
    return integration.accessToken;
  }

  // Token expired - refresh it
  if (!integration.refreshToken) return null;

  try {
    const refreshed = await refreshAccessToken(integration.refreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    await (prisma as any).userIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: refreshed.access_token,
        expiresAt: newExpiresAt,
      },
    });

    return refreshed.access_token;
  } catch {
    console.error("[google-calendar] Failed to refresh token for user", userId);
    return null;
  }
}

/**
 * Get the connected email for the Google Calendar integration
 */
export async function getGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

/**
 * Create a Google Calendar event with Google Meet
 */
export async function createGoogleCalendarEvent({
  accessToken,
  summary,
  description,
  startTime,
  endTime,
  timezone,
  attendees,
}: {
  accessToken: string;
  summary: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  timezone: string;
  attendees: { email: string; displayName?: string }[];
}): Promise<{
  eventId: string;
  meetLink: string;
  htmlLink: string;
}> {
  const event = {
    summary,
    description,
    start: {
      dateTime: startTime,
      timeZone: timezone,
    },
    end: {
      dateTime: endTime,
      timeZone: timezone,
    },
    attendees: attendees.map((a) => ({
      email: a.email,
      displayName: a.displayName,
    })),
    conferenceData: {
      createRequest: {
        requestId: `ats-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 30 },
        { method: "popup", minutes: 10 },
      ],
    },
  };

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("[google-calendar] Create event failed:", errText);
    throw new Error(`Failed to create Google Calendar event: ${res.status}`);
  }

  const data = await res.json();

  return {
    eventId: data.id,
    meetLink: data.conferenceData?.entryPoints?.find(
      (e: any) => e.entryPointType === "video"
    )?.uri || data.hangoutLink || "",
    htmlLink: data.htmlLink,
  };
}

/**
 * Add an attendee to an existing Google Calendar event. Keeps all
 * existing attendees in place so we don't accidentally remove the old
 * email — we let Google's sendUpdates=all handle notifying the new one.
 *
 * Returns true on success, false if the event/owner isn't reachable.
 */
export async function addAttendeeToGoogleEvent({
  accessToken,
  eventId,
  newAttendee,
}: {
  accessToken: string;
  eventId: string;
  newAttendee: { email: string; displayName?: string };
}): Promise<boolean> {
  try {
    // Fetch existing attendees first so we don't overwrite them
    const getRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!getRes.ok) {
      console.error(
        "[google-calendar] Failed to fetch event",
        eventId,
        "status",
        getRes.status
      );
      return false;
    }

    const event = await getRes.json();
    const existing: { email: string; displayName?: string }[] = Array.isArray(event.attendees)
      ? event.attendees
      : [];

    // Avoid duplicates (case-insensitive)
    const lower = newAttendee.email.toLowerCase();
    if (existing.some((a) => a.email?.toLowerCase() === lower)) {
      return true;
    }

    const updatedAttendees = [
      ...existing.map((a) => ({ email: a.email, displayName: a.displayName })),
      { email: newAttendee.email, displayName: newAttendee.displayName },
    ];

    const patchRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attendees: updatedAttendees }),
      }
    );

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error("[google-calendar] PATCH attendees failed:", errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[google-calendar] addAttendeeToGoogleEvent error:", err);
    return false;
  }
}
