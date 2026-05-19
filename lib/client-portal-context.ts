// Name of the cookie that remembers which Client a multi-membership
// portal user is currently viewing. Set by /api/client-portal/switch-client,
// read by getClientContext (and the memberships endpoint, for "isCurrent").
export const CLIENT_PORTAL_CLIENT_COOKIE = "cp-client";
