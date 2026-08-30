import { RequireRole } from "@/components/RequireRole";
import { TimetableWorkspacePage } from "@/components/TimetableWorkspacePage";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "EDT | Gabon Éduc+" };

export default function Page() {
  return (
    <RequireRole allow={DIRECTION_ROLES} what="La gestion des emplois du temps">
      <TimetableWorkspacePage />
    </RequireRole>
  );
}
