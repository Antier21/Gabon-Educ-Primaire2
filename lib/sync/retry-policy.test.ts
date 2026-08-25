import { describe, expect, it } from "vitest";
import {
  backoffDelayMs,
  classifyFailure,
  decideNextStep,
  isDue,
  MAX_AGE_DAYS,
  MAX_ATTEMPTS,
} from "./retry-policy";

const MAINTENANT = new Date("2026-08-25T10:00:00.000Z");
const RECENT = "2026-08-25T09:00:00.000Z";

describe("classification des échecs de synchronisation", () => {
  /**
   * Ces refus ne se réparent pas en attendant. Les retenter cinq fois use la
   * connexion et retarde les opérations valides qui suivent dans la file.
   */
  it.each([
    ["new row violates row-level security policy for table \"report_cards\"", "Droits insuffisants"],
    ["insert or update violates foreign key constraint (code 23503)", "donnée liée est absente"],
    ["duplicate key value violates unique constraint (code 23505)", "existe déjà"],
    ["invalid input syntax for type uuid: \"local\" (code 22P02)", "format attendu"],
    ["Niveau Supabase introuvable : CM2.", "référence nécessaire"],
    ["Votre établissement est suspendu.", "abonnement"],
  ])("reconnaît un refus définitif : %s", (message, extraitAttendu) => {
    const { kind, reason } = classifyFailure(message);
    expect(kind).toBe("permanent");
    expect(reason.toLowerCase()).toContain(extraitAttendu.toLowerCase());
  });

  it.each([
    "Failed to fetch",
    "Délai dépassé",
    "NetworkError when attempting to fetch resource",
    "Erreur de synchronisation.",
  ])("traite comme passager : %s", (message) => {
    expect(classifyFailure(message).kind).toBe("transient");
  });
});

describe("délai avant nouvelle tentative", () => {
  it("croît d’une tentative à l’autre", () => {
    const delais = [1, 2, 3, 4, 5].map(backoffDelayMs);
    expect(delais).toEqual([60_000, 300_000, 900_000, 3_600_000, 10_800_000]);
    for (let i = 1; i < delais.length; i += 1) expect(delais[i]).toBeGreaterThan(delais[i - 1]);
  });

  it("ne dépasse jamais le dernier palier, même au-delà du compte", () => {
    expect(backoffDelayMs(99)).toBe(backoffDelayMs(MAX_ATTEMPTS));
  });

  it("considère due une opération sans délai enregistré", () => {
    expect(isDue(null, MAINTENANT)).toBe(true);
    expect(isDue(undefined, MAINTENANT)).toBe(true);
  });

  it("respecte un délai encore à venir", () => {
    expect(isDue("2026-08-25T10:05:00.000Z", MAINTENANT)).toBe(false);
    expect(isDue("2026-08-25T09:55:00.000Z", MAINTENANT)).toBe(true);
  });
});

describe("décision après un échec", () => {
  it("abandonne immédiatement un refus définitif, sans user les tentatives", () => {
    const decision = decideNextStep({
      message: "new row violates row-level security policy",
      attempt: 1,
      createdAt: RECENT,
      now: MAINTENANT,
    });
    expect(decision.action).toBe("abandon");
    if (decision.action === "abandon") expect(decision.reason).toContain("Droits");
  });

  it("replanifie un échec passager au lieu de l’abandonner", () => {
    const decision = decideNextStep({
      message: "Failed to fetch",
      attempt: 1,
      createdAt: RECENT,
      now: MAINTENANT,
    });
    expect(decision.action).toBe("retry");
    if (decision.action === "retry")
      expect(new Date(decision.nextAttemptAt).getTime()).toBe(
        MAINTENANT.getTime() + 60_000,
      );
  });

  it("abandonne un échec passager une fois les tentatives épuisées", () => {
    const decision = decideNextStep({
      message: "Failed to fetch",
      attempt: MAX_ATTEMPTS,
      createdAt: RECENT,
      now: MAINTENANT,
    });
    expect(decision.action).toBe("abandon");
    if (decision.action === "abandon")
      expect(decision.reason).toContain(String(MAX_ATTEMPTS));
  });

  /**
   * Une écriture vieille d'une semaine ne décrit plus l'état voulu : la donnée
   * a pu être corrigée ou supprimée entre-temps. La rejouer ferait revivre une
   * valeur que l'établissement a délibérément écartée.
   */
  it("abandonne une opération trop ancienne, même passagère et peu tentée", () => {
    const vieille = new Date(
      MAINTENANT.getTime() - (MAX_AGE_DAYS + 1) * 24 * 3_600_000,
    ).toISOString();
    const decision = decideNextStep({
      message: "Failed to fetch",
      attempt: 1,
      createdAt: vieille,
      now: MAINTENANT,
    });
    expect(decision.action).toBe("abandon");
    if (decision.action === "abandon") expect(decision.reason).toContain("ancienne");
  });

  it("conserve le message d’origine dans tous les cas", () => {
    const message = "insert or update violates foreign key constraint";
    const decision = decideNextStep({
      message,
      attempt: 2,
      createdAt: RECENT,
      now: MAINTENANT,
    });
    expect(decision.lastError).toBe(message);
  });
});
