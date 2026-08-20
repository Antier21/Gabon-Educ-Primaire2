export type ProductEdition = "primary" | "secondary";

// Cette constante est volontairement figée dans chaque livrable. Elle évite
// qu'un simple choix d'interface transforme une édition en l'autre.
export const PRODUCT_EDITION = "primary" as ProductEdition;

export const PRODUCT = PRODUCT_EDITION === "primary"
  ? {
      edition: PRODUCT_EDITION,
      name: "Gabon Éduc+ Primaire",
      shortName: "Éduc+ Primaire",
      audience: "écoles maternelles et primaires",
      defaultProfileKey: "primary-school" as const,
      defaultSchoolType: "primary" as const,
      maxScore: 10,
      passThreshold: 5,
      bulletinTemplate: "primary_annual_report" as const,
      bulletinLabel: "Bulletin annuel du primaire",
    }
  : {
      edition: PRODUCT_EDITION,
      name: "Gabon Éduc+ Secondaire",
      shortName: "Éduc+ Secondaire",
      audience: "collèges et lycées",
      defaultProfileKey: "secondary-school" as const,
      // Le type historique complex_school sert d'alias de stockage compatible
      // avec tous les niveaux de la 6e à la Terminale. Il n'est jamais affiché.
      defaultSchoolType: "complex_school" as const,
      maxScore: 20,
      passThreshold: 10,
      bulletinTemplate: "secondary_term_report" as const,
      bulletinLabel: "Bulletin trimestriel du secondaire",
    };

export function productAllowsSchoolType(type?: string | null) {
  return PRODUCT_EDITION === "primary"
    ? type === "primary"
    : type === "secondary" || type === "middle_school" || type === "high_school" || type === "complex_school" || type === "school_complex";
}

export function productTitle(section?: string) {
  return section ? `${section} | ${PRODUCT.name}` : PRODUCT.name;
}
