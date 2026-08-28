import { LessonProgression } from "@/components/LessonProgression";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Progression annuelle | Gabon Éduc+" };

export default function Page() {
  return <RequireRole allow={PEDAGOGY_ROLES} what="La progression pédagogique"><LessonProgression /></RequireRole>;
}
