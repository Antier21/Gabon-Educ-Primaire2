import "./notes-register.css";
import "./notes-print.css";
import "./notes-actions.css";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
import { NotesRegisterPrintButton } from "./NotesRegisterPrintButton";
import { NotesRegisterManager } from "./NotesRegisterManager";

export const metadata = { title: "Notes | Gabon Éduc+" };

export default function NotesPage() {
  return (
    <RequireRole allow={PEDAGOGY_ROLES} what="La saisie des notes">
      <div className="notes-register-route">
        <NotesRegisterPrintButton />
        <NotesRegisterManager />
      </div>
    </RequireRole>
  );
}
