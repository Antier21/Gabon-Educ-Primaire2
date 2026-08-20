"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { ClassesManagerLocal } from "@/components/ClassesManagerLocal";
import { TeacherAssignedClasses } from "@/components/TeacherAssignedClasses";

type Mode = "loading" | "teacher" | "management";

export function RoleAwareClassesManager() {
  const [mode, setMode] = useState<Mode>("loading");

  useEffect(() => {
    void (async () => {
      try {
        const client = createClient();
        const { data: auth } = await client.auth.getSession();
        const userId = auth.session?.user.id || "";
        const context = await resolveActiveSchoolContext();
        const schoolId = context.school.id;
        if (!userId || !schoolId) { setMode("teacher"); return; }
        const { data, error } = await client
          .from("school_memberships")
          .select("role")
          .eq("school_id", schoolId)
          .eq("user_id", userId)
          .eq("status", "active");
        if (error) throw error;
        const roles = new Set((data || []).map((row) => String(row.role || "")));
        const managementRoles = ["school_admin", "headmaster", "academic_director", "secretary", "super_admin"];
        if (managementRoles.some((role) => roles.has(role))) setMode("management");
        else if (roles.has("teacher") || roles.has("head_teacher")) setMode("teacher");
        else setMode("teacher");
      } catch {
        setMode("teacher");
      }
    })();
  }, []);

  if (mode === "loading") return <main style={{ padding: 32 }}>Chargement de vos classes…</main>;
  return mode === "teacher" ? <TeacherAssignedClasses /> : <ClassesManagerLocal />;
}
