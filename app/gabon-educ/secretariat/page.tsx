import { SecretariatDeskClient } from "@/components/SecretariatDeskClient";
import { RequireRole } from "@/components/RequireRole";
import { SECRETARIAT_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Bureau du secrétariat | Gabon Éduc+" };

export default function Page() {
  return <RequireRole allow={SECRETARIAT_ROLES} what="Le bureau du secrétariat"><SecretariatDeskClient /></RequireRole>;
}
