import { PlatformManager } from "@/components/platform/PlatformManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGICAL_LEAD_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Matières | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={PEDAGOGICAL_LEAD_ROLES} what="La gestion des matières"><PlatformManager module="subjects"/></RequireRole>;}
