import { RequireRole } from "@/components/RequireRole";
import { ServiceControlCenterPage } from "./ServiceControlCenter";

export const metadata = { title: "Centre de pilotage | Gabon Éduc+ Service" };

/*
 * Le centre de pilotage de l'éditeur.
 *
 * Il ne vérifiait aucun rôle : il concluait au refus quand sa requête tombait
 * en erreur. Or une politique de sécurité qui écarte des lignes ne lève aucune
 * erreur — elle en rend moins. Un chef d'établissement y voyait donc sa propre
 * école, présentée dans le vocabulaire commercial de l'éditeur ; un enseignant
 * y voyait un tableau vide, sans un mot d'explication.
 *
 * Le verdict est désormais demandé à « is_super_admin », jamais déduit.
 */
export default function Page() {
  return (
    <RequireRole superAdminOnly what="Le centre de pilotage de la plateforme">
      <ServiceControlCenterPage />
    </RequireRole>
  );
}
