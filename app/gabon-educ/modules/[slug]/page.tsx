import { ComingSoonModule } from "@/components/ComingSoonModule";

const labels: Record<string, string> = {
  concours: "Concours scolaires", consultations: "Consultations", infirmerie: "Infirmerie scolaire",
  orientation: "Information et orientation", "sorties-scolaires": "Sorties scolaires", vacations: "Vacations",
  salaires: "Salaires", "gestion-stocks": "Gestion des stocks", bibliotheque: "Bibliothèque",
  "service-informatique": "Service informatique",
};

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const normalized = slug.replace(/^(parent|eleve)-/, "").replaceAll("-", " ");
  const title = labels[slug] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
  return <ComingSoonModule title={title} description="Ce module est prévu dans l’architecture officielle de Gabon Éduc+ et sera relié aux données de l’espace concerné." features={["Accès limité selon le rôle connecté", "Consultation ou gestion selon les autorisations", "Synchronisation avec l’établissement", "Interface adaptée à l’ordinateur, la tablette et le téléphone"]} version="0.10.0" />;
}
