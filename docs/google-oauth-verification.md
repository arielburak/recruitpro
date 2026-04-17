# Google OAuth Verification Checklist

The calendar integration is hidden behind `NEXT_PUBLIC_ENABLE_CALENDAR_INTEGRATIONS`
while Google reviews our OAuth app. When verification finishes, flip the flag to
`true` in Vercel production env vars.

## Why verification is required

We use the `calendar.events` scope, which Google classifies as a **sensitive
scope**. Any public (non-Workspace-internal) OAuth app requesting it must pass
Google's OAuth verification before users can connect without the scary
"unverified app" warning.

## What Google requires (to submit)

1. **App Home page** — a URL that describes the app. Points to `https://recruitingats.com` (or `/`). Must be reachable publicly.

2. **Privacy Policy** — a URL explaining how we handle user data. Must live on the same domain as App Home. Must specifically cover:
   - What Google data we access (calendar events, email)
   - Why we access it (to schedule interviews)
   - How long we store it
   - Who we share it with (no one)
   - How users can revoke access or delete their data

3. **Terms of Service** — a URL with TOS. Same domain as App Home.

4. **Authorized domains** — `recruitingats.com` (and any other primary domain we use). Staging is fine as `staging.recruitingats.com`.

5. **App Logo** — 120x120 PNG/JPG/BMP, <1MB, square, branded. Shown on the consent screen.

6. **Scope justification** — 200-word explanation for `calendar.events`:
   > "We schedule interviews between recruiters and candidates. When a user creates an interview in our ATS, we use their `calendar.events` access to create a Google Calendar event with a Meet link on their calendar, and invite all participants. Users connect their own Google accounts per-user. We never read events we didn't create; we only write events the user explicitly creates through our interview scheduling UI. No background scans, no data exports."

7. **Demo video** — 2-3 minutes on YouTube (unlisted is fine):
   - Show user signing up / logging in to Recruiting ATS
   - Show the OAuth consent screen where they grant access
   - Show them creating an interview that generates a Meet link
   - Show the event landing in their Google Calendar
   - Show how to disconnect in `/profile` → Integrations

8. **OAuth brand info** — support email, developer contact email.

## Submission flow (Google Cloud Console)

1. Console → **APIs & Services** → **OAuth consent screen**
2. Confirm the app is in "In production" status
3. **"Prepare for verification"** button (sometimes called "Submit for verification")
4. Fill out the scope justification + attach demo video link
5. Submit → Google sends confirmation email, usually within 24h
6. They reply with questions or approval. Typical timeline: **4-6 weeks**, sometimes longer if they request a CASA security assessment (usually not required for our scope level).

## While we wait

- The feature is **hidden by default** in the UI (flag is `false`)
- In Vercel, `NEXT_PUBLIC_ENABLE_CALENDAR_INTEGRATIONS` should be `false` (or simply not set)
- OAuth endpoints in `/api/integrations/google/*` still work (so URLs shared during testing remain functional), but no UI surfaces them

## When verification is approved

1. In Vercel production env vars: set `NEXT_PUBLIC_ENABLE_CALENDAR_INTEGRATIONS=true`
2. Redeploy
3. Announce to users — they can now go to `/profile` → Integrations → Connect Google
4. Delete this file (or move to `docs/archive/`)
