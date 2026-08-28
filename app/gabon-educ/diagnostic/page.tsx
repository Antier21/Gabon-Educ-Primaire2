import { OperationsCenter } from "@/components/preproduction/OperationsCenter";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";

export const metadata={title:"Diagnostic | Gabon Éduc+"};

/*
 * Écran de pilotage technique : direction et secrétariat seulement.
 * Le portier de l'application ne vérifie que la session, jamais le rôle — un
 * enseignant ou un parent y arrivait donc, et n'y voyait qu'un écran vide,
 * indiscernable d'une panne.
 */
export default function Page(){
  return (
    <RequireRole allow={DIRECTION_ROLES} what="Le diagnostic technique">
      <OperationsCenter module="diagnostic"/>
    </RequireRole>
  );
}
