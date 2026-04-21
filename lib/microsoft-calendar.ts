import { prisma } from "./prisma";

// Reuses the same Azure AD app registration as NextAuth sign-in. The app
// just needs these delegated Graph scopes added and the
// /api/integrations/microsoft/callback URI added as a redirect URI.
const AZURE_CLIENT_ID = process.env.AZURE_AD_CLIENT_ID!;
const AZURE_CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET!;
const AZURE_TENANT = "common"; // supports work/school AND personal accounts

// Scopes needed for Outlook Calendar + Teams online meetings
const SCOPES = [
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
  "OnlineMeetings.ReadWrite",
].join(" ");

const AUTH_BASE = `https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0`;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Build the Microsoft OAuth URL for Calendar + Teams integration.
 */
export function getMicrosoftCalendarAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPES,
    // select_account forces the Microsoft account picker so the user can
    // explicitly pick which account to link (important if they have
    // personal + work accounts signed in).
    prompt: "select_account",
    state,
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeMicrosoftCode(code: string, redirectUri: string) {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft token exchange failed: ${err}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  }>;
}

/**
 * Refresh an expired access token.
 */
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh Microsoft token");
  }

  return res.json();
}

/**
 * Get a valid access token for a user, refreshing if needed.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const integration = await (prisma as any).userIntegration.findUnique({
    where: { userId_provider: { userId, provider: "microsoft_teams" } },
  });

  if (!integration) return null;

  const now = new Date();
  const buffer = 5 * 60 * 1000;
  if (integration.expiresAt && integration.expiresAt.getTime() - buffer > now.getTime()) {
    return integration.accessToken;
  }

  if (!integration.refreshToken) return null;

  try {
    const refreshed = await refreshAccessToken(integration.refreshToken);
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

    await (prisma as any).userIntegration.update({
      where: { id: integration.id },
      data: {
        accessToken: refreshed.access_token,
        // Microsoft rotates refresh tokens — persist the new one when provided
        refreshToken: refreshed.refresh_token || integration.refreshToken,
        expiresAt: newExpiresAt,
      },
    });

    return refreshed.access_token;
  } catch {
    console.error("[microsoft-calendar] Failed to refresh token for user", userId);
    return null;
  }
}

/**
 * Get the connected Microsoft account email (UPN).
 */
export async function getMicrosoftEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.mail || data.userPrincipalName || null;
  } catch {
    return null;
  }
}

/**
 * Create an Outlook Calendar event with a Microsoft Teams online meeting
 * attached. Returns the event id, Teams join URL, and the web link to the
 * event on outlook.office.com.
 */
export async function createMicrosoftCalendarEvent({
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
  timezone: string;  // IANA timezone (Graph accepts it directly)
  attendees: { email: string; displayName?: string }[];
}): Promise<{
  eventId: string;
  meetLink: string;
  htmlLink: string;
}> {
  const event = {
    subject: summary,
    body: {
      contentType: "HTML",
      content: description
        ? description.replace(/\n/g, "<br/>")
        : "",
    },
    start: { dateTime: startTime, timeZone: timezone },
    end: { dateTime: endTime, timeZone: timezone },
    attendees: attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.displayName || a.email },
      type: "required",
    })),
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    // Reminder 10 min before, like the Google side
    reminderMinutesBeforeStart: 10,
    allowNewTimeProposals: true,
  };

  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      // sends invites to attendees automatically
      Prefer: 'outlook.timezone="UTC"',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[microsoft-calendar] Create event failed:", errText);
    throw new Error(`Failed to create Microsoft Calendar event: ${res.status}`);
  }

  const data = await res.json();

  return {
    eventId: data.id,
    meetLink: data.onlineMeeting?.joinUrl || "",
    htmlLink: data.webLink || "",
  };
}

/**
 * Add an attendee to an existing Outlook Calendar event while preserving
 * all existing attendees. Mirrors the Google helper.
 */
export async function addAttendeeToMicrosoftEvent({
  accessToken,
  eventId,
  newAttendee,
}: {
  accessToken: string;
  eventId: string;
  newAttendee: { email: string; displayName?: string };
}): Promise<boolean> {
  try {
    const getRes = await fetch(
      `${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}?$select=attendees`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!getRes.ok) {
      console.error(
        "[microsoft-calendar] Failed to fetch event",
        eventId,
        "status",
        getRes.status
      );
      return false;
    }

    const event = await getRes.json();
    const existing: any[] = Array.isArray(event.attendees) ? event.attendees : [];

    const lower = newAttendee.email.toLowerCase();
    if (
      existing.some(
        (a) => a.emailAddress?.address?.toLowerCase() === lower
      )
    ) {
      return true;
    }

    const updatedAttendees = [
      ...existing.map((a) => ({
        emailAddress: a.emailAddress,
        type: a.type || "required",
      })),
      {
        emailAddress: {
          address: newAttendee.email,
          name: newAttendee.displayName || newAttendee.email,
        },
        type: "required",
      },
    ];

    const patchRes = await fetch(
      `${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`,
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
      console.error("[microsoft-calendar] PATCH attendees failed:", errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[microsoft-calendar] addAttendeeToMicrosoftEvent error:", err);
    return false;
  }
}
