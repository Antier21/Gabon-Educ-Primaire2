import { describe, expect, it } from "vitest";
import { buildGroupShareLink, groupBody, groupSendVerdict } from "./groups";

describe("groupSendVerdict", () => {
  const collectif = {
    body: "Chers parents de la {classe}, la réunion aura lieu samedi à 9h. La direction du {etablissement}.",
    audienceKind: "class" as const,
    category: "reunion",
  };

  it("autorise une annonce collective adressée à une classe", () => {
    expect(groupSendVerdict(collectif)).toEqual({ allowed: true, reason: "" });
  });

  it("refuse un message qui nomme l’élève", () => {
    const verdict = groupSendVerdict({ ...collectif, body: "Bonjour, {eleve} est absent aujourd’hui." });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("{eleve}");
    expect(verdict.reason).toContain("parent par parent");
  });

  it("refuse un message qui nomme le parent", () => {
    expect(groupSendVerdict({ ...collectif, body: "Bonjour {parent}, merci de passer." }).allowed).toBe(
      false,
    );
  });

  it("refuse un impayé, une convocation ou une absence même sans variable", () => {
    // Rédigés en toutes lettres, ces messages ne portent aucune variable — et
    // n'en concernent pas moins une seule famille.
    for (const category of ["paiement", "convocation", "absence"]) {
      const verdict = groupSendVerdict({
        body: "Merci de régulariser la situation avant vendredi.",
        audienceKind: "class",
        category,
      });
      expect(verdict.allowed, category).toBe(false);
    }
  });

  it("refuse quand des élèves ont été choisis un par un", () => {
    const verdict = groupSendVerdict({ ...collectif, audienceKind: "students" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("les autres familles");
  });

  it("refuse un niveau entier, qui réunit plusieurs groupes", () => {
    const verdict = groupSendVerdict({ ...collectif, audienceKind: "level" });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("plusieurs classes");
  });

  it("laisse passer les variables collectives", () => {
    // « classe » et « etablissement » ne nomment personne.
    expect(
      groupSendVerdict({
        body: "La {classe} du {etablissement} ne fera pas cours lundi.",
        audienceKind: "class",
        category: "general",
      }).allowed,
    ).toBe(true);
  });

  it("ne se laisse pas prendre par une catégorie en majuscules", () => {
    expect(
      groupSendVerdict({ body: "Merci de régulariser.", audienceKind: "class", category: "PAIEMENT" })
        .allowed,
    ).toBe(false);
  });
});

describe("groupBody", () => {
  it("remplace les variables collectives", () => {
    expect(
      groupBody("Parents de la {classe} — {etablissement}", {
        className: "5e Année A",
        schoolName: "Lycée Privé Mbélé",
      }),
    ).toBe("Parents de la 5e Année A — Lycée Privé Mbélé");
  });

  it("remplace toutes les occurrences, pas seulement la première", () => {
    expect(groupBody("{classe} et {classe}", { className: "6e B", schoolName: "" })).toBe(
      "6e B et 6e B",
    );
  });
});

describe("buildGroupShareLink", () => {
  it("ouvre WhatsApp sans destinataire, message encodé", () => {
    expect(buildGroupShareLink("Réunion samedi & dimanche")).toBe(
      "https://api.whatsapp.com/send?text=R%C3%A9union%20samedi%20%26%20dimanche",
    );
  });

  it("ne porte aucun numéro : c’est le sélecteur de WhatsApp qui choisit", () => {
    expect(buildGroupShareLink("x")).not.toContain("phone=");
  });
});
