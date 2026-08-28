import { GradebookManager } from "@/components/GradebookManager";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Notes & bulletins | Gabon Éduc+" };

export default function NotesBulletinsPage() {
  return <RequireRole allow={DIRECTION_ROLES} what="La gestion administrative des notes et bulletins"><GradebookManager /></RequireRole>;
}
