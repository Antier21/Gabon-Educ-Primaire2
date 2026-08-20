import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("formulaires asynchrones", () => {
  it("n’utilise plus event.currentTarget.reset après un await", () => {
    const files = [
      "components/platform/PlatformManager.tsx",
      "components/GradebookManager.tsx",
      "components/PersonnelManager.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toContain("event.currentTarget.reset()");
    }
  });
  it("conserve une référence stable dans les vues corrigées", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/platform/PlatformManager.tsx"),
      "utf8",
    );
    expect(
      source.match(/const form = event\.currentTarget/g)?.length || 0,
    ).toBeGreaterThanOrEqual(7);
    expect(source).toContain("form.reset()");
  });
  it("conserve aussi le formulaire du personnel avant l’appel Supabase", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/PersonnelManager.tsx"),
      "utf8",
    );
    expect(source).toContain("const form=e.currentTarget");
    expect(source).toContain("form.reset()");
  });
});
