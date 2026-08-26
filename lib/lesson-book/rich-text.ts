/**
 * Le filtre du contenu mis en forme.
 *
 * Le cahier de textes est écrit par un enseignant et relu par des familles.
 * Entre les deux, du HTML circule — et du HTML non filtré affiché à des
 * centaines de parents est une faille stockée : il suffirait d'une balise
 * « script » dans un contenu de séance pour qu'elle s'exécute chez chacun
 * d'eux, à chaque ouverture, sans que personne ne s'en aperçoive.
 *
 * Ce module n'essaie donc pas de « nettoyer » le HTML reçu, ce qui reviendrait
 * à courir après les astuces connues. Il **reconstruit** la sortie à partir
 * d'une liste blanche : tout ce qui n'y figure pas explicitement disparaît.
 * Une balise inconnue est retirée, un attribut inconnu est retiré, une adresse
 * dont le protocole n'est pas reconnu est retirée. Ce qui n'est pas permis est
 * interdit — et non l'inverse.
 *
 * Le filtre s'applique DEUX fois : à l'enregistrement et à l'affichage.
 * Filtrer seulement à l'écriture laisserait passer tout ce qui aurait été
 * inséré autrement — par la base, par un import, par une version antérieure du
 * code.
 */

/** Les balises que l'éditeur de l'application sait produire, et rien d'autre. */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "h3", "h4", "a", "span", "blockquote",
  // Le navigateur crée des « div » pour séparer les lignes d'une zone
  // éditable : les refuser ferait fondre les paragraphes en un seul bloc.
  "div",
  // Exposant et indice : « 1er », « m² », « H₂O ». Un enseignant de sciences
  // comme de français en a besoin, et rien ne les remplace.
  "sup", "sub",
]);

/** Balises dont le contenu entier doit disparaître, pas seulement la balise. */
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "svg", "math"];

/** Balises sans fermeture. */
const VOID_TAGS = new Set(["br", "hr"]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  span: new Set(["style"]),
  // L'alignement se pose sur le bloc, pas sur le texte : c'est ainsi que le
  // navigateur l'écrit, et c'est la seule façon de centrer un titre.
  p: new Set(["style"]),
  h3: new Set(["style"]),
  h4: new Set(["style"]),
  li: new Set(["style"]),
  blockquote: new Set(["style"]),
  div: new Set(["style"]),
};

/** Protocoles admis dans un lien. « javascript: » et « data: » en sont exclus. */
const SAFE_PROTOCOL = /^(https?:|mailto:|tel:)/i;

/**
 * Les seules déclarations de style admises, propriété par propriété.
 *
 * On ne valide pas la chaîne entière d'un coup : « color:red;position:fixed »
 * passerait ou échouerait en bloc, alors qu'il faut garder la première et
 * jeter la seconde. Chaque déclaration est donc examinée seule, et seules
 * celles qui figurent ici survivent.
 *
 * Ce qui reste dehors est aussi important que ce qui entre : ni « position »,
 * ni « background » (qui accepte une image, donc une adresse), ni « content »,
 * ni « transform ». Une mise en forme de cahier de textes n'en a pas besoin,
 * et chacune ouvrirait un moyen de recouvrir la page.
 */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i;
const SAFE_DECLARATIONS: Record<string, RegExp> = {
  color: SAFE_COLOR,
  // « background-color » et non « background » : le second accepte une image.
  "background-color": SAFE_COLOR,
  "text-align": /^(left|right|center|justify)$/i,
};

