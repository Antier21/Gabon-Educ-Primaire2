"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { writeSchoolRegistrationAuthorization } from "@/lib/school-registration-authorization";

export function SchoolActivationForm({
  profileKey,
  profileLabel,
}: {
  profileKey: string;
  profileLabel: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecking(true);
    setMessage("");
    setError(false);

    try {
      const { data, error: rpcError } = await createClient().rpc("begin_school_registration", {
        p_code: code.trim(),
        p_edition: "primary",
      });

      if (rpcError) throw rpcError;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.registration_token || !row?.school_name || !row?.authorization_expires_at) {
        throw new Error("Le serveur n’a pas délivré d’autorisation d’inscription.");
      }

      writeSchoolRegistrationAuthorization({
        token: String(row.registration_token),
        profileKey,
        schoolName: String(row.school_name),
        expiresAt: String(row.authorization_expires_at),
      });

      setMessage(`Autorisation validée pour ${row.school_name}.`);
      setTimeout(() => {
        router.push(`/gabon-educ/ouvrir-compte?profile=${encodeURIComponent(profileKey)}`);
        router.refresh();
      }, 450);
    } catch (err) {
      setError(true);
      const text = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message || "") : "";
      setMessage(text.includes("invalide ou indisponible")
        ? "Ce code n’est pas valide, a expiré, a été révoqué ou a déjà été utilisé."
        : text || "Impossible de vérifier le code d’activation.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <form className="school-activation-form" onSubmit={submit}>
      <div className="school-activation-profile">
        <CheckCircle2 aria-hidden="true" />
        <div>
          <span>Profil demandé</span>
          <strong>{profileLabel}</strong>
        </div>
      </div>

      <label className="school-activation-field">
        <span>Code d’activation GEPS</span>
        <div className="school-activation-input-wrap">
          <KeyRound aria-hidden="true" />
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="GEPS-P-XXXX-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            required
            autoFocus
          />
        </div>
        <small>Utilisez exactement le code transmis par Gabon Éduc Plus Service. Les codes déjà délivrés restent acceptés.</small>
      </label>

      {message && (
        <p className={error ? "school-activation-message is-error" : "school-activation-message"} role={error ? "alert" : "status"}>
          {error ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          <span>{message}</span>
        </p>
      )}

      <button className="school-activation-submit" disabled={checking || !code.trim()}>
        {checking ? <LoaderCircle className="spin-icon" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
        {checking ? "Vérification…" : "Vérifier mon autorisation"}
      </button>
    </form>
  );
}
