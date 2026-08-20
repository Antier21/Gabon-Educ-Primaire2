export type AccountState = "active" | "suspended" | "disabled";
export type InvitationState = "accepted" | "pending" | "expired" | "revoked";

export interface SessionContext {
  authenticated: boolean;
  accountState: AccountState;
  invitationState?: InvitationState;
  schoolActive: boolean;
  hasAssignment: boolean;
}

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "unauthenticated" | "suspended" | "school_disabled" | "invitation_invalid" | "no_assignment" };

/** Évalue les états métier sans prétendre remplacer la vérification serveur/RLS. */
export function evaluateSessionAccess(context: SessionContext): AccessDecision {
  if (!context.authenticated) return { allowed: false, reason: "unauthenticated" };
  if (context.accountState !== "active") return { allowed: false, reason: "suspended" };
  if (!context.schoolActive) return { allowed: false, reason: "school_disabled" };
  if (context.invitationState && !["accepted", "pending"].includes(context.invitationState)) {
    return { allowed: false, reason: "invitation_invalid" };
  }
  if (!context.hasAssignment) return { allowed: false, reason: "no_assignment" };
  return { allowed: true };
}
