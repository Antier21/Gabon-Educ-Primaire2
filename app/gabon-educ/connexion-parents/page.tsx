import Image from "next/image";
import Link from "next/link";
import { HeartHandshake, Info } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";

export default function ParentsLogin() {
  return (
    <main className="role-login-page role-login-family">
      <header className="role-login-header">
        <Link href="/gabon-educ" className="role-login-title">GABON ÉDUC+ SERVICE</Link>
        <div className="role-login-logo"><Image src="/branding/logo-gabon-educ-plus-v2.png" alt="Logo Gabon Éduc+" width={78} height={78} priority unoptimized /></div>
      </header>
      <section className="role-login-stage">
        <div className="role-login-card">
          <h1>Espace Parents et accompagnants</h1>
          <p className="role-login-intro">Consultez les informations scolaires des élèves dont vous assurez le suivi.</p>
          <div className="role-login-mode" aria-label="Mode de connexion">
            <span>Mode de connexion</span>
            <label><input type="radio" name="family-mode" defaultChecked/> Domicile</label>
            <label><input type="radio" name="family-mode"/> Établissement</label>
            <Info aria-hidden="true"/>
          </div>
          <AuthForm mode="login" redirectTo="/gabon-educ/espace-parent" demoRole="parent" demoName="Parent Démo" />
          <Link className="role-login-back" href="/gabon-educ">← Revenir au choix des espaces</Link>
        </div>
      </section>
    </main>
  );
}
