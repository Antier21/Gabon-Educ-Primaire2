import { PlatformManager } from "@/components/platform/PlatformManager";
import { RequireRole } from "@/components/RequireRole";
import { SCHOOL_LIFE_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Assiduité | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={SCHOOL_LIFE_ROLES} what="L’espace Vie scolaire"><PlatformManager module="attendance"/></RequireRole>;}
