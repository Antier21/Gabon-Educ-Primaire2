import Link from "next/link";
import { PasswordResetForm } from "@/components/PasswordResetForm";

export default function Forgot(){return <main className="center-page"><div className="simple-card"><h1>Réinitialiser le mot de passe</h1><p>L’e-mail sert uniquement au compte principal de l’établissement. Les autres utilisateurs récupèrent leur accès auprès de l’administration.</p><PasswordResetForm/><Link href="/gabon-educ/connexion">← Revenir à la connexion</Link></div></main>}
