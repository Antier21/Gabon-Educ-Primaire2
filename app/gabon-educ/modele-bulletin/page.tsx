import { ReportModelManager } from "@/components/ReportModelManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGICAL_LEAD_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Modèle de bulletin | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={PEDAGOGICAL_LEAD_ROLES} what="La configuration du modèle de bulletin"><ReportModelManager/></RequireRole>;}
