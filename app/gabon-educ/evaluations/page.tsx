import { EvaluationsManager } from "@/components/EvaluationsManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Évaluations | Gabon Éduc+"};
export default function EvaluationsPage(){return <RequireRole allow={PEDAGOGY_ROLES} what="Les évaluations"><EvaluationsManager/></RequireRole>;}
