import { TeacherCreationManager } from "@/components/TeacherCreationManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGICAL_LEAD_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Créer un enseignant | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={PEDAGOGICAL_LEAD_ROLES} what="La création des comptes enseignants"><TeacherCreationManager/></RequireRole>;}
