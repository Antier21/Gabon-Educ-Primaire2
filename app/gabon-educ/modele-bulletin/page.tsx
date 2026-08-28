import { ReportModelManager } from "@/components/ReportModelManager";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Modèle de bulletin | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={DIRECTION_ROLES} what="La configuration du modèle de bulletin"><ReportModelManager/></RequireRole>;}
