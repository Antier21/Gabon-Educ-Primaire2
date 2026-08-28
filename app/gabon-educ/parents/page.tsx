import { PlatformManager } from "@/components/platform/PlatformManager";
import { RequireRole } from "@/components/RequireRole";
import { SECRETARIAT_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Parents | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={SECRETARIAT_ROLES} what="La gestion des parents et responsables"><PlatformManager module="guardians"/></RequireRole>;}
