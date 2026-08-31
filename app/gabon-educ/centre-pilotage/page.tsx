import Link from "next/link";
import { RequireRole } from "@/components/RequireRole";
import { ActivationCodesPanel } from "@/app/gabon-educ-service/ActivationCodesPanel";
import { ServiceControlCenterPage } from "@/app/gabon-educ-service/ServiceControlCenter";

export const metadata = { title: "Centre de pilotage | Gabon Éduc+ Service" };

export default function CentrePilotagePage() {
  return (
    <RequireRole superAdminOnly what="Le centre de pilotage de la plateforme">
      <div style={{ padding: "16px 24px 0" }}>
        <Link href="/gabon-educ/super-admin">← Portail super administrateur</Link>
      </div>
      <ServiceControlCenterPage />
      <ActivationCodesPanel />
    </RequireRole>
  );
}
