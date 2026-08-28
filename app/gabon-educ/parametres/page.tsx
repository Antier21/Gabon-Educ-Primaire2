import { SettingsManager } from "@/components/SettingsManager";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
export const metadata = { title: "Paramètres | Gabon Éduc+" };
export default function SettingsPage() { return <RequireRole allow={PEDAGOGY_ROLES} what="Les paramètres pédagogiques"><SettingsManager/></RequireRole>; }
