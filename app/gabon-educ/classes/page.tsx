import { ClassesManagerLocal } from "@/components/ClassesManagerLocal";
import { RequireRole } from "@/components/RequireRole";
import { SECRETARIAT_ROLES } from "@/lib/roles/page-policies";

export const metadata = {
  title: "Gestion des classes | Gabon Éduc+ Primaire",
};

export default function ClassesAdministrationPage() {
  return <RequireRole allow={SECRETARIAT_ROLES} what="La gestion des classes"><ClassesManagerLocal /></RequireRole>;
}
