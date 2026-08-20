"use client";

import { listClasses, type ClassList } from "@/lib/class-store";
import { resolveActiveSchoolContext } from "@/lib/active-school";

export async function loadActiveSchoolClasses(): Promise<ClassList> {
  try {
    const context = await resolveActiveSchoolContext();
    return listClasses({
      schoolId: context.school.id,
      schoolType: context.school.schoolType,
    });
  } catch {
    return { items: [], mode: "demo", message: "Aucun établissement actif." };
  }
}
