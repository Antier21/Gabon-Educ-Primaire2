import { GradebookManager } from "@/components/GradebookManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Notes | Gabon Éduc+" };

export default function NotesPage() {
  return <RequireRole allow={PEDAGOGY_ROLES} what="La saisie des notes"><GradebookManager module="notes" /></RequireRole>;
}
