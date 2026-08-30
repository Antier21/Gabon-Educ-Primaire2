"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  clearSchoolRegistrationAuthorization,
  readSchoolRegistrationAuthorization,
} from "@/lib/school-registration-authorization";

export function SchoolActivationGuard({
  profileKey,
  children,
}: {
  profileKey: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const authorization = readSchoolRegistrationAuthorization();
      if (!authorization || authorization.profileKey !== profileKey) {
        clearSchoolRegistrationAuthorization();
        router.replace(`/gabon-educ/activation-etablissement?profile=${encodeURIComponent(profileKey)}`);
        return;
      }

      const { data, error } = await createClient().rpc("check_school_registration_authorization", {
        p_registration_token: authorization.token,
        p_edition: "primary",
      });

      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.is_valid) {
        clearSchoolRegistrationAuthorization();
        router.replace(`/gabon-educ/activation-etablissement?profile=${encodeURIComponent(profileKey)}&expired=1`);
        return;
      }

      if (!cancelled) setReady(true);
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [profileKey, router]);

  if (!ready) {
    return (
      <div style={{ minHeight: "35vh", display: "grid", placeItems: "center", color: "#0b6b47" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 800 }}>
          <LoaderCircle className="spin-icon" aria-hidden="true" /> Vérification de l’autorisation GEPS…
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
