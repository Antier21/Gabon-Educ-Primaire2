import { StudentEnrollmentManager } from "@/components/StudentEnrollmentManager";
import { RequireRole } from "@/components/RequireRole";
import { SECRETARIAT_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Inscriptions scolaires | Gabon Éduc+" };

export default function Page() {
  return <RequireRole allow={SECRETARIAT_ROLES} what="Les inscriptions scolaires"><StudentEnrollmentManager /></RequireRole>;
}
