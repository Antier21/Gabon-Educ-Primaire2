import { describe, expect, it } from "vitest";
import {
  cleanContact,
  isUnchanged,
  normalizePhone,
  validateContact,
  type GuardianContact,
} from "./contact";

function contact(partial: Partial<GuardianContact> = {}): GuardianContact {
  return { phone: "077037707", email: "", address: "", ...partial };
}

describe("normalisation du numéro", () => {
  /**
   * Ces trois écritures désignent la même ligne. Sans normalisation, les
   * envois WhatsApp partiraient vers un numéro que l'opérateur ne reconnaît
   * pas, et échoueraient sans que personne ne s'en aperçoive.
   */
  it("ramène les écritures courantes à la même forme", () => {
    expect(normalizePhone("077 03 77 07")).toBe("077037707");
    expect(normalizePhone("077-03-77-07")).toBe("077037707");
    expect(normalizePhone("(077) 03 77 07")).toBe("077037707");
  });

  it("conserve l’indicatif international", () => {
    expect(normalizePhone("+241 77 03 77 07")).toBe("+24177037707");
  });

  it("supporte une saisie vide sans échouer", () => {
    expect(normalizePhone("")).toBe("");
  });
});

describe("validation des coordonnées", () => {
  it("accepte un numéro gabonais complet", () => {
    expect(validateContact(contact({ phone: "077 03 77 07" }))).toBe("");
  });

  it("refuse un numéro trop court, en disant pourquoi", () => {
    const message = validateContact(contact({ phone: "0770" }));
    expect(message).toContain("8 chiffres");
  });

  /** L'indicatif n'est pas un chiffre du numéro : « +241 » ne doit pas compter. */
  it("ne compte pas l’indicatif comme des chiffres du numéro", () => {
    expect(validateContact(contact({ phone: "+241" }))).toContain("8 chiffres");
  });

  it("laisse l’adresse électronique facultative", () => {
    expect(validateContact(contact({ email: "" }))).toBe("");
    expect(validateContact(contact({ email: "   " }))).toBe("");
  });

  it("refuse une adresse électronique mal formée", () => {
    expect(validateContact(contact({ email: "parent@" }))).toContain("valide");
    expect(validateContact(contact({ email: "parent.example.com" }))).toContain("valide");
  });

  it("accepte une adresse électronique correcte", () => {
    expect(validateContact(contact({ email: "parent@exemple.ga" }))).toBe("");
  });
});

describe("préparation avant enregistrement", () => {
  it("retire les espaces autour des champs libres", () => {
    const cleaned = cleanContact(contact({ email: "  parent@exemple.ga ", address: " Akanda " }));
    expect(cleaned.email).toBe("parent@exemple.ga");
    expect(cleaned.address).toBe("Akanda");
  });

  /**
   * Enregistrer une fiche identique ferait avancer sa date de mise à jour et
   * la ferait remonter comme « récemment modifiée » au secrétariat, pour rien.
   */
  it("reconnaît une fiche inchangée malgré une mise en forme différente", () => {
    expect(
      isUnchanged(
        contact({ phone: "077 03 77 07", address: "Akanda " }),
        contact({ phone: "077-03-77-07", address: "Akanda" }),
      ),
    ).toBe(true);
  });

  it("détecte un vrai changement de numéro", () => {
    expect(isUnchanged(contact({ phone: "077037707" }), contact({ phone: "066037707" }))).toBe(
      false,
    );
  });
});
