import { ReportCardPrinter } from "@/components/ReportCardPrinter";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Bulletins et publication | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={DIRECTION_ROLES} what="La publication des bulletins"><ReportCardPrinter space="admin"/></RequireRole>;}
