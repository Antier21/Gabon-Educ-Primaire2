"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdministrationMegaNav } from "@/components/AdministrationNavigation";
import { PedagogyMegaNav } from "@/components/PedagogyNavigation";
import { PrimaryTimetableSetup } from "@/components/PrimaryTimetableSetup";
import { PlatformManager } from "@/components/platform/PlatformManager";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { readCachedPrimaryRole, resolveMyRoles } from "@/lib/roles/current-role";
import type { SchoolRole } from "@/lib/platform/types";
import { signOut } from "@/lib/profile-store";

/**
 * EDT est un espace partagé entre Administration et Pédagogie. Le moteur et
 * les données restent uniques ; seule la barre de navigation dépend du rôle
 * réel du compte qui l'ouvre.
 */
export function TimetableWorkspacePage() {
  const router = useRouter();
  const [spaceRole, setSpaceRole] = useState<SchoolRole | null>(() => readCachedPrimaryRole());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        const roles = await resolveMyRoles(context.school.id);
        if (!cancelled && roles) setSpaceRole(roles.primary);
      } catch {
        // Le RequireRole de la page reste l'autorité d'accès. En cas de panne
        // de résolution, la navigation déjà en cache est conservée.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await signOut();
    router.push("/gabon-educ/connexion-administration");
    router.refresh();
  }

  const pedagogyNavigation = spaceRole === "academic_director";

  return (
    <>
      {pedagogyNavigation ? (
        <PedagogyMegaNav onLogout={() => void logout()} />
      ) : (
        <AdministrationMegaNav onLogout={() => void logout()} />
      )}
      <PrimaryTimetableSetup />
      <PlatformManager module="timetable" embedded />
    </>
  );
}
