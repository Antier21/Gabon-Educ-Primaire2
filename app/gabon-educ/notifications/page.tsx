import { OperationsCenter } from "@/components/preproduction/OperationsCenter";
import { RequireRole } from "@/components/RequireRole";

export const metadata={title:"Notifications | Gabon Éduc+"};

/*
 * Écran de pilotage technique : direction et secrétariat seulement.
 * Le portier de l'application ne vérifie que la session, jamais le rôle — un
 * enseignant ou un parent y arrivait donc, et n'y voyait qu'un écran vide,
 * indiscernable d'une panne.
 */
export default function Page(){
  return (
    <RequireRole allow={["school_admin", "headmaster", "academic_director", "secretary"]} what="Le centre de notifications">
      <OperationsCenter module="notifications"/>
    </RequireRole>
  );
}
