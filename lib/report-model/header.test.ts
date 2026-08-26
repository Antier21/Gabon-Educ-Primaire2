import { describe, expect, it } from "vitest";
import { headerFromSettings, MINISTRY_LINE, suggestHeaderSettings } from "./header";

describe("suggestHeaderSettings", () => {
  it("accorde l’article de chaque province", () => {
    expect(suggestHeaderSettings({ province: "Estuaire" }).authority2).toBe(
      "Direction d’Académie Provinciale de l’Estuaire",
    );
    expect(suggestHeaderSettings({ province: "Haut-Ogooué" }).authority2).toBe(
      "Direction d’Académie Provinciale du Haut-Ogooué",
    );
    expect(suggestHeaderSettings({ province: "Ngounié" }).authority2).toBe(
      "Direction d’Académie Provinciale de la Ngounié",
    );
  });

  it("reconnaît la province écrite sans accent ni majuscule", () => {
    expect(suggestHeaderSettings({ province: "haut-ogooue" }).authority2).toBe(
      "Direction d’Académie Provinciale du haut-ogooue",
    );
  });

  it("ne suggère rien quand l’établissement n’a pas renseigné sa province", () => {
    const suggestion = suggestHeaderSettings({});
    expect(suggestion.authority1).toBe(MINISTRY_LINE);
    expect(suggestion.authority2).toBe("");
    expect(suggestion.authority3).toBe("");
  });

  it("propose la circonscription à partir de la ville", () => {
    expect(suggestHeaderSettings({ city: "Libreville-Est" }).authority3).toBe(
      "Circonscription Scolaire Libreville-Est",
    );
  });
});

describe("headerFromSettings", () => {
  const settings = {
    authority1: MINISTRY_LINE,
    authority2: "Académie",
    authority3: "Circonscription",
    subtitle1: "Établissement privé laïc",
    subtitle2: "",
    showLogo: true,
  };

  it("retire le logo quand l’établissement l’a désactivé", () => {
    const header = headerFromSettings(
      { ...settings, showLogo: false },
      { name: "Lycée", logoUrl: "https://exemple/logo.png" },
    );
    expect(header.logoUrl).toBe("");
    expect(header.schoolName).toBe("Lycée");
  });

  it("garde le logo quand il est activé", () => {
    const header = headerFromSettings(settings, {
      name: "Lycée",
      logoUrl: "https://exemple/logo.png",
    });
    expect(header.logoUrl).toBe("https://exemple/logo.png");
    expect(header.subtitle1).toBe("Établissement privé laïc");
  });
});
