export const TEACHING_ACCOUNT_ROLES = ["teacher", "head_teacher"] as const;
export const SECRETARY_ACCOUNT_ROLES = ["guardian", "parent", "student", "academic_director", "supervisor", "secretary", "teacher", "head_teacher"] as const;
const DIRECTION_ACCOUNT_ROLES = ["super_admin", "school_admin", "headmaster"];
const ESTABLISHMENT_ASSIGNABLE_ROLES = ["school_admin", "headmaster", "academic_director", "supervisor", "secretary", "head_teacher", "teacher", "guardian", "parent", "student"];
const allIn = (values: readonly string[], allowed: readonly string[]) => values.length > 0 && values.every((value) => allowed.includes(value));

export function canCreateRole(actorRoles: readonly string[], targetRole: string): boolean {
  if (!ESTABLISHMENT_ASSIGNABLE_ROLES.includes(targetRole)) return false;
  if (actorRoles.some((role) => DIRECTION_ACCOUNT_ROLES.includes(role))) return true;
  if (actorRoles.includes("secretary")) return (SECRETARY_ACCOUNT_ROLES as readonly string[]).includes(targetRole);
  if (actorRoles.includes("academic_director")) {
    return (TEACHING_ACCOUNT_ROLES as readonly string[]).includes(targetRole);
  }
  return false;
}

export function canManageRole(actorRoles: readonly string[], targetRoles: readonly string[]): boolean {
  if (actorRoles.some((role) => DIRECTION_ACCOUNT_ROLES.includes(role))) return targetRoles.length > 0;
  if (actorRoles.includes("secretary")) return allIn(targetRoles, SECRETARY_ACCOUNT_ROLES);
  if (actorRoles.includes("academic_director")) {
    return targetRoles.length > 0 && targetRoles.every((role) =>
      (TEACHING_ACCOUNT_ROLES as readonly string[]).includes(role));
  }
  return false;
}

export function canConvertTeachingRole(actorRoles: readonly string[], targetRoles: readonly string[], nextRole: string): boolean {
  return (TEACHING_ACCOUNT_ROLES as readonly string[]).includes(nextRole) && targetRoles.length === 1 && allIn(targetRoles, TEACHING_ACCOUNT_ROLES) && canManageRole(actorRoles, targetRoles);
}
