import { LessonsManager } from "../../../components/LessonsManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
export default function MesFichesPage(){ return <RequireRole allow={PEDAGOGY_ROLES} what="Les fiches pédagogiques"><LessonsManager /></RequireRole>; }
