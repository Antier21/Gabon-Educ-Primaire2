import { ClassesManagerLocal } from "@/components/ClassesManagerLocal";
import { RequireRole } from "@/components/RequireRole";
import { ACADEMIC_ORGANIZATION_ROLES } from "@/lib/roles/page-policies";

export const metadata = {
  title: "Gestion des classes | Gabon Éduc+ Primaire",
};

export default function ClassesAdministrationPage() {
  return <RequireRole allow={ACADEMIC_ORGANIZATION_ROLES} what="La gestion des classes"><ClassesManagerLocal /></RequireRole>;
}
