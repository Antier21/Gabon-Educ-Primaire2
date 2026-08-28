import { PlatformManager } from "@/components/platform/PlatformManager";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Matières | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={DIRECTION_ROLES} what="La gestion des matières"><PlatformManager module="subjects"/></RequireRole>;}
