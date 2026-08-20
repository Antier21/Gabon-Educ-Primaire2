import Image from "next/image";
import Link from "next/link";
import { BriefcaseBusiness, Info } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";

export default function StudentLifeLogin() {
  return (
    <main className="role-login-page role-login-life">
      <header className="role-login-header">
        <Link href="/gabon-educ" className="role-login-title">GABON ÉDUC+ SERVICE</Link>
        <div className="role-login-logo"><Image src="/branding/logo-gabon-educ-plus-v2.png" alt="Logo Gabon Éduc+" width={78} height={78} priority unoptimized /></div>
      </header>
      <section className="role-login-stage">
        <div className="role-login-card">
          <h1>Espace Vie scolaire</h1>
          <p className="role-login-intro">Accès réservé aux surveillants, conseillers d’éducation et responsables autorisés.</p>
          <div className="role-login-mode" aria-label="Mode de connexion">
            <span>Mode de connexion</span>
            <label><input type="radio" name="life-mode" defaultChecked/> Établissement</label>
            <label><input type="radio" name="life-mode"/> À distance</label>
            <Info aria-hidden="true"/>
          </div>
          <AuthForm mode="login" redirectTo="/gabon-educ/assiduite" demoRole="school_life" demoName="Vie scolaire Démo" />
          <Link className="role-login-back" href="/gabon-educ">← Revenir au choix des espaces</Link>
        </div>
      </section>
    </main>
  );
}
