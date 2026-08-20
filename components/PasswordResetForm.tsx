"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnvironment, withTimeout } from "@/lib/storage-mode";

export function PasswordResetForm() {
  const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    if (!hasSupabaseEnvironment()) { setMessage("La récupération par e-mail nécessite la configuration Supabase."); setLoading(false); return; }
    const email = String(new FormData(event.currentTarget).get("email") || "");
    try {
      const { error } = await withTimeout(createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/gabon-educ/connexion` }));
      if (error) throw error;
      setMessage("Si cette adresse correspond au compte établissement, un lien de réinitialisation vient d’être envoyé. Pour un identifiant enseignant, élève, parent ou vie scolaire, demandez un nouveau mot de passe au secrétariat ou à l’administration.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Envoi impossible. Réessayez."); }
    finally { setLoading(false); }
  }
  return <form onSubmit={submit}><label>Adresse e-mail du compte établissement<input name="email" type="email" placeholder="direction@etablissement.ga" required/></label><p className="access-login-note">Les comptes par identifiant ne se réinitialisent pas par e-mail : l’établissement génère un nouveau mot de passe provisoire.</p>{message && <p className="form-message" role="status">{message}</p>}<button className="btn btn-primary full" disabled={loading}>{loading ? "Envoi…" : "Envoyer le lien"}</button></form>;
}
