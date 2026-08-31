import { DashboardClient } from "@/components/DashboardClient";
import { PreproductionDock } from "@/components/preproduction/PreproductionDock";
import { RequireRole } from "@/components/RequireRole";
import { TEACHER_DASHBOARD_ROLES } from "@/lib/roles/page-policies";
export default function Dashboard(){return <RequireRole allow={TEACHER_DASHBOARD_ROLES} what="Le tableau de bord enseignant"><><DashboardClient/><PreproductionDock/></></RequireRole>}
