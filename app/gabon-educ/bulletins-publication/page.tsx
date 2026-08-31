import { ReportCardPrinter } from "@/components/ReportCardPrinter";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGICAL_LEAD_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Bulletins et publication | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={PEDAGOGICAL_LEAD_ROLES} what="La publication des bulletins"><ReportCardPrinter space="admin"/></RequireRole>;}
