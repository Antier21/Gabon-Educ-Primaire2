import Image from "next/image";
import Link from "next/link";
import { Info } from "lucide-react";
import { AuthForm } from "@/components/AuthForm";

export default function Login() {
  return (
    <main className="teacher-login-page">
      <header className="teacher-login-header">
        <Link href="/gabon-educ/espaces" className="teacher-login-title">GABON ÉDUC+ SERVICE</Link>
        <div className="teacher-login-logo">
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
      <section className="teacher-login-stage">
        <div className="teacher-login-card">
          <h1>Espace Enseignants</h1>
          <div className="teacher-login-mode" aria-label="Mode de connexion">
            <span>Mode de connexion</span>
            <label><input type="radio" name="connection-mode" defaultChecked/> Domicile</label>
            <label><input type="radio" name="connection-mode"/> Dans la classe</label>
            <Info aria-hidden="true"/>
          </div>
          <p className="teacher-login-required">* Champs obligatoires</p>
          <AuthForm mode="login" />
        </div>
      </section>
    </main>
  );
}
