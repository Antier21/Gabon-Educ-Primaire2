import Image from "next/image";
import Link from "next/link";
import { Info, UserRound } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";

export default function StudentsLogin() {
  return (
    <main className="role-login-page role-login-student">
      <header className="role-login-header">
        <Link href="/gabon-educ" className="role-login-title">GABON ÉDUC+ SERVICE</Link>
        <div className="role-login-logo"><Image src="/branding/logo-gabon-educ-plus-v2.png" alt="Logo Gabon Éduc+" width={78} height={78} priority unoptimized /></div>
      </header>
      <section className="role-login-stage">
        <div className="role-login-card">
          <h1>Espace Élèves</h1>
          <p className="role-login-intro">Retrouvez vos résultats, vos documents et les informations de votre établissement.</p>
          <div className="role-login-mode" aria-label="Mode de connexion">
            <span>Mode de connexion</span>
            <label><input type="radio" name="student-mode" defaultChecked/> Domicile</label>
            <label><input type="radio" name="student-mode"/> Établissement</label>
            <Info aria-hidden="true"/>
          </div>
          <AuthForm mode="login" redirectTo="/gabon-educ/espace-eleve" demoRole="student" demoName="Élève Démo" />
          <Link className="role-login-back" href="/gabon-educ">← Revenir au choix des espaces</Link>
        </div>
      </section>
    </main>
  );
}
