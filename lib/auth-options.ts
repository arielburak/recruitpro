import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

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
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: "common",
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

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (existingUser) return true;

      // Auto-create org + user for new OAuth sign-ups
      const slug = user.email.split("@")[0] + "-" + Date.now().toString(36);
      await prisma.organization.create({
        data: {
          name: user.name ? `${user.name}'s Firm` : "My Firm",
          slug,
          users: {
            create: {
              email: user.email,
              name: user.name || "User",
              passwordHash: "", // No password for OAuth users
              role: "ADMIN",
            },
          },
        },
      });

      return true;
    },
    async jwt({ token, user, account }) {
      if (user && (account?.provider === "credentials" || account?.provider === "client-credentials")) {
        // Fresh credentials sign-in: fully reset fields from the "other side"
        // to avoid leaking state from a previous session (staffing ↔ client)
        const isClient = (user as any).isClientUser || false;
        token.id = user.id;
        token.isClientUser = isClient;
        if (isClient) {
          token.clientId = (user as any).clientId;
          token.clientName = (user as any).clientName;
          // Clear staffing fields
          token.role = undefined;
          token.organizationId = undefined;
          token.organizationName = undefined;
        } else {
          token.role = (user as any).role;
          token.organizationId = (user as any).organizationId;
          token.organizationName = (user as any).organizationName;
          // Clear client fields
          token.clientId = undefined;
          token.clientName = undefined;
        }
      } else if (user && account?.provider && account.provider !== "credentials") {
        // OAuth flow - look up the DB user (always staffing side)
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
          include: { organization: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          token.organizationName = dbUser.organization.name;
          token.isClientUser = false;
          // Clear any client fields
          token.clientId = undefined;
          token.clientName = undefined;
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
        (session.user as any).clientId = token.clientId;
        (session.user as any).clientName = token.clientName;
        (session.user as any).isClientUser = token.isClientUser;
      }
      return session;
    },
  },
};
