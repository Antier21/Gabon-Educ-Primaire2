import { CommunicationManager } from "@/components/CommunicationManager";
import { RequireRole } from "@/components/RequireRole";
import { COMMUNICATION_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Communication | Gabon Éduc+" };

export default function CommunicationPage() {
  return (
    <RequireRole
      allow={COMMUNICATION_ROLES}
      what="L’espace Communication"
    >
      <CommunicationManager />
    </RequireRole>
  );
}
