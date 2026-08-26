import { describe, expect, it } from "vitest";
import {
  isRichTextEmpty,
  plainToRichText,
  richTextExcerpt,
  richTextToLines,
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

describe("sanitizeRichText — la barre étendue", () => {
  it("garde l’alignement d’un bloc", () => {
    expect(sanitizeRichText('<p style="text-align:center">Titre</p>')).toBe(
      '<p style="text-align:center">Titre</p>',
    );
  });

  it("garde le surlignage et la couleur ensemble", () => {
    expect(
      sanitizeRichText('<span style="color:#111;background-color:#fde68a">clé</span>'),
    ).toBe('<span style="color:#111;background-color:#fde68a">clé</span>');
  });

  it("garde exposant, indice et trait horizontal", () => {
    expect(sanitizeRichText("<p>m<sup>2</sup> et H<sub>2</sub>O</p><hr>")).toBe(
      "<p>m<sup>2</sup> et H<sub>2</sub>O</p><hr>",
    );
  });

  it("trie déclaration par déclaration au lieu de tout accepter ou tout rejeter", () => {
    // C'est le cœur de la règle : « color » survit, « position » disparaît,
    // dans la même chaîne de style.
    expect(
      sanitizeRichText('<p style="color:red;position:fixed;top:0">Texte</p>'),
    ).toBe('<p style="color:red">Texte</p>');
  });

  it("refuse « background » qui accepterait une image", () => {
    // « background-color » est permis, « background » ne l'est pas : le second
    // accepte une adresse, donc un moyen de charger autre chose.
    expect(sanitizeRichText('<p style="background:url(https://x)">T</p>')).toBe("<p>T</p>");
  });

  it("refuse un alignement inventé", () => {
    expect(sanitizeRichText('<p style="text-align:expression(1)">T</p>')).toBe("<p>T</p>");
  });

  it("retire un style vidé de toute déclaration admise", () => {
    expect(sanitizeRichText('<p style="z-index:9;opacity:0">T</p>')).toBe("<p>T</p>");
  });
});

describe("plainToRichText / richTextToLines — l’aller-retour du travail à effectuer", () => {
  it("rend exactement ce qui a été écrit", () => {
    const saisi = "Exercices 4 et 5 page 87.\nApprendre la leçon.";
    expect(richTextToLines(plainToRichText(saisi))).toBe(saisi);
  });

  it("produit des paragraphes, un par ligne", () => {
    expect(plainToRichText("Un\nDeux")).toBe("<p>Un</p><p>Deux</p>");
  });

  it("ignore les lignes vides et les espaces de bord", () => {
    expect(plainToRichText("  Un  \n\n\n  Deux ")).toBe("<p>Un</p><p>Deux</p>");
    expect(plainToRichText("   ")).toBe("");
    expect(plainToRichText("")).toBe("");
  });

  it("n’interprète rien de ce que l’enseignant tape", () => {
    // Une consigne peut légitimement contenir « < » : « x < 10 ». Elle doit
    // rester du texte, et se relire telle quelle.
    const saisi = "Résoudre x < 10 & y > 2";
    expect(plainToRichText(saisi)).toBe("<p>Résoudre x &lt; 10 &amp; y &gt; 2</p>");
    expect(richTextToLines(plainToRichText(saisi))).toBe(saisi);
  });

  it("ne laisse pas « &amp;lt; » redevenir une balise", () => {
    // Le décodage de « &amp; » doit venir en dernier : dans l'autre ordre,
    // « &amp;lt;script&amp;gt; » se retransformerait en balise.
    expect(richTextToLines("<p>&amp;lt;script&amp;gt;</p>")).toBe("&lt;script&gt;");
  });

  it("garde les lignes séparées, là où l’aperçu les écrase", () => {
    const html = "<p>Un</p><p>Deux</p>";
    expect(richTextToLines(html)).toBe("Un\nDeux");
    expect(richTextToPlain(html)).toBe("Un Deux");
  });

  it("rend leurs lignes à une liste et à des sauts", () => {
    expect(richTextToLines("<ul><li>Un</li><li>Deux</li></ul>")).toBe("Un\nDeux");
    expect(richTextToLines("<p>Un<br>Deux</p>")).toBe("Un\nDeux");
  });

  it("filtre ce qui viendrait d’ailleurs", () => {
    expect(richTextToLines('<p>Devoir</p><script>voler()</script>')).toBe("Devoir");
  });

  it("est stable : relire puis réécrire ne dégrade pas", () => {
    const saisi = "Lecture pages 12 à 14.\nRésumé en dix lignes.";
    const unTour = richTextToLines(plainToRichText(saisi));
    expect(richTextToLines(plainToRichText(unTour))).toBe(unTour);
  });
});
