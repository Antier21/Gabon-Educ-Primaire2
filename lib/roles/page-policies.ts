import type { SchoolRole } from "@/lib/platform/types";

export const DIRECTION_ROLES: readonly SchoolRole[] = [
  "school_admin",
  "headmaster",
  "academic_director",
];

export const SECRETARIAT_ROLES: readonly SchoolRole[] = [
  "secretary",
  "school_admin",
  "headmaster",
];

export const COMMUNICATION_ROLES: readonly SchoolRole[] = [
  "school_admin",
  "headmaster",
  "academic_director",
  "secretary",
];

export const PEDAGOGY_ROLES: readonly SchoolRole[] = [
  "teacher",
  "head_teacher",
  "school_admin",
  "headmaster",
  "academic_director",
];

export const BULLETIN_PRINT_ROLES: readonly SchoolRole[] = COMMUNICATION_ROLES;

export const SHARED_DOCUMENT_ROLES: readonly SchoolRole[] = [
  "secretary",
  "teacher",
  "head_teacher",
  "school_admin",
  "headmaster",
  "academic_director",
];

export const SCHOOL_LIFE_ROLES: readonly SchoolRole[] = [
  "supervisor",
  "school_admin",
  "headmaster",
  "academic_director",
];

export const PARENT_SPACE_ROLES: readonly SchoolRole[] = ["guardian"];
export const STUDENT_SPACE_ROLES: readonly SchoolRole[] = ["student"];

export function policyAllowsRole(
  allowed: readonly SchoolRole[],
  role: SchoolRole,
  allowSuperAdmin = true,
): boolean {
  if (role === "super_admin") return allowSuperAdmin;
  return allowed.includes(role);
}
