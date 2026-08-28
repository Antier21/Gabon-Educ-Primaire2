import { RoleAwareClassesManager } from "@/components/RoleAwareClassesManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Classes | Gabon Éduc+" };

export default function MesClassesPage() {
  return <RequireRole allow={PEDAGOGY_ROLES} what="Les classes de l’enseignant"><RoleAwareClassesManager /></RequireRole>;
}
