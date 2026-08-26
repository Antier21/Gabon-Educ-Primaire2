import { describe, expect, it } from "vitest";
import {
  isRichTextEmpty,
  richTextExcerpt,
  richTextToPlain,
  sanitizeRichText,
} from "./rich-text";

describe("sanitizeRichText — ce qui doit passer", () => {
  it("garde la mise en forme que l’éditeur produit", () => {
    const html =
      "<p>La <strong>phrase simple</strong> et ses <em>constituants</em>.</p>" +
      "<ul><li>Sujet</li><li>Verbe</li></ul><h3>Exercice</h3>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("garde une couleur de texte", () => {
    expect(sanitizeRichText('<span style="color:#08734f">important</span>')).toBe(
      '<span style="color:#08734f">important</span>',
    );
  });

  it("garde un lien http et le rend sûr", () => {
    const sortie = sanitizeRichText('<a href="https://jw.org">source</a>');
    expect(sortie).toContain('href="https://jw.org"');
    expect(sortie).toContain('rel="noopener noreferrer"');
  });
});

describe("sanitizeRichText — ce qui doit disparaître", () => {
  it("supprime un script avec son contenu", () => {
    expect(sanitizeRichText('<p>Bonjour</p><script>voler()</script>')).toBe("<p>Bonjour</p>");
  });

  it("supprime un script jamais refermé", () => {
    // Une balise ouverte sans fermeture ne doit pas échapper au filtre en
    // s'appuyant sur l'absence de « </script> ».
    expect(sanitizeRichText('<p>Bonjour</p><script>voler()')).toBe("<p>Bonjour</p>");
  });

  it("supprime les gestionnaires d’événement", () => {
    expect(sanitizeRichText('<p onclick="voler()">Texte</p>')).toBe("<p>Texte</p>");
    expect(sanitizeRichText('<span onmouseover="voler()" style="color:red">x</span>')).toBe(
      '<span style="color:red">x</span>',
    );
  });

  it("refuse un lien « javascript: » et « data: »", () => {
    expect(sanitizeRichText('<a href="javascript:voler()">clic</a>')).toBe("<a>clic</a>");
    expect(sanitizeRichText('<a href="data:text/html,<script>x</script>">clic</a>')).not.toContain(
      "data:",
    );
  });

  it("refuse un style qui n’est pas une couleur", () => {
    expect(
      sanitizeRichText('<span style="position:fixed;top:0;background:url(x)">x</span>'),
    ).toBe("<span>x</span>");
  });

  it("supprime les balises inconnues en gardant leur texte", () => {
    expect(sanitizeRichText("<marquee>Texte</marquee>")).toBe("Texte");
    expect(sanitizeRichText('<img src="x" onerror="voler()">Texte')).toBe("Texte");
    expect(sanitizeRichText("<iframe src=\"https://ailleurs\"></iframe>Texte")).toBe("Texte");
  });

  it("n’est pas trompé par la casse ni les espaces", () => {
    expect(sanitizeRichText('<ScRiPt >voler()</ScRiPt>')).toBe("");
    expect(sanitizeRichText('< img src=x onerror=voler()>Texte')).toBe("Texte");
  });

  it("laisse inertes les entités déjà encodées", () => {
    // « &lt;script&gt; » est du texte, pas une balise : il doit rester lisible.
    expect(sanitizeRichText("<p>&lt;script&gt;</p>")).toBe("<p>&lt;script&gt;</p>");
  });
});

describe("sanitizeRichText — équilibre des balises", () => {
  it("referme ce qu’un copier-coller a laissé ouvert", () => {
    // Sans cela, le gras déborderait sur tout le reste de la page.
    expect(sanitizeRichText("<p><strong>Titre")).toBe("<p><strong>Titre</strong></p>");
  });

  it("ignore une fermeture sans ouverture", () => {
    expect(sanitizeRichText("Texte</strong></p>")).toBe("Texte");
  });

  it("referme les balises intermédiaires laissées ouvertes", () => {
    expect(sanitizeRichText("<p><em>a</p>")).toBe("<p><em>a</em></p>");
  });

  it("est stable : filtrer deux fois donne le même résultat", () => {
    // Le filtre s'applique à l'écriture ET à l'affichage : il doit être
    // idempotent, sinon le contenu se dégraderait à chaque passage.
    const sale = '<p onclick="x"><strong>a<script>b</script>';
    expect(sanitizeRichText(sanitizeRichText(sale))).toBe(sanitizeRichText(sale));
  });

  it("ne casse pas sur une entrée vide ou absurde", () => {
    expect(sanitizeRichText("")).toBe("");
    expect(sanitizeRichText("<<<>>>")).toBe("<<<>>>");
    expect(sanitizeRichText("<p")).toBe("<p");
  });
});

describe("richTextToPlain", () => {
  it("rend le texte seul, espaces normalisés", () => {
    expect(richTextToPlain("<p>La <strong>phrase</strong></p><ul><li>Sujet</li></ul>")).toBe(
      "La phrase Sujet",
    );
  });

  it("reconnaît un contenu vide de toute substance", () => {
    expect(isRichTextEmpty("<p><br></p>")).toBe(true);
    expect(isRichTextEmpty("<p>  </p>")).toBe(true);
    expect(isRichTextEmpty("<p>a</p>")).toBe(false);
  });
});

describe("richTextExcerpt", () => {
  it("laisse un texte court intact", () => {
    expect(richTextExcerpt("<p>Court</p>")).toBe("Court");
  });

  it("coupe sans trancher un mot", () => {
    const long = `<p>${"notion ".repeat(40)}</p>`;
    const extrait = richTextExcerpt(long, 40);
    expect(extrait.length).toBeLessThanOrEqual(41);
    expect(extrait.endsWith("…")).toBe(true);
    expect(extrait).not.toContain("noti…");
  });
});
