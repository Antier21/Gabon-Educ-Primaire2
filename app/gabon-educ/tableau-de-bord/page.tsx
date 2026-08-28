import { DashboardClient } from "@/components/DashboardClient";
import { PreproductionDock } from "@/components/preproduction/PreproductionDock";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
export default function Dashboard(){return <RequireRole allow={PEDAGOGY_ROLES} what="L’espace pédagogique"><><DashboardClient/><PreproductionDock/></></RequireRole>}
