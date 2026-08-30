import { PedagogyDashboardClient } from "@/components/PedagogyDashboardClient";
import { RequireRole } from "@/components/RequireRole";
import { ACADEMIC_DIRECTION_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Espace Pédagogie | Gabon Éduc+" };

export default function Page() {
  return (
    <RequireRole allow={ACADEMIC_DIRECTION_ROLES} what="L’espace Pédagogie">
      <PedagogyDashboardClient />
    </RequireRole>
  );
}
