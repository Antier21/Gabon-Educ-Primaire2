"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdministrationMegaNav } from "@/components/AdministrationNavigation";
import { PedagogyMegaNav } from "@/components/PedagogyNavigation";
import { PrimaryTimetableSetup } from "@/components/PrimaryTimetableSetup";
import { PlatformManager } from "@/components/platform/PlatformManager";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { readCachedPrimaryRole, resolveMyRoles } from "@/lib/roles/current-role";
import type { SchoolRole } from "@/lib/platform/types";
import { signOut } from "@/lib/profile-store";
import { STORAGE_KEYS } from "@/lib/storage-mode";

/**
 * EDT est un espace partagé entre Administration et Pédagogie. Le moteur et
 * les données restent uniques ; seule la barre de navigation dépend du rôle
 * réel du compte qui l'ouvre.
 */
export function TimetableWorkspacePage() {
  const router = useRouter();
  const [spaceRole, setSpaceRole] = useState<SchoolRole | null>(() => readCachedPrimaryRole());
  const [platformRevision, setPlatformRevision] = useState(0);
  const subjectAssignmentsSnapshot = useRef<string | null>(
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(STORAGE_KEYS.subjectAssignments),
  );

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

  useEffect(() => {
    /**
     * Le paramétrage automatique et l'ancien éditeur de créneaux chargent deux
     * instances distinctes du workspace. Quand le premier récupère ou modifie
     * les matières/affectations, le second doit être remonté pour relire la
     * même source. On compare la valeur sérialisée afin d'éviter une boucle :
     * loadPlatformWorkspace() réécrit aussi le cache, mais sans changement de
     * contenu cela ne provoque aucun nouveau remontage.
     */
    const refreshIfSubjectsChanged = () => {
      const current = window.localStorage.getItem(STORAGE_KEYS.subjectAssignments);
      if (current === subjectAssignmentsSnapshot.current) return;
      subjectAssignmentsSnapshot.current = current;
      setPlatformRevision((value) => value + 1);
    };

    const onStorage = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key === STORAGE_KEYS.subjectAssignments) {
        refreshIfSubjectsChanged();
      }
    };

    window.addEventListener("gabon-educ:storage", onStorage);
    // Couvre aussi le cas où un composant enfant a terminé son chargement
    // juste avant l'installation de cet écouteur.
    refreshIfSubjectsChanged();
    return () => window.removeEventListener("gabon-educ:storage", onStorage);
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
      <PlatformManager key={`timetable-${platformRevision}`} module="timetable" embedded />
    </>
  );
}
