import { describe, expect, it } from "vitest";
import { canConvertTeachingRole, canCreateRole, canManageRole, SECRETARY_ACCOUNT_ROLES, TEACHING_ACCOUNT_ROLES } from "./access-management";

describe("gestion des comptes par Pédagogie", () => {
  it("autorise uniquement les deux rôles enseignants à la création", () => {
    expect(TEACHING_ACCOUNT_ROLES).toEqual(["teacher", "head_teacher"]);
    for (const role of TEACHING_ACCOUNT_ROLES) expect(canCreateRole(["academic_director"], role)).toBe(true);
    for (const role of ["super_admin", "school_admin", "headmaster", "academic_director", "secretary", "supervisor", "guardian", "student"])
      expect(canCreateRole(["academic_director"], role), role).toBe(false);
  });

  it("ne gère que des comptes exclusivement enseignants", () => {
    expect(canManageRole(["academic_director"], ["teacher"])).toBe(true);
    expect(canManageRole(["academic_director"], ["head_teacher"])).toBe(true);
    expect(canManageRole(["academic_director"], ["teacher", "secretary"])).toBe(false);
    expect(canManageRole(["academic_director"], [])).toBe(false);
  });
  it("préserve le rôle plus étendu d'un compte qui cumule direction et pédagogie", () => {
    expect(canCreateRole(["academic_director", "headmaster"], "secretary")).toBe(true);
    expect(canManageRole(["academic_director", "school_admin"], ["secretary"])).toBe(true);
  });
  it("interdit toujours l'attribution du rôle de plateforme", () => {
    expect(canCreateRole(["school_admin"], "super_admin")).toBe(false);
    expect(canCreateRole(["super_admin"], "super_admin")).toBe(false);
    expect(canCreateRole(["school_admin"], "role_inconnu")).toBe(false);
  });

  it("applique exactement la matrice du secrétariat", () => {
    for (const role of SECRETARY_ACCOUNT_ROLES) expect(canCreateRole(["secretary"], role), role).toBe(true);
    for (const role of ["school_admin", "headmaster", "super_admin", "unknown"])
      expect(canCreateRole(["secretary"], role), role).toBe(false);
    expect(canManageRole(["secretary"], ["teacher", "student"])).toBe(true);
    expect(canManageRole(["secretary"], ["teacher", "school_admin"])).toBe(false);
  });

  it("n'autorise qu'une conversion explicite entre les deux rôles enseignants", () => {
    expect(canConvertTeachingRole(["academic_director"], ["teacher"], "head_teacher")).toBe(true);
    expect(canConvertTeachingRole(["academic_director"], ["head_teacher"], "teacher")).toBe(true);
    expect(canConvertTeachingRole(["academic_director"], ["teacher", "head_teacher"], "teacher")).toBe(false);
    expect(canConvertTeachingRole(["academic_director"], ["teacher"], "secretary")).toBe(false);
    expect(canConvertTeachingRole(["academic_director"], ["teacher", "secretary"], "head_teacher")).toBe(false);
  });
});
