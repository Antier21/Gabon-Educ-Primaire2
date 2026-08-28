import { FamilyStudentSpace } from "@/components/FamilyStudentSpace";
import { RequireRole } from "@/components/RequireRole";
import { PARENT_SPACE_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Espace parent | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={PARENT_SPACE_ROLES} allowSuperAdmin={false} what="L’espace parent"><FamilyStudentSpace space="parent"/></RequireRole>;}
