import { GradebookManager } from "@/components/GradebookManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";

export const metadata = { title: "Bulletins | Gabon Éduc+" };

export default function BulletinsPage() {
  return <RequireRole allow={PEDAGOGY_ROLES} what="La consultation et les appréciations des bulletins"><GradebookManager module="bulletins" /></RequireRole>;
}
