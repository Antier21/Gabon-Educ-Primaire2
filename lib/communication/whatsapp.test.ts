import { describe, expect, it } from "vitest";
import { channelToStore } from "./store";
import {
  buildSmsLink,
  buildWhatsAppLink,
  isPhoneUsable,
  mergeMessage,
  normalizePhone,
} from "./whatsapp";

describe("normalizePhone", () => {
  it("ramène les écritures courantes des parents au format international", () => {
    // Les mêmes huit chiffres, notés de quatre façons différentes.
    expect(normalizePhone("077 12 34 56")).toBe("24177123456");
    expect(normalizePhone("+241 77 12 34 56")).toBe("24177123456");
    expect(normalizePhone("0024177123456")).toBe("24177123456");
    expect(normalizePhone("77-12-34-56")).toBe("24177123456");
  });

  it("rend une chaîne vide quand il n’y a aucun chiffre", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("à demander")).toBe("");
  });
});

describe("isPhoneUsable", () => {
  it("accepte un numéro gabonais complet", () => {
    expect(isPhoneUsable("077 12 34 56")).toBe(true);
  });

  it("refuse un numéro tronqué", () => {
    expect(isPhoneUsable("077 12")).toBe(false);
    expect(isPhoneUsable("")).toBe(false);
  });
});

describe("liens d’envoi", () => {
  it("compose le lien SMS avec le numéro international et le corps encodé", () => {
    expect(buildSmsLink("077 12 34 56", "Bonjour & merci")).toBe(
      "sms:+24177123456?body=Bonjour%20%26%20merci",
    );
  });

  it("compose le lien WhatsApp sur le même numéro", () => {
    expect(buildWhatsAppLink("077 12 34 56", "Bonjour")).toBe(
      "https://api.whatsapp.com/send?phone=24177123456&text=Bonjour",
    );
  });

  it("vise le même parent par les deux canaux", () => {
    // Le repli SMS ne doit jamais joindre quelqu'un d'autre que WhatsApp.
    const brut = "+241 77 12 34 56";
    expect(buildSmsLink(brut, "x")).toContain(normalizePhone(brut));
    expect(buildWhatsAppLink(brut, "x")).toContain(normalizePhone(brut));
  });
});

describe("mergeMessage", () => {
  it("remplace les variables connues", () => {
    expect(
      mergeMessage("Bonjour {parent}, au sujet de {eleve} en {classe}.", {
        parent: "M. NDONG",
        eleve: "Chanceline",
        classe: "5e A",
      }),
    ).toBe("Bonjour M. NDONG, au sujet de Chanceline en 5e A.");
  });

  it("laisse une variable inconnue visible plutôt que de la vider", () => {
    // Un message visiblement incomplet vaut mieux qu'un message amputé que
    // personne ne remarque avant qu'il ne soit parti.
    expect(mergeMessage("Bonjour {inconnu}.", { parent: "x" })).toBe("Bonjour {inconnu}.");
  });
});

describe("channelToStore", () => {
  it("retient le canal employé sur un envoi", () => {
    expect(channelToStore("sent", "sms")).toBe("sms");
    expect(channelToStore("sent", "whatsapp")).toBe("whatsapp");
  });

  it("traite un envoi sans canal déclaré comme un envoi fait à la main", () => {
    expect(channelToStore("sent", "")).toBe("manual");
  });

  it("oublie le canal dès que la ligne n’est plus un envoi", () => {
    // Sinon une ligne reprise garderait la trace d'un envoi qui n'a pas eu lieu.
    expect(channelToStore("pending", "sms")).toBeNull();
    expect(channelToStore("skipped", "whatsapp")).toBeNull();
    expect(channelToStore("failed", "sms")).toBeNull();
  });
});