function safeStyle(value: string): string {
  const gardees: string[] = [];
  for (const declaration of value.split(";")) {
    const separateur = declaration.indexOf(":");
    if (separateur < 0) continue;
    const propriete = declaration.slice(0, separateur).trim().toLowerCase();
    const contenu = declaration.slice(separateur + 1).trim();
    const motif = SAFE_DECLARATIONS[propriete];
    if (!motif || !motif.test(contenu)) continue;
    gardees.push(`${propriete}:${contenu}`);
  }
  return gardees.join(";");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Les attributs d'une balise, relus un par un.
 *
 * L'expression ne cherche pas à comprendre du HTML mal formé : elle relève ce
 * qui ressemble à « nom="valeur" ». Tout le reste est ignoré, ce qui est le
 * comportement voulu — un attribut illisible est un attribut absent.
 */
function readAttributes(brut: string, tag: string): string {
  const permis = ALLOWED_ATTRIBUTES[tag];
  if (!permis) return "";
  const sortie: string[] = [];
  const motif = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let trouve: RegExpExecArray | null;
  while ((trouve = motif.exec(brut))) {
    const nom = trouve[1].toLowerCase();
    if (!permis.has(nom)) continue;
    const valeur = (trouve[3] ?? trouve[4] ?? trouve[5] ?? "").trim();
    if (nom === "href") {
      if (!SAFE_PROTOCOL.test(valeur)) continue;
      // Un lien vers l'extérieur ne doit pas donner la main sur l'onglet
      // d'origine : « noopener » est ajouté systématiquement.
      sortie.push(`href="${escapeAttribute(valeur)}"`);
      sortie.push('target="_blank"', 'rel="noopener noreferrer"');
      continue;
    }
    if (nom === "style") {
      const propre = safeStyle(valeur);
      if (!propre) continue;
      sortie.push(`style="${escapeAttribute(propre)}"`);
      continue;
    }
    sortie.push(`${nom}="${escapeAttribute(valeur)}"`);
  }
  return sortie.length ? ` ${sortie.join(" ")}` : "";
}

/**
 * Reconstruit le contenu à partir de ce qui est permis.
 *
 * Les balises ouvertes non refermées le sont à la fin, dans l'ordre inverse :
 * un « <strong> » laissé ouvert par un copier-coller mettrait en gras tout le
 * reste de la page, bien au-delà du cahier de textes.
 */
export function sanitizeRichText(input: string): string {
  let html = String(input || "");
  if (!html) return "";

  // Commentaires, puis blocs à supprimer avec leur contenu. Le « ? » rend la
  // recherche non gourmande ; la variante sans fermeture coupe jusqu'à la fin,
  // pour qu'une balise ouverte et jamais close n'échappe pas au filtre.
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*$`, "gi"), "");
  }

  const pile: string[] = [];
  let sortie = "";
  const jetons = /<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let position = 0;
  let jeton: RegExpExecArray | null;

  while ((jeton = jetons.exec(html))) {
    // Le texte qui précède la balise est conservé tel quel : il provient déjà
    // du HTML, ses entités sont donc encodées et inertes.
    sortie += html.slice(position, jeton.index);
    position = jetons.lastIndex;

    const fermante = Boolean(jeton[1]);
    const tag = jeton[2].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) continue;

    if (VOID_TAGS.has(tag)) {
      if (!fermante) sortie += `<${tag}>`;
      continue;
    }

    if (fermante) {
      const rang = pile.lastIndexOf(tag);
      // Une fermeture sans ouverture correspondante est ignorée : la
      // reproduire déséquilibrerait la page qui affiche le contenu.
      if (rang < 0) continue;
      while (pile.length > rang) sortie += `</${pile.pop()}>`;
      continue;
    }

    pile.push(tag);
    sortie += `<${tag}${readAttributes(jeton[3] || "", tag)}>`;
  }

  sortie += html.slice(position);
  while (pile.length) sortie += `</${pile.pop()}>`;
  return sortie.trim();
}

/**
 * Le contenu réduit à son texte, pour les endroits où la mise en forme n'a pas
 * sa place : un aperçu de tableau, une ligne de recherche, un résumé.
 */
export function richTextToPlain(input: string): string {
  return sanitizeRichText(input)
    .replace(/<(br|hr)\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h3|h4|blockquote)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un contenu est vide s'il ne reste rien une fois la mise en forme retirée. */
export function isRichTextEmpty(input: string): boolean {
  return richTextToPlain(input).length === 0;
}

/** Coupe proprement un aperçu, sans trancher un mot en deux. */
export function richTextExcerpt(input: string, maxLength = 140): string {
  const texte = richTextToPlain(input);
  if (texte.length <= maxLength) return texte;
  const coupe = texte.slice(0, maxLength);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > maxLength * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}
