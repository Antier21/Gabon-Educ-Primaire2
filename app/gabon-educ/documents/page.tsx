import { PlatformManager } from "@/components/platform/PlatformManager";
import { RequireRole } from "@/components/RequireRole";
import { SHARED_DOCUMENT_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Documents | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={SHARED_DOCUMENT_ROLES} what="Les documents partagés"><PlatformManager module="documents"/></RequireRole>;}
