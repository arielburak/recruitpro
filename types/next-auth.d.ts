import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: string;
      organizationId?: string;
      organizationName?: string;
      clientId?: string;
      clientName?: string;
      isClientUser?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role?: string;
    organizationId?: string;
    organizationName?: string;
    clientId?: string;
    clientName?: string;
    isClientUser?: boolean;
  }
}
