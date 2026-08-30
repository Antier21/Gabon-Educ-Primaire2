"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PedagogyMegaNav } from "@/components/PedagogyNavigation";
import { PlatformManager, type PlatformModule } from "@/components/platform/PlatformManager";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { resolveMyRoles } from "@/lib/roles/current-role";
import { signOut } from "@/lib/profile-store";

/**
 * Les écrans historiques Matières et Emplois du temps sont conservés tels
 * quels. Seule leur enveloppe change pour le directeur des études : l'ancienne
 * navigation générale est masquée et le menu Pédagogie prend sa place.
 */
export function PedagogyPlatformPage({ module }: { module: PlatformModule }) {
  const router = useRouter();
  const [isAcademicDirector, setIsAcademicDirector] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        const roles = await resolveMyRoles(context.school.id);
        if (!cancelled) setIsAcademicDirector(roles?.primary === "academic_director");
      } catch {
        if (!cancelled) setIsAcademicDirector(false);
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

  if (!isAcademicDirector) return <PlatformManager module={module} />;

  return (
    <>
      <PedagogyMegaNav onLogout={() => void logout()} />
      <PlatformManager module={module} embedded />
    </>
  );
}
