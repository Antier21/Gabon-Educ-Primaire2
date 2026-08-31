import "./annual-timeline.css";
import { LessonBookManager } from "@/components/LessonBookManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
import { AnnualLessonBookTimeline } from "./AnnualLessonBookTimeline";

export const metadata = { title: "Cahier de textes | Gabon Éduc+" };

export default function Page() {
  return (
    <RequireRole allow={PEDAGOGY_ROLES} what="Le cahier de textes">
      <div className="lesson-book-annual-shell">
        <LessonBookManager />
        <AnnualLessonBookTimeline />
      </div>
    </RequireRole>
  );
}
