"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isEmailLogin, normalizeAccessIdentifier, roleRedirect } from "@/lib/access-identifiers";
import { normalizeSchoolSector, normalizeSchoolType, type SchoolEducationLevel, type SchoolSector } from "@/lib/school-profiles";

type AuthFormProps = {
  mode: "login" | "signup";
  redirectTo?: string;
  signupRedirectTo?: string;
  demoRole?: string;
  demoName?: string;
  defaultSchoolType?: SchoolEducationLevel;
  defaultSchoolSector?: SchoolSector;
  selectedSchoolProfileLabel?: string;
};

type ResolveAccessResponse = {
  authEmail?: string;
  role?: string;
  schoolId?: string;
  displayName?: string;
  error?: string;
};

async function resolveAuthEmail(identifier: string) {
  const response = await fetch("/api/gabon-educ/access/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  const payload = (await response.json().catch(() => ({}))) as ResolveAccessResponse;
  if (!response.ok || !payload.authEmail) {
    throw new Error(payload.error || "Identifiant ou mot de passe incorrect.");
  }
  return payload;
}

export function AuthForm({
  mode,
  redirectTo = "/gabon-educ/tableau-de-bord",
  signupRedirectTo,
  demoRole = "teacher",
  demoName = "Enseignant Démo",
  defaultSchoolType = "middle_school",
  defaultSchoolSector = "private",
  selectedSchoolProfileLabel,
}: AuthFormProps) {
  const router = useRouter();
  const signup = mode === "signup";
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const normalizedSchoolType = normalizeSchoolType(defaultSchoolType);
  const normalizedSchoolSector = normalizeSchoolSector(defaultSchoolSector);
  const nextSignupRoute = signupRedirectTo || redirectTo;

  function enterDemo() {
    const [firstName, ...rest] = demoName.split(" ");
    localStorage.setItem("gabon-educ-demo-user", JSON.stringify({ firstName: firstName || "Utilisateur", lastName: rest.join(" ") || "Démo", email: "", role: demoRole }));
    document.cookie = "gabon-educ-demo-session=1; path=/; max-age=604800; samesite=lax";
    router.push(redirectTo); router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const formSchoolType = normalizeSchoolType(String(data.get("schoolType") || normalizedSchoolType));
    const formSchoolSector = normalizeSchoolSector(String(data.get("schoolSector") || normalizedSchoolSector));
    const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));

    if (!configured) {
      const localIdentifier = signup ? String(data.get("email") || "") : String(data.get("identifier") || "");
      localStorage.setItem("gabon-educ-demo-user", JSON.stringify({
        firstName: String(data.get("firstName") || "Antier"),
        lastName: String(data.get("lastName") || "Ondo"),
        email: signup ? String(data.get("email") || "") : "",
        identifier: normalizeAccessIdentifier(localIdentifier),
        role: String(data.get("role") || demoRole),
        city: String(data.get("city") || ""),
        schoolName: String(data.get("schoolName") || ""),
        schoolType: formSchoolType,
        schoolSector: formSchoolSector,
      }));
      localStorage.setItem("gabon-educ-plus:onboarding-profile", JSON.stringify({ schoolType: formSchoolType, schoolSector: formSchoolSector, label: selectedSchoolProfileLabel || "" }));
      document.cookie = "gabon-educ-demo-session=1; path=/; max-age=604800; samesite=lax";
      router.push(signup ? nextSignupRoute : redirectTo);
      router.refresh();
      return;
    }

    try {
      const supabase = createClient();
      if (signup) {
        const email = String(data.get("email") || "").trim().toLowerCase();
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: String(data.get("firstName") || ""),
              last_name: String(data.get("lastName") || ""),
              role: "school_admin",
              city: String(data.get("city") || ""),
              school_name: String(data.get("schoolName") || ""),
              school_type: formSchoolType,
              school_sector: formSchoolSector,
            },
          },
        });
        if (error) throw error;
        localStorage.setItem("gabon-educ-plus:onboarding-profile", JSON.stringify({ schoolType: formSchoolType, schoolSector: formSchoolSector, label: selectedSchoolProfileLabel || "" }));
        router.push(nextSignupRoute);
        router.refresh();
      } else {
        const identifier = String(data.get("identifier") || "").trim();
        const resolved = isEmailLogin(identifier)
          ? { authEmail: identifier.toLowerCase() }
          : await resolveAuthEmail(identifier);
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: String(resolved.authEmail),
          password,
        });
        if (error) throw error;

        // La résolution par identifiant fournit déjà le rôle. Pour une connexion
        // directe par e-mail, ne pas lire user_roles côté client : certains comptes
        // établissement peuvent être bloqués par les politiques RLS et cela faisait
        // échouer leur connexion. On vérifie uniquement le privilège global via la
        // RPC de sécurité, puis on conserve la destination normale pour les comptes
        // d'établissement.
        let authenticatedRole = resolved.role || null;
        if (!authenticatedRole && signInData.user?.id) {
          const { data: isSuper, error: superAdminError } = await supabase.rpc("is_super_admin");
          if (superAdminError) throw new Error(superAdminError.message);
          if (isSuper === true) authenticatedRole = "super_admin";
        }

        if (authenticatedRole === "super_admin") {
          // Un super-administrateur n'est pas rattaché à un établissement.
          // Éviter qu'un ancien contexte local A/B ne soit réutilisé par erreur.
          localStorage.removeItem("gabon-educ-plus:v0.9:active-school");
        } else if (resolved.schoolId) {
          // Un identifiant utilisateur désigne explicitement son établissement.
          localStorage.setItem("gabon-educ-plus:v0.9:active-school", String(resolved.schoolId));
        }
        // Pour le compte principal connecté par e-mail, conserver l'établissement actif
        // sélectionné/enregistré juste avant la connexion. resolveActiveSchool vérifiera
        // systématiquement qu'il appartient bien aux memberships Supabase du compte.
        // Cela évite de retomber arbitrairement sur un ancien établissement du même compte.

        router.push(roleRedirect(authenticatedRole, redirectTo));
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {signup && <div className="form-row">
        <label>Prénom<input name="firstName" required placeholder="Votre prénom" /></label>
        <label>Nom<input name="lastName" required placeholder="Votre nom" /></label>
      </div>}
      {signup && <div className="form-row"><label>Ville <span>(facultatif)</span><input name="city" placeholder="Libreville" /></label><label>Établissement <span>(facultatif)</span><input name="schoolName" placeholder="Nom de l’établissement" /></label></div>}
      {signup && (
        <div className="selected-school-profile">
          <strong>{selectedSchoolProfileLabel || "Établissement"}</strong>
          <small>Ce choix sera utilisé pour préparer les niveaux de l’établissement.</small>
          <input type="hidden" name="schoolType" value={normalizedSchoolType} />
          <input type="hidden" name="schoolSector" value={normalizedSchoolSector} />
        </div>
      )}
      {signup ? (
        <label>Adresse e-mail du compte établissement<input name="email" type="email" required placeholder="direction@etablissement.ga" /></label>
      ) : (
        <label>Identifiant ou code d’accès<input name="identifier" required autoComplete="username" placeholder="ex. ondo.antier ou ADM-2026" /></label>
      )}
      <label>Mot de passe<input name="password" type="password" minLength={8} required autoComplete={signup ? "new-password" : "current-password"} placeholder="8 caractères minimum" /></label>
      {!signup && <p className="access-login-note">Les enseignants, élèves, parents et personnels se connectent avec l’identifiant fourni par l’établissement. L’e-mail reste réservé au compte principal de l’établissement.</p>}
      {!signup && <div className="form-help"><label className="check"><input type="checkbox" /> Se souvenir de moi</label><Link href="/gabon-educ/mot-de-passe-oublie">Mot de passe oublié ?</Link></div>}
      {message && <p className="form-message" role="status">{message}</p>}
      <button className="btn btn-primary btn-large full" disabled={loading}>{loading ? "Traitement…" : signup ? "Créer le compte et continuer" : "Me connecter"}</button>
      {!signup && <button type="button" className="btn btn-light full" onClick={enterDemo}>Continuer en mode démonstration</button>}
      <p className="auth-switch">{signup ? "Vous avez déjà un compte ?" : <>Vous n&apos;avez pas encore de compte ?</>} <Link href={signup ? "/gabon-educ/espaces" : "/gabon-educ"}>{signup ? "Accéder aux espaces" : "Inscrire un établissement"}</Link></p>
      <p className="demo-note">Sans configuration Supabase, un espace de démonstration local reste disponible et vos données restent sur cet appareil.</p>
    </form>
  );
}
