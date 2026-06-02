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

        // Hard block on unverified emails. The previous behavior was a
        // soft check (login + dashboard banner), which let typo'd
        // addresses and bots end up with a working session. We refuse
        // to issue one until the verification email is clicked. UI
        // catches the throw and offers a resend.
        if (!user.emailVerifiedAt) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
          organizationName: user.organization.name,
          needsOnboarding: user.organization.needsOnboarding,
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

        // Same hard block as the agency side: don't issue a session
        // until the email-verification token has been clicked. The UI
        // catches this and offers a resend.
        if (!clientUser.emailVerifiedAt) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return {
          id: clientUser.id,
          email: clientUser.email,
          name: clientUser.name,
          clientId: clientUser.clientId,
          clientName: clientUser.client.name,
          isClientUser: true,
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
        const existing = await prisma.clientUser.findFirst({
          where: { email: user.email, isActive: true },
        });
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
          return true;
        } catch (e) {
          console.error("[signIn] client portal OAuth auto-create failed:", e);
          return "/client-portal/login?error=signup-failed";
        }
      }

      // === Staffing portal OAuth flow (default) ===
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

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
        return token;
      }

      if (user && (account?.provider === "credentials" || account?.provider === "client-credentials")) {
        // Fresh credentials sign-in: fully reset fields from the "other side"
        // to avoid leaking state from a previous session (staffing ↔ client)
        const isClient = (user as any).isClientUser || false;
        token.id = user.id;
        token.name = user.name;
        token.isClientUser = isClient;
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
          const dbClient = await prisma.clientUser.findFirst({
            where: { email: user.email!, isActive: true },
            include: { client: true },
          });
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
            // Clear staffing fields
            token.role = undefined;
            token.organizationId = undefined;
            token.organizationName = undefined;
            token.needsOnboarding = undefined;
          }
        } else {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email! },
            include: { organization: true },
          });
          if (dbUser) {
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.organizationId = dbUser.organizationId;
            token.organizationName = dbUser.organization.name;
            token.needsOnboarding = dbUser.organization.needsOnboarding;
            token.isClientUser = false;
            // Clear any client fields
            token.clientId = undefined;
            token.clientName = undefined;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).organizationName = token.organizationName;
        (session.user as any).needsOnboarding = token.needsOnboarding;
        (session.user as any).clientId = token.clientId;
        (session.user as any).clientName = token.clientName;
        (session.user as any).isClientUser = token.isClientUser;
      }
      return session;
    },
  },
};
