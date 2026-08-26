import { RequireRole } from "@/components/RequireRole";
import { ServiceSubscriptionsPage } from "./ServiceSubscriptions";

export const metadata = { title: "Abonnements | Gabon Éduc+ Service" };

/*
 * Le sélecteur d'établissement actif.
 *
 * L'écran vérifiait déjà « is_super_admin » lui-même, et bien : il demandait
 * le verdict au lieu de le déduire. L'enveloppe ne le remplace pas, elle
 * l'annonce plus tôt et rend le même refus que partout ailleurs — même
 * formulation, même porte de sortie.
 */
export default function Page() {
  return (
    <RequireRole superAdminOnly what="Le service des abonnements">
      <ServiceSubscriptionsPage />
    </RequireRole>
  );
}
