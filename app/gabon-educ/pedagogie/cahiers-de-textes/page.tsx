import { PedagogyLessonBookReader } from "@/components/PedagogyLessonBookReader";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGICAL_LEAD_ROLES } from "@/lib/roles/page-policies";

export default function PedagogyLessonBooksPage() {
  return <RequireRole allow={PEDAGOGICAL_LEAD_ROLES} what="Les cahiers de textes des enseignants"><PedagogyLessonBookReader /></RequireRole>;
}
