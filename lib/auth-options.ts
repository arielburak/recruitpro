import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

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
      // Only existing ClientUsers can sign in this way; we don't auto-create
      // Client organisations from OAuth to avoid ghost client accounts.
      if (portal === "client") {
        const existing = await prisma.clientUser.findFirst({
          where: { email: user.email, isActive: true },
        });
        if (existing) return true;
        // Bounce back to client login with an explanatory error.
        return "/client-portal/login?error=no-client-account";
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
