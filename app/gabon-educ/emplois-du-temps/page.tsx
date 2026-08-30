import { PedagogyPlatformPage } from "@/components/PedagogyPlatformPage";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Emplois du temps | Gabon Éduc+" };

export default function Page() {
  return (
    <RequireRole allow={DIRECTION_ROLES} what="La gestion des emplois du temps">
      <PedagogyPlatformPage module="timetable" />
    </RequireRole>
  );
}
