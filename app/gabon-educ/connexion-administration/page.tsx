import Image from "next/image";
import Link from "next/link";
import { Info } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";

type Props = { searchParams: Promise<{ registered?: string }> };

export default async function AdminLogin({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <main className="admin-login-page">
      <header className="admin-login-header">
        <Link href="/gabon-educ/espaces" className="admin-login-title">GABON ÉDUC+ SERVICE</Link>
        <div className="admin-login-logo">
          <Image
            src="/branding/logo-gabon-educ-plus-v2.png"
            alt="Logo Gabon Éduc+"
            width={78}
            height={78}
            priority
            unoptimized
          />
        </div>
      </header>
      <section className="admin-login-stage">
        <div className="admin-login-card">
          <h1>Espace Administration</h1>
          {params?.registered === "1" && (
            <p className="form-message" role="status">Établissement enregistré. Connectez-vous pour accéder au tableau de bord Administration.</p>
          )}
          <p className="admin-login-intro">Accès réservé à la direction et aux personnels administratifs autorisés.</p>
          <div className="admin-login-mode" aria-label="Mode de connexion">
            <span>Mode de connexion</span>
            <label><input type="radio" name="admin-connection-mode" defaultChecked/> Établissement</label>
            <label><input type="radio" name="admin-connection-mode"/> À distance</label>
            <Info aria-hidden="true"/>
          </div>
          <p className="admin-login-required">* Champs obligatoires</p>
          <AuthForm mode="login" redirectTo="/gabon-educ/administration" demoRole="school_admin" demoName="Administration Démo" />
          <Link className="admin-back-teacher" href="/gabon-educ/connexion">Accéder plutôt à l’espace Enseignants</Link>
        </div>
      </section>
    </main>
  );
}
