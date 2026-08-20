import { Suspense } from "react";
import { LessonPlanBuilder } from "@/components/LessonPlanBuilder";
import { LessonSyncBridge } from "@/components/LessonSyncBridge";

function LoadingWorkshop() {
  return <main className="lessons-page"><section className="empty-lessons"><h1>Chargement de l’atelier…</h1></section></main>;
}

export default function PrepareLessonPage() {
  return <>
    <Suspense fallback={<LoadingWorkshop />}>
      <LessonPlanBuilder />
    </Suspense>
    <LessonSyncBridge />
  </>;
}
