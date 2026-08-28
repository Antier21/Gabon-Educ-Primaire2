import { PersonnelManager } from "@/components/PersonnelManager";
import { RequireRole } from "@/components/RequireRole";
import { SECRETARIAT_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Personnel | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={SECRETARIAT_ROLES} what="La gestion du personnel"><PersonnelManager/></RequireRole>;}
