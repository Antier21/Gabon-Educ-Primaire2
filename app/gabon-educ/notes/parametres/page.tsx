import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
import { NotesRegisterSettings } from "./NotesRegisterSettings";

export const metadata = { title: "Paramètres des notes | Gabon Éduc+" };

export default function NotesSettingsPage() {
  return (
    <RequireRole allow={PEDAGOGY_ROLES} what="Les paramètres du carnet de notes">
      <NotesRegisterSettings />
    </RequireRole>
  );
}
