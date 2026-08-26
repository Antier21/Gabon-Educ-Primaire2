/**
 * Le logo de l'établissement, chargé depuis l'ordinateur.
 *
 * Le champ n'acceptait qu'une adresse web. Un blason hébergé ailleurs
 * disparaît du bulletin le jour où l'hébergeur tombe — ou simplement quand
 * l'école imprime sans connexion, ce qui arrive plus souvent que l'inverse.
 * Sur un document officiel, un cadre vide à la place des armes de
 * l'établissement fait douter du document entier.
 *
 * L'image est donc réduite puis enregistrée dans la fiche de l'établissement
 * elle-même, sous forme de « data:URI ». Elle voyage avec les données de
 * l'école : une sauvegarde de la base emporte le logo, et l'impression n'a
 * plus besoin du réseau.
 *
 * Le prix à payer, c'est la taille. Une photo de 4 Mo transformée en texte
 * gonflerait la fiche et ralentirait chaque bulletin. D'où la réduction à
 * 256 px et le plafond ci-dessous, tous deux vérifiés avant enregistrement.
 */

/** Le côté le plus long après réduction. Le logo s'imprime à 14 mm. */
export const LOGO_MAX_EDGE = 256;

/** Plafond du data:URI final. Au-delà, on refuse plutôt que d'alourdir la fiche. */
export const LOGO_MAX_BYTES = 150_000;

/**
 * Au-delà de ce poids, le PNG cesse d'être le bon format.
 *
 * Un blason — des aplats, quelques couleurs — pèse cinq à dix kilo-octets en
 * PNG une fois réduit. Passé ce seuil, l'image est photographique, et le PNG
 * la garde lourde sans rien apporter : on repasse en JPEG, qui la divise par
 * cinq sans différence visible à 14 mm sur le papier. Ce seuil est distinct du
 * plafond : le plafond dit ce qu'on refuse, celui-ci dit ce qu'on convertit.
 */
export const LOGO_PNG_BUDGET = 60_000;

/** Ce qu'un navigateur sait dessiner sur un canevas de façon fiable. */
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

export function isAcceptedLogoType(type: string): boolean {
  return ACCEPTED.includes((type || "").toLowerCase());
}

/**
 * Les dimensions après réduction, proportions gardées.
 *
 * Une image déjà plus petite que la limite n'est jamais agrandie : un blason
 * de 120 px repassé à 256 px sortirait flou à l'impression.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = LOGO_MAX_EDGE,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const ratio = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** Le poids réel d'un « data:URI », déduit de sa charge base64. */
export function dataUriBytes(uri: string): number {
  const comma = (uri || "").indexOf(",");
  if (comma < 0) return 0;
  const payload = uri.slice(comma + 1);
  if (!uri.slice(0, comma).includes(";base64")) return payload.length;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

/** « 42 ko », pour l'afficher à côté de la vignette. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Ce qui s'affiche sous le champ : une adresse web, une image intégrée, ou rien. */
export function describeLogoValue(value: string): string {
  const uri = (value || "").trim();
  if (!uri) return "Aucun logo.";
  if (uri.startsWith("data:")) {
    return `Image intégrée à la fiche (${formatBytes(dataUriBytes(uri))}) — elle s’imprime sans connexion.`;
  }
  return "Adresse web : le logo disparaîtra du bulletin si ce site devient inaccessible.";
}

/**
 * Lit un fichier, le réduit, et rend un « data:URI ».
 *
 * Ne fonctionne que dans le navigateur : la réduction passe par un canevas.
 * Le PNG est essayé d'abord, parce qu'un blason a presque toujours un fond
 * transparent ; s'il pèse trop, on retombe sur du JPEG posé sur fond blanc,
 * ce qui divise le poids par cinq ou six sans que le logo change d'aspect sur
 * le papier.
 */
export async function readLogoAsDataUri(file: File): Promise<string> {
  if (!isAcceptedLogoType(file.type)) {
    throw new Error(
      "Format d’image non reconnu. Utilisez un fichier PNG, JPEG, WebP, GIF ou SVG.",
    );
  }

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image();
    element.onerror = () => reject(new Error("Ce fichier n’est pas une image lisible."));
    element.onload = () => resolve(element);
    element.src = source;
  });

  // Un SVG sans dimensions intrinsèques se dessine à 0 × 0 : on lui impose
  // alors le carré de référence plutôt que de rendre une image vide.
  const naturalWidth = image.naturalWidth || LOGO_MAX_EDGE;
  const naturalHeight = image.naturalHeight || LOGO_MAX_EDGE;
  const size = fitWithin(naturalWidth, naturalHeight);

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Réduction de l’image impossible sur ce navigateur.");
  context.drawImage(image, 0, 0, size.width, size.height);

  const png = canvas.toDataURL("image/png");
  if (dataUriBytes(png) <= LOGO_PNG_BUDGET) return png;

  // Fond blanc avant le JPEG : sans lui, la transparence deviendrait noire.
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.85);
  // Le PNG reprend la main s'il est malgré tout le plus léger des deux : cela
  // arrive sur un logo à fond transparent que le JPEG doit aplatir.
  if (dataUriBytes(png) <= dataUriBytes(jpeg) && dataUriBytes(png) <= LOGO_MAX_BYTES) return png;
  if (dataUriBytes(jpeg) <= LOGO_MAX_BYTES) return jpeg;

  throw new Error(
    `Cette image reste trop lourde après réduction (${formatBytes(dataUriBytes(jpeg))}). ` +
      "Utilisez un logo simple, sans photographie en arrière-plan.",
  );
}
