import { ReportScoreEntry } from "@/components/ReportScoreEntry";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Saisie du bulletin | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={PEDAGOGY_ROLES} what="La saisie des appréciations de bulletin"><ReportScoreEntry/></RequireRole>;}
