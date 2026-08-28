import { PlatformManager } from "@/components/platform/PlatformManager";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Établissement | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={DIRECTION_ROLES} what="La gestion de l’établissement"><PlatformManager module="establishment"/></RequireRole>;}
