import type { SchoolRole } from "@/lib/platform/types";

export const FINANCE_MODULE_ROLES = ["school_admin", "headmaster", "secretary"] as const satisfies readonly SchoolRole[];
export const FINANCE_MANAGER_ROLES = ["school_admin", "headmaster"] as const satisfies readonly SchoolRole[];

export function canConfigureFinance(role: SchoolRole | null): boolean {
  return role === "school_admin" || role === "headmaster";
}

export function canCollectFinance(role: SchoolRole | null): boolean {
  return role === "school_admin" || role === "headmaster" || role === "secretary";
}
