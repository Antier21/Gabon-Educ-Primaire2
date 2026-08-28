import { PlatformManager } from "@/components/platform/PlatformManager";
import { RequireRole } from "@/components/RequireRole";
import { COMMUNICATION_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Annonces | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={COMMUNICATION_ROLES} what="La gestion des annonces"><PlatformManager module="announcements"/></RequireRole>;}
