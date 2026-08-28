import { FinanceManager } from "@/components/finance/FinanceManager";
import { RequireRole } from "@/components/RequireRole";
import { FINANCE_MODULE_ROLES } from "@/lib/finance/policy";

export const metadata = { title: "Comptabilité et frais de scolarité | Gabon Éduc+" };
export default function Page() {
  return <RequireRole allow={FINANCE_MODULE_ROLES} what="La comptabilité et les frais de scolarité"><FinanceManager /></RequireRole>;
}
