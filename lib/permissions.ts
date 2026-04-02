export function redactCandidateForClient(candidate: any) {
  const { currentSalary, ...safe } = candidate;
  return safe;
}

export function isAdmin(role?: string): boolean {
  return role === "ADMIN";
}
