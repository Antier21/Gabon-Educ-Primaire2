import { UpcomingModules } from "@/components/UpcomingModules";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Modules à venir | Gabon Éduc+" };

export default function Page() {
  return <RequireRole allow={DIRECTION_ROLES} what="Les modules administratifs à venir"><UpcomingModules /></RequireRole>;
}
