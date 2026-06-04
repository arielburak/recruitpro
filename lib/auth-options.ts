import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

// Turn "jane@acme-corp.com" → "Acme Corp". The hiring manager can
// overwrite this from the onboarding banner on /client-portal/dashboard;
// we just want something readable until they do.
function deriveCompanyNameFromEmail(email: string): string {
  const domain = email.split("@")[1] || "";
  const base = domain.split(".")[0] || domain;
  if (!base) return "New Client";
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Helper — reads the per-portal OAuth hint cookie set by the UI before
// calling signIn("google"). Cookie is short-lived (60s).
async function getOAuthPortal(): Promise<"client" | "staffing"> {
  try {
    const c = await cookies();
    return c.get("oauth-portal")?.value === "client" ? "client" : "staffing";
  } catch {
    return "staffing";
  }
}

// Gmail treats "first.last@gmail.com", "firstlast@gmail.com" and
// "firstlast+tag@gmail.com" as the same mailbox — dots and +suffixes
// are ignored. Our DB stores whatever address the inviter typed, but
// Google OAuth always returns the dotless canonical form. Without this
// normalization, a team member invited as "first.last@gmail.com" gets
// a brand-new empty org spun up on their first Google sign-in because
// the email lookup misses. Returns the canonical form for gmail.com /
// googlemail.com addresses, otherwise lowercases and returns as-is.
function canonicalizeGmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const [local, domain] = lower.split("@");
  if (!local || !domain) return lower;
  if (domain !== "gmail.com" && domain !== "googlemail.com") return lower;
  const cleaned = local.split("+")[0].replace(/\./g, "");
  return `${cleaned}@gmail.com`;
}

// Find a staffing User by email, tolerant of Gmail dot/+tag aliases.
// Exact match wins; the canonical-form scan is the fallback so a row
// stored as "first.last@gmail.com" still matches when Google hands us
// "firstlast@gmail.com". Skipped entirely for non-Gmail domains since
// only Gmail aliases dots and +tags — for other providers the exact
// lookup is authoritative.
async function findStaffingUserByOAuthEmail(email: string) {
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return exact;
  const domain = email.toLowerCase().split("@")[1] || "";
  if (domain !== "gmail.com" && domain !== "googlemail.com") return null;
  const canonical = canonicalizeGmail(email);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User"
    WHERE LOWER(SPLIT_PART(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
      AND LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(email, '@', 1), '+', 1), '[.]', '', 'g')) || '@gmail.com' = ${canonical}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return prisma.user.findUnique({ where: { id: rows[0].id } });
}

