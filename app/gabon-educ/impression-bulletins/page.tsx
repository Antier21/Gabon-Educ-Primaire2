import { ReportCardPrinter } from "@/components/ReportCardPrinter";
import { RequireRole } from "@/components/RequireRole";
import { BULLETIN_PRINT_ROLES } from "@/lib/roles/page-policies";
export const metadata={title:"Imprimer les bulletins | Gabon Éduc+"};
export default function Page(){return <RequireRole allow={BULLETIN_PRINT_ROLES} what="L’impression administrative des bulletins"><ReportCardPrinter space="teacher"/></RequireRole>;}
