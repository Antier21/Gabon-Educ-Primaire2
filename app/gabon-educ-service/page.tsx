import { redirect } from "next/navigation";

export const metadata = { title: "Centre de pilotage | Gabon Éduc+ Service" };

/**
 * Ancienne adresse conservée pour compatibilité avec les favoris et liens
 * déjà partagés. Le centre de pilotage possède désormais une URL explicite
 * dans le portail du super administrateur.
 */
export default function Page() {
  redirect("/gabon-educ/centre-pilotage");
}
