// Single source of truth para "¿es esta FirmEngagement renderable al
// cliente?". Antes la lógica vivía duplicada en (a) el filtro inline
// del componente Assigned Firms en client-portal/jobs/[id]/page.tsx y
// (b) el endpoint /api/client-portal/invite-suggestions. Cuando agregué
// el filtro de isActive en (a) sin replicarlo en (b), el dropdown de
// Invite Recruiter seguía mostrando recruiters soft-released
// (cuello.nico@gmail.com / Newells Old Boys aparecía en sugerencias
// pero no en Assigned Firms). Caso clásico de feedback_consistent_filters.
//
// Reglas combinadas:
//   1. invitedUser null → firm-level legacy o post-cleanup, visible
//      (la firma aceptó pero no sabemos quién específicamente).
//   2. invitedUser apunta a una org distinta a la del engagement →
//      data corrupta (bug aburak: ClientUser disfrazado de recruiter).
//      Oculto.
//   3. invitedUser inactivo (isActive=false) → soft-released, mail
//      scrambleado a "released+<id>@deleted.local". Oculto.
//   4. invitedUser activo en la org correcta → visible.

type InvitedUserShape = {
  organizationId?: string | null;
  isActive?: boolean | null;
} | null | undefined;

export function isInvitedUserVisible(
  invitedUser: InvitedUserShape,
  engagementOrgId?: string | null
): boolean {
  // (1) firm-level legacy — visible
  if (!invitedUser) return true;

  // (2) org mismatch (bug aburak)
  if (
    engagementOrgId &&
    invitedUser.organizationId &&
    invitedUser.organizationId !== engagementOrgId
  ) {
    return false;
  }

  // (3) soft-released
  if (invitedUser.isActive === false) return false;

  // (4) all good
  return true;
}

// Variante para Users sueltos (no atados a una FirmEngagement). La
// usamos en el flujo workedJobs del endpoint de suggestions: cuando
// agarramos los assignees/submitters de Jobs activos del cliente,
// queremos saltear los que ya están deactivados.
export function isUserVisible(
  user: { isActive?: boolean | null } | null | undefined
): boolean {
  if (!user) return false;
  if (user.isActive === false) return false;
  return true;
}
