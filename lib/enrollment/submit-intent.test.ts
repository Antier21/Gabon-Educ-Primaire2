import { describe, expect, it } from "vitest";
import { resolveEnrollmentSubmitIntent } from "./submit-intent";

describe("intention du formulaire d'inscription", () => {
  it("reconnaît le bouton de validation et de création du dossier élève", () => {
    expect(resolveEnrollmentSubmitIntent({ name: "intent", value: "validate" })).toBe("validate");
  });

  it("conserve le brouillon pour le bouton Enregistrer ou la touche Entrée", () => {
    expect(resolveEnrollmentSubmitIntent({ name: "intent", value: "draft" })).toBe("draft");
    expect(resolveEnrollmentSubmitIntent(null)).toBe("draft");
  });
});
