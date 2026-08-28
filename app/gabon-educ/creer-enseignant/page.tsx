import { TeacherCreationManager } from "@/components/TeacherCreationManager";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Créer un enseignant | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={DIRECTION_ROLES} what="La création des comptes enseignants"><TeacherCreationManager/></RequireRole>;}
