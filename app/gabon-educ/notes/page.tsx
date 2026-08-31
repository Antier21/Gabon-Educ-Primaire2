import "./notes-register.css";
import { GradebookManager } from "@/components/GradebookManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
import { NotesRegisterPrintButton } from "./NotesRegisterPrintButton";

export const metadata = { title: "Notes | Gabon Éduc+" };

export default function NotesPage() {
  return (
    <RequireRole allow={PEDAGOGY_ROLES} what="La saisie des notes">
      <div className="notes-register-route">
        <NotesRegisterPrintButton />
        <GradebookManager module="notes" />
      </div>
    </RequireRole>
  );
}
