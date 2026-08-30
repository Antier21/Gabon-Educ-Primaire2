"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdministrationMegaNav } from "@/components/AdministrationNavigation";
import { PedagogyMegaNav } from "@/components/PedagogyNavigation";
import { PrimaryTimetableSetup } from "@/components/PrimaryTimetableSetup";
import { PlatformManager } from "@/components/platform/PlatformManager";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { hydrateEdtSubjectCatalog } from "@/lib/platform/edt-subject-catalog";
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
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState("");
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
    let cancelled = false;
    void hydrateEdtSubjectCatalog()
      .then((result) => {
        if (cancelled) return;
        setCatalogWarning(result.warning);
        subjectAssignmentsSnapshot.current = window.localStorage.getItem(
          STORAGE_KEYS.subjectAssignments,
        );
        setCatalogReady(true);
        setPlatformRevision((value) => value + 1);
      })
      .catch((error) => {
        if (cancelled) return;
        setCatalogWarning(
          error instanceof Error
            ? `Chargement des matières impossible : ${error.message}`
            : "Chargement des matières impossible.",
        );
        setCatalogReady(true);
      });
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

      {!catalogReady ? (
        <div style={{ maxWidth: 1500, margin: "18px auto", padding: "16px 24px" }}>
          Chargement du catalogue des matières…
        </div>
      ) : (
        <>
          {catalogWarning ? (
            <div
              role="alert"
              style={{
                maxWidth: 1450,
                margin: "18px auto 0",
                padding: "12px 16px",
                border: "1px solid #e5b85c",
                borderRadius: 10,
                background: "#fff8e6",
                color: "#6b4f12",
                fontWeight: 700,
              }}
            >
              {catalogWarning}
            </div>
          ) : null}
          <PrimaryTimetableSetup />
          <PlatformManager key={`timetable-${platformRevision}`} module="timetable" embedded />
        </>
      )}
    </>
  );
}
