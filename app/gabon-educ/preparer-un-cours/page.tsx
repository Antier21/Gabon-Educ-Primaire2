import { Suspense } from "react";
import { LessonPlanBuilder } from "@/components/LessonPlanBuilder";
import { LessonSyncBridge } from "@/components/LessonSyncBridge";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";

function LoadingWorkshop() {
  return <main className="lessons-page"><section className="empty-lessons"><h1>Chargement de l’atelier…</h1></section></main>;
}

export default function PrepareLessonPage() {
  return <RequireRole allow={PEDAGOGY_ROLES} what="La préparation des cours"><>
    <Suspense fallback={<LoadingWorkshop />}>
      <LessonPlanBuilder />
    </Suspense>
    <LessonSyncBridge />
  </></RequireRole>;
}
