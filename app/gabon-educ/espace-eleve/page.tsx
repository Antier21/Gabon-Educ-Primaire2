import { FamilyStudentSpace } from "@/components/FamilyStudentSpace";
import { RequireRole } from "@/components/RequireRole";
import { STUDENT_SPACE_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Espace élève | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={STUDENT_SPACE_ROLES} allowSuperAdmin={false} what="L’espace élève"><FamilyStudentSpace space="student"/></RequireRole>;}
