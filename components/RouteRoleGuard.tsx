"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { RequireRole } from "@/components/RequireRole";
import { routeAccessDecision } from "@/lib/roles/route-access";

export function RouteRoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const decision = routeAccessDecision(pathname);

  if (decision.kind === "public") return <>{children}</>;

  if (decision.kind === "unknown") {
    return (
      <main className="center-page">
        <div className="simple-card">
          <h2>Accès refusé</h2>
          <p>
            Cette route n’est déclarée ni comme page publique ni comme espace
            protégé. Son affichage est refusé par défaut.
          </p>
          <Link href="/gabon-educ">Retour à l’accueil</Link>
        </div>
      </main>
    );
  }

  const access = decision.rule;

  return (
    <RequireRole
      key={pathname}
      allow={[...access.allow]}
      superAdminOnly={access.superAdminOnly}
      what={access.what}
    >
      {children}
    </RequireRole>
  );
}
