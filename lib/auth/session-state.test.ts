import { describe, expect, it } from "vitest";
import { evaluateSessionAccess, type SessionContext } from "./session-state";

const active: SessionContext = { authenticated: true, accountState: "active", schoolActive: true, hasAssignment: true, invitationState: "accepted" };

describe("evaluateSessionAccess", () => {
  it("autorise une session active affectée", () => expect(evaluateSessionAccess(active)).toEqual({ allowed: true }));
  it("refuse une session absente", () => expect(evaluateSessionAccess({ ...active, authenticated: false })).toMatchObject({ reason: "unauthenticated" }));
  it("refuse un compte suspendu", () => expect(evaluateSessionAccess({ ...active, accountState: "suspended" })).toMatchObject({ reason: "suspended" }));
  it("refuse un établissement désactivé", () => expect(evaluateSessionAccess({ ...active, schoolActive: false })).toMatchObject({ reason: "school_disabled" }));
  it("refuse une invitation expirée", () => expect(evaluateSessionAccess({ ...active, invitationState: "expired" })).toMatchObject({ reason: "invitation_invalid" }));
  it("refuse une invitation révoquée", () => expect(evaluateSessionAccess({ ...active, invitationState: "revoked" })).toMatchObject({ reason: "invitation_invalid" }));
  it("refuse une session sans affectation", () => expect(evaluateSessionAccess({ ...active, hasAssignment: false })).toMatchObject({ reason: "no_assignment" }));
});
