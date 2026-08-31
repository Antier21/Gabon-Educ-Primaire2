import { PlatformManager } from "@/components/platform/PlatformManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGICAL_LEAD_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Emplois du temps | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={PEDAGOGICAL_LEAD_ROLES} what="La gestion des emplois du temps"><PlatformManager module="timetable"/></RequireRole>;}
