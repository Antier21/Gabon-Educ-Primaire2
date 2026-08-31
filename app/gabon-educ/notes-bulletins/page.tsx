import { GradebookManager } from "@/components/GradebookManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGICAL_LEAD_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Notes & bulletins | Gabon Éduc+" };

export default function NotesBulletinsPage() {
  return <RequireRole allow={PEDAGOGICAL_LEAD_ROLES} what="Le pilotage des notes et bulletins"><GradebookManager /></RequireRole>;
}
