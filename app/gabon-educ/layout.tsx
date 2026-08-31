import "./timetable-hours.css";
import { ConnectionBanner } from "@/components/ConnectionBanner";

/**
 * Le bandeau de connexion est posé ici, et nulle part ailleurs.
 *
 * Il doit apparaître sur tous les écrans de travail — une panne de serveur ne
 * choisit pas sa page. Le poser dans cette disposition partagée évite d'avoir
 * à l'ajouter écran par écran, et surtout d'oublier celui où il manquerait
 * précisément le jour où il servirait.
 */
export default function GabonEducLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <ConnectionBanner />
      {children}
    </>
  );
}
