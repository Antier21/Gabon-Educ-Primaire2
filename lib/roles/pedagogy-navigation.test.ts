import { describe, expect, it } from "vitest";
import { canShowAdminNavigationHref } from "@/components/SpaceNavigation";

describe("menu Pédagogie", () => {
  it("affiche les modules validés", () => {
    for (const href of ["/gabon-educ/classes", "/gabon-educ/matieres", "/gabon-educ/emplois-du-temps", "/gabon-educ/communication", "/gabon-educ/annonces", "/gabon-educ/assiduite", "/gabon-educ/bulletins-publication", "/gabon-educ/pedagogie/cahiers-de-textes"])
      expect(canShowAdminNavigationHref("academic_director", href), href).toBe(true);
  });
  it("masque tous les modules administratifs sensibles", () => {
    for (const href of ["/gabon-educ/administration", "/gabon-educ/etablissement", "/gabon-educ/utilisateurs", "/gabon-educ/abonnement", "/gabon-educ/comptabilite", "/gabon-educ/journal-audit", "/gabon-educ/import-export", "/gabon-educ/synchronisation", "/gabon-educ/diagnostic", "/gabon-educ/service-abonnements"])
      expect(canShowAdminNavigationHref("academic_director", href), href).toBe(false);
  });
});
