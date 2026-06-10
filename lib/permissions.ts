import { NextResponse } from "next/server";

export function redactCandidateForClient(candidate: any) {
  const { currentSalary, ...safe } = candidate;
  return safe;
}

export function isAdmin(role?: string): boolean {
  return role === "ADMIN";
}

// Server-side guard for ADMIN-only mutations (deletes mostly). Return
// from the route handler if this hands back a NextResponse — that's
// the 403 the user gets when a non-admin tries to destroy data.
//
//   const ctx = await getOrgContext();
//   const forbidden = requireAdminResponse(ctx.role);
//   if (forbidden) return forbidden;
//
// We return the response (instead of throwing) so the route stays in
// "control its own response" shape — same style as the existing 404 /
// 400 returns in these handlers.
export function requireAdminResponse(role: string | undefined): NextResponse | null {
  if (role === "ADMIN") return null;
  return NextResponse.json(
    {
      error:
        "Solo los admins de la cuenta pueden borrar. Si necesitás eliminar este registro, pedile a un admin o que te promueva a admin.",
    },
    { status: 403 }
  );
}
