import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const authCookies = allCookies
      .filter((c) => c.name.includes("next-auth") || c.name.includes("csrf"))
      .map((c) => ({ name: c.name, length: c.value.length }));

    return NextResponse.json({
      hasSession: !!session,
      user: session?.user
        ? { name: session.user.name, email: session.user.email }
        : null,
      authCookies,
      env: {
        hasSecret: !!process.env.NEXTAUTH_SECRET,
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
        nextAuthUrl: process.env.NEXTAUTH_URL,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, stack: error.stack?.split("\n").slice(0, 3) },
      { status: 500 }
    );
  }
}
