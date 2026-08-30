import { AdminDashboardClient } from "@/components/AdminDashboardClient";
import { RequireRole } from "@/components/RequireRole";
import { ADMINISTRATION_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Espace Administration | Gabon Éduc+" };

export default function Page() {
  return (
    <RequireRole allow={ADMINISTRATION_ROLES} what="L’espace Administration">
      <AdminDashboardClient />
    </RequireRole>
  );
}
