import { describe, expect, it, vi } from "vitest";
import { storageModeLabel, withTimeout } from "./storage-mode";

describe("stockage hybride", () => {
  it("affiche des libellés français explicites", () => {
    expect(storageModeLabel("cloud")).toBe("Supabase");
    expect(storageModeLabel("demo")).toBe("Démonstration locale");
    expect(storageModeLabel("offline")).toBe("Hors ligne temporaire");
  });

  it("interrompt un appel réseau trop lent", async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<string>(() => undefined), 20);
    const rejection = expect(result).rejects.toThrow("trop de temps");
    await vi.advanceTimersByTimeAsync(21);
    await rejection;
    vi.useRealTimers();
  });
});
