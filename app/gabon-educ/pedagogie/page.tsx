import { PedagogyDashboardClient } from "@/components/PedagogyDashboardClient";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGICAL_LEAD_ROLES } from "@/lib/roles/page-policies";

export default function Page() {
  return <RequireRole allow={PEDAGOGICAL_LEAD_ROLES} what="L’espace Pédagogie"><PedagogyDashboardClient /></RequireRole>;
}