// Mirror of findStaffingUserByOAuthEmail for ClientUser.
async function findClientUserByOAuthEmail(email: string) {
  const exact = await prisma.clientUser.findFirst({
    where: { email, isActive: true },
  });
  if (exact) return exact;
  const domain = email.toLowerCase().split("@")[1] || "";
  if (domain !== "gmail.com" && domain !== "googlemail.com") return null;
  const canonical = canonicalizeGmail(email);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "ClientUser"
    WHERE "isActive" = true
      AND LOWER(SPLIT_PART(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
      AND LOWER(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART(email, '@', 1), '+', 1), '[.]', '', 'g')) || '@gmail.com' = ${canonical}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return prisma.clientUser.findUnique({ where: { id: rows[0].id } });
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      // Force Google to show the account chooser AND the consent
      // screen on every sign-in instead of silently re-using the
      // last grant. Without this, switching between accounts (and
      // re-checking what scopes the app asks for) is impossible
      // once a user has signed in once on the browser.
      authorization: {
        params: { prompt: "select_account consent" },
      },
    }),
    CredentialsProvider({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { organization: true },
        });

        if (!user || !user.isActive) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );
        if (!isValid) return null;

        // We used to hard-block unverified users here. That created
        // a friction trap on signup: register → see "Account
        // created!" → try to log in → "Verify your email first".
        // Now we let them in and gate the dangerous actions on the
        // backend instead (see lib/require-verified-email.ts). The
        // verified flag rides the JWT so the gate is one cheap
        // check, no per-request DB hit.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          needsOnboarding: user.organization.needsOnboarding,
          emailVerified: !!user.emailVerifiedAt,
        };
      },
    }),
    CredentialsProvider({
      id: "client-credentials",
      name: "Client Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Find all matching client users and prefer the one with a password
        const clientUsers = await prisma.clientUser.findMany({
          where: { email: credentials.email, isActive: true },
          include: { client: true },
        });

        const clientUser = clientUsers.find((u) => u.passwordHash) || clientUsers[0];

        if (!clientUser || !clientUser.passwordHash) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          clientUser.passwordHash
        );
        if (!isValid) return null;

        // Same soft-block change as the staffing side: let the
        // ClientUser in but stamp the verification state on the
        // JWT so dangerous actions (comments that notify staffing,
        // approvals, etc.) can refuse server-side.
        return {
          id: clientUser.id,
          email: clientUser.email,
          name: clientUser.name,
          clientId: clientUser.clientId,
          clientName: clientUser.client.name,
          isClientUser: true,
          emailVerified: !!clientUser.emailVerifiedAt,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "credentials" || account?.provider === "client-credentials") {
        return true;
      }

      // OAuth flow - find or create user
      if (!user.email) return false;

      const portal = await getOAuthPortal();

      // === Client portal OAuth flow ===
      // Existing ClientUsers sign in directly. Brand-new emails get a
      // stub Client + ClientUser auto-created so OAuth isn't a
      // dead-end for hiring companies that never received an invite.
      // The stub flag stays true until they fill in real company info
      // via the onboarding banner on /client-portal/dashboard.
      if (portal === "client") {
        const existing = await findClientUserByOAuthEmail(user.email);
        if (existing) return true;

        const derivedName = deriveCompanyNameFromEmail(user.email);
        try {
          await prisma.$transaction(async (tx) => {
            const client = await tx.client.create({
              data: {
                name: derivedName,
                isStub: true,
                // No agency owns this — it's a client-portal-self
                // signup. organizationId stays null; engagements come
                // later when a recruiter invites them to a job.
                organizationId: null,
                contactEmail: user.email!,
                contactName: user.name || null,
              },
            });
            await tx.clientPipelineStage.createMany({
              data: (await import("./constants")).DEFAULT_STAGES.map((s, i) => ({
                name: s.name,
                order: i,
                color: s.color,
                isTerminal: s.isTerminal,
                kind: s.kind,
                clientId: client.id,
              })),
            });
            await tx.clientUser.create({
              data: {
                email: user.email!,
                name: user.name || derivedName,
                clientId: client.id,
                role: "ADMIN",
                // Google's already verified the address — no need to
                // send a separate verify-email mail.
                emailVerifiedAt: new Date(),
              },
            });
          });
          // Welcome mail — symmetric with the agency OAuth + the
          // verify-email + the set-password flows. Every account
          // activation path emits the same "your account is ready"
          // confirmation.
          try {
            const baseUrl =
              process.env.NEXTAUTH_URL ||
              (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
            const { sendClientPortalWelcomeEmail } = await import("./email");
            sendClientPortalWelcomeEmail({
              to: user.email!,
              recipientName: user.name || derivedName,
              clientName: derivedName,
              portalUrl: `${baseUrl}/client-portal/login`,
            }).catch((err) =>
              console.error("[client OAuth] welcome mail failed:", err),
            );
          } catch (err) {
            console.error("[client OAuth] welcome mail dispatch failed:", err);
          }
          return true;
        } catch (e) {
          console.error("[signIn] client portal OAuth auto-create failed:", e);
          return "/client-portal/login?error=signup-failed";
        }
      }

      // === Staffing portal OAuth flow (default) ===
      const existingUser = await findStaffingUserByOAuthEmail(user.email);

      if (existingUser) return true;

      // Auto-create org + user for new OAuth sign-ups.
      // Org name is a placeholder — user is forced through /onboarding
      // to set the real company name before accessing the app.
      const slug = user.email.split("@")[0] + "-" + Date.now().toString(36);
      await prisma.organization.create({
        data: {
          name: "",
          slug,
          needsOnboarding: true,
          users: {
            create: {
              email: user.email,
              name: user.name || "User",
              passwordHash: "", // No password for OAuth users
              role: "ADMIN",
              // Google already confirmed the address — no need to
              // round-trip a verification email through the user.
              emailVerifiedAt: new Date(),
            },
          },
        },
      });

      // Welcome mail — sent on first OAuth sign-up so the user gets
      // the same "your account is ready" experience as the manual
      // signup (post-verify) and invite (post-accept) flows. The
      // org name is still empty at this point because /onboarding
      // captures it later; fall back to a friendly placeholder.
      try {
        const baseUrl =
          process.env.NEXTAUTH_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
        const { sendStaffingMemberWelcomeEmail } = await import("./email");
        sendStaffingMemberWelcomeEmail({
          to: user.email,
          recipientName: user.name || "",
          organizationName: "your workspace",
          appUrl: `${baseUrl}/dashboard`,
        }).catch((err) =>
          console.error("[oauth signup] welcome mail failed:", err),
        );
      } catch (err) {
        console.error("[oauth signup] welcome mail dispatch failed:", err);
      }

      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      // Client-initiated session update (useSession().update({ name, role }))
      // Merge any supplied fields into the token so the UI can pick them up
      // without requiring a re-login.
      if (trigger === "update" && session) {
        if (typeof session.name === "string" && session.name.trim()) {
          token.name = session.name;
        }
        if (typeof session.role === "string") {
          token.role = session.role;
        }
        if (typeof session.organizationName === "string" && session.organizationName.trim()) {
          token.organizationName = session.organizationName;
        }
        if (typeof session.needsOnboarding === "boolean") {
          token.needsOnboarding = session.needsOnboarding;
        }
        if (typeof session.emailVerified === "boolean") {
          token.emailVerified = session.emailVerified;
        }
        return token;
      }

      if (user && (account?.provider === "credentials" || account?.provider === "client-credentials")) {
        // Fresh credentials sign-in: fully reset fields from the "other side"
        // to avoid leaking state from a previous session (staffing ↔ client)
        const isClient = (user as any).isClientUser || false;
        token.id = user.id;
        token.name = user.name;
        token.isClientUser = isClient;
        token.emailVerified = !!(user as any).emailVerified;
        if (isClient) {
          token.clientId = (user as any).clientId;
          token.clientName = (user as any).clientName;
          // Clear staffing fields
          token.role = undefined;
          token.organizationId = undefined;
          token.organizationName = undefined;
          token.needsOnboarding = undefined;
        } else {
          token.role = (user as any).role;
          token.organizationId = (user as any).organizationId;
          token.organizationName = (user as any).organizationName;
          token.needsOnboarding = (user as any).needsOnboarding || false;
          // Clear client fields
          token.clientId = undefined;
          token.clientName = undefined;
        }
      } else if (user && account?.provider && account.provider !== "credentials") {
        // OAuth flow — route based on the portal cookie set before signIn.
        const portal = await getOAuthPortal();

        if (portal === "client") {
          // Use the canonicalized lookup so dotted-Gmail invitees match
          // their existing row, then re-fetch with the `client` relation.
          const matched = await findClientUserByOAuthEmail(user.email!);
          const dbClient = matched
            ? await prisma.clientUser.findUnique({
                where: { id: matched.id },
                include: { client: true },
              })
            : null;
          if (dbClient) {
            // Google has already verified the address on its side, so
            // backfill emailVerifiedAt on first OAuth sign-in if it
            // wasn't set yet. Keeps the hard-block in client-credentials
            // honest for password users without locking out OAuth users.
            if (!dbClient.emailVerifiedAt) {
              await prisma.clientUser.update({
                where: { id: dbClient.id },
                data: {
                  emailVerifiedAt: new Date(),
                  emailVerificationToken: null,
                  emailVerificationExpiresAt: null,
                },
              });
            }
            token.id = dbClient.id;
            token.name = dbClient.name;
            token.isClientUser = true;
            token.clientId = dbClient.clientId;
            token.clientName = dbClient.client.name;
            // OAuth = Google already proved the address, and we
            // just backfilled emailVerifiedAt above if it was null.
            token.emailVerified = true;
            // Clear staffing fields
            token.role = undefined;
            token.organizationId = undefined;
            token.organizationName = undefined;
            token.needsOnboarding = undefined;
          }
        } else {
          // Canonicalized lookup so dotted-Gmail invitees match the
          // existing row, then re-fetch with the `organization` relation.
          const matched = await findStaffingUserByOAuthEmail(user.email!);
          const dbUser = matched
            ? await prisma.user.findUnique({
                where: { id: matched.id },
                include: { organization: true },
              })
            : null;
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.organizationId = dbUser.organizationId;
            token.organizationName = dbUser.organization.name;
            token.needsOnboarding = dbUser.organization.needsOnboarding;
            token.isClientUser = false;
            // OAuth Google sign-up backfills emailVerifiedAt in
            // the signIn callback above (auto-create branch), so
            // existing rows can be either; trust whatever the DB
            // currently says.
            token.emailVerified = !!dbUser.emailVerifiedAt;
            // Clear any client fields
            token.clientId = undefined;
            token.clientName = undefined;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Liveness + freshness check — a JWT outlives both the row
      // it points to and its own state:
      //
      //   1. Tenant wipe during QA / staging resets: User row is
      //      gone but the browser still holds a cookie signed
      //      with the same NEXTAUTH_SECRET. Return null → sign
      //      out on this very request.
      //   2. Deactivation lifecycle (still ahead of us in prod).
      //      Same problem.
      //   3. Verification drift: cookie was issued before
      //      `emailVerified` existed on the token (legacy session),
      //      OR the user verified after login but their JWT didn't
      //      get the update push for whatever reason. Without
      //      reading the DB here, the gate on /api/admin/invites
      //      etc. keeps refusing a user whose emailVerifiedAt is
      //      already set. So we pull the live flag along with the
      //      liveness check and stamp it on the session — at the
      //      cost of one extra column on the same indexed lookup
      //      we were already doing.
      let liveEmailVerified: boolean | undefined = undefined;
      if (token?.id) {
        if (token.isClientUser) {
          const row = await prisma.clientUser.findUnique({
            where: { id: token.id as string },
            select: { id: true, isActive: true, emailVerifiedAt: true },
          });
          if (!row || !row.isActive) {
            return null as any;
          }
          liveEmailVerified = !!row.emailVerifiedAt;
        } else {
          const row = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { id: true, isActive: true, emailVerifiedAt: true },
          });
          if (!row || !row.isActive) {
            return null as any;
          }
          liveEmailVerified = !!row.emailVerifiedAt;
        }
      }

      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).organizationName = token.organizationName;
        (session.user as any).needsOnboarding = token.needsOnboarding;
        (session.user as any).clientId = token.clientId;
        (session.user as any).clientName = token.clientName;
        (session.user as any).isClientUser = token.isClientUser;
        // Live DB flag wins over the cached token value so a user
        // who just verified doesn't need to log out and back in.
        (session.user as any).emailVerified =
          liveEmailVerified ?? !!token.emailVerified;
      }
      return session;
    },
  },
};
