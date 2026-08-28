import { LessonBookManager } from "@/components/LessonBookManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Cahier de textes | Gabon Éduc+" };

export default function Page() {
  return <RequireRole allow={PEDAGOGY_ROLES} what="Le cahier de textes"><LessonBookManager /></RequireRole>;
}
