/**
 * L'en-tête du bulletin.
 *
 * Il était écrit en dur dans le composant, recopié du bulletin qui a servi de
 * modèle : « Direction d'Académie Provinciale de l'Estuaire »,
 * « Circonscription Scolaire Libreville-Est ». Une école de Port-Gentil aurait
 * imprimé la mauvaise académie sur un document officiel, et le bulletin aurait
 * perdu sa valeur sans que personne ne s'en aperçoive avant les familles.
 *
 * Deux chemins de lecture, et ce n'est pas une redondance :
 *
 *   — « loadReportHeader » passe par la fonction « get_report_header », qui
 *     ne rend que l'en-tête et vérifie elle-même qui appelle. C'est le chemin
 *     des familles, qui doivent voir le bulletin complet de leur enfant sans
 *     que « schools » et « school_report_settings » leur soient ouvertes ;
 *   — « loadHeaderSettings » lit la table directement. C'est le chemin de la
 *     direction, qui compose l'en-tête et a donc besoin du réglage brut —
 *     notamment « show_logo », que la fonction n'expose pas puisqu'elle se
 *     contente d'en appliquer l'effet.
 */

import { createClient } from "@/lib/supabase/client";

/** Ce qui s'imprime en haut de la feuille. */
export type ReportHeader = {
  schoolName: string;
  logoUrl: string;
  authority1: string;
  authority2: string;
  authority3: string;
  subtitle1: string;
  subtitle2: string;
};

/** Le réglage tel que la direction le modifie. */
export type HeaderSettings = {
  authority1: string;
  authority2: string;
  authority3: string;
  subtitle1: string;
  subtitle2: string;
  showLogo: boolean;
};

export const MINISTRY_LINE = "Ministère de l’Éducation Nationale";

export const DEFAULT_HEADER: ReportHeader = {
  schoolName: "",
  logoUrl: "",
  authority1: MINISTRY_LINE,
  authority2: "",
  authority3: "",
  subtitle1: "",
  subtitle2: "",
};

export const DEFAULT_HEADER_SETTINGS: HeaderSettings = {
  authority1: MINISTRY_LINE,
  authority2: "",
  authority3: "",
  subtitle1: "",
  subtitle2: "",
  showLogo: true,
};

/**
 * L'article qui précède le nom d'une province gabonaise.
 *
 * « Direction d'Académie Provinciale de l'Estuaire », mais « du Haut-Ogooué »
 * et « de la Ngounié ». Une suggestion mal accordée serait recopiée telle
 * quelle par les établissements pressés, et le bulletin porterait une faute
 * dans sa première ligne. Les neuf provinces sont connues : autant les écrire.
 */
const PROVINCE_ARTICLES: Record<string, string> = {
  estuaire: "de l’",
  "haut-ogooue": "du ",
  "moyen-ogooue": "du ",
  ngounie: "de la ",
  nyanga: "de la ",
  "ogooue-ivindo": "de l’",
  "ogooue-lolo": "de l’",
  "ogooue-maritime": "de l’",
  "woleu-ntem": "du ",
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Ce que l'établissement verra proposé s'il n'a rien saisi.
 *
 * Une suggestion, jamais une valeur imposée : un établissement dont la
 * circonscription ne porte pas le nom de sa ville doit pouvoir corriger, et sa
 * correction ne doit pas être écrasée à la relecture suivante.
 */
export function suggestHeaderSettings(school: {
  province?: string;
  city?: string;
}): HeaderSettings {
  const province = (school.province || "").trim();
  const city = (school.city || "").trim();
  const article = PROVINCE_ARTICLES[fold(province)] ?? "de ";
  return {
    authority1: MINISTRY_LINE,
    authority2: province ? `Direction d’Académie Provinciale ${article}${province}` : "",
    authority3: city ? `Circonscription Scolaire ${city}` : "",
    subtitle1: "",
    subtitle2: "",
    showLogo: true,
  };
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [raw.message, raw.details]
      .map((value) => (typeof value === "string" ? value : ""))
      .filter(Boolean);
    const code = typeof raw.code === "string" && raw.code ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "En-tête du bulletin indisponible.";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * L'en-tête à imprimer, pour le personnel comme pour les familles.
 *
 * Un en-tête absent ne doit jamais empêcher un bulletin de s'afficher : en cas
 * d'échec, on rend l'en-tête par défaut plutôt que de propager l'erreur. Le
 * document sort alors avec le nom de l'école et la ligne du ministère, ce qui
 * vaut mieux qu'une page blanche et un message technique.
 */
export async function loadReportHeader(schoolId: string): Promise<ReportHeader> {
  if (!schoolId || schoolId === "local") return DEFAULT_HEADER;
  const { data, error } = await createClient().rpc("get_report_header", {
    target_school: schoolId,
  });
  if (error || !data || typeof data !== "object") return DEFAULT_HEADER;
  const row = data as Record<string, unknown>;
  return {
    schoolName: text(row.schoolName),
    logoUrl: text(row.logoUrl),
    authority1: text(row.authority1) || MINISTRY_LINE,
    authority2: text(row.authority2),
    authority3: text(row.authority3),
    subtitle1: text(row.subtitle1),
    subtitle2: text(row.subtitle2),
  };
}

/** Le réglage brut, pour l'écran où la direction le compose. */
export async function loadHeaderSettings(schoolId: string): Promise<HeaderSettings> {
  if (!schoolId || schoolId === "local") return DEFAULT_HEADER_SETTINGS;
  const { data, error } = await createClient()
    .from("school_report_settings")
    .select(
      "authority_line1,authority_line2,authority_line3,school_subtitle1,school_subtitle2,show_logo",
    )
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw new Error(describe(error));
  if (!data) return DEFAULT_HEADER_SETTINGS;
  const row = data as unknown as Record<string, unknown>;
  return {
    authority1: text(row.authority_line1) || MINISTRY_LINE,
    authority2: text(row.authority_line2),
    authority3: text(row.authority_line3),
    subtitle1: text(row.school_subtitle1),
    subtitle2: text(row.school_subtitle2),
    showLogo: row.show_logo !== false,
  };
}

export async function saveHeaderSettings(
  schoolId: string,
  settings: HeaderSettings,
): Promise<void> {
  const { error } = await createClient()
    .from("school_report_settings")
    .upsert(
      {
        school_id: schoolId,
        authority_line1: settings.authority1.trim(),
        authority_line2: settings.authority2.trim(),
        authority_line3: settings.authority3.trim(),
        school_subtitle1: settings.subtitle1.trim(),
        school_subtitle2: settings.subtitle2.trim(),
        show_logo: settings.showLogo,
      },
      { onConflict: "school_id" },
    );
  if (error) throw new Error(describe(error));
}

/** Le réglage composé à l'écran, vu comme il s'imprimera. */
export function headerFromSettings(
  settings: HeaderSettings,
  school: { name?: string; logoUrl?: string },
): ReportHeader {
  return {
    schoolName: school.name || "",
    logoUrl: settings.showLogo ? school.logoUrl || "" : "",
    authority1: settings.authority1,
    authority2: settings.authority2,
    authority3: settings.authority3,
    subtitle1: settings.subtitle1,
    subtitle2: settings.subtitle2,
  };
}
