import Link from "next/link";
import { Brand } from "./Brand";

export function Header() {
  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <Brand />
        <nav className="nav-links" aria-label="Navigation principale">
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#matieres">Matières</a>
          <a href="#publics">Pour qui ?</a>
        </nav>
        <div className="nav-actions">
          <Link className="btn btn-ghost" href="/gabon-educ/connexion">Se connecter</Link>
          <Link className="btn btn-primary" href="/gabon-educ/inscription">Créer un compte</Link>
        </div>
      </div>
    </header>
  );
}
