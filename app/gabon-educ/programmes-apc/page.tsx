import { ProgramsManager } from "@/components/ProgramsManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Programmes APC | Gabon Éduc+"};
export default function ProgrammesPage(){return <RequireRole allow={PEDAGOGY_ROLES} what="Les programmes APC"><ProgramsManager/></RequireRole>;}
