import { CommunicationManager } from "@/components/CommunicationManager";
import { RequireRole } from "@/components/RequireRole";

export const metadata = { title: "Communication | Gabon Éduc+" };

export default function CommunicationPage() {
  return (
    <RequireRole
      allow={["school_admin", "headmaster", "academic_director", "secretary"]}
      what="L’espace Communication"
    >
      <CommunicationManager />
    </RequireRole>
  );
}
