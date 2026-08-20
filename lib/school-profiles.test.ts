import { describe, expect, it } from "vitest";
import { filterLevelsForSchoolType, getDefaultLevelsForSchoolType, getDefaultSubjectsForLevel, isLevelAllowedForSchoolType, isPreschoolLevel, normalizeSchoolLevel, PRESCHOOL_LEARNING_DOMAINS, SCHOOL_PROFILE_OPTIONS } from "./school-profiles";
import { PRODUCT_EDITION, productAllowsSchoolType } from "./product-edition";

describe("school profile integrity", () => {
  it("keeps the primary list separate and unifies all secondary levels", () => {
    expect(getDefaultLevelsForSchoolType("primary")).toEqual(["Petite Section","Moyenne Section","Grande Section","1ère Année","2e Année","3e Année","4e Année","5e Année"]);
    if (PRODUCT_EDITION === "secondary") {
      expect(getDefaultLevelsForSchoolType("middle_school")).toEqual(["6e","5e","4e","3e","2nde","1re","Terminale"]);
      expect(getDefaultLevelsForSchoolType("high_school")).toEqual(["6e","5e","4e","3e","2nde","1re","Terminale"]);
      expect(isLevelAllowedForSchoolType("3e","high_school")).toBe(true);
    } else {
      expect(getDefaultLevelsForSchoolType("middle_school")).toEqual(["6e","5e","4e","3e"]);
      expect(getDefaultLevelsForSchoolType("high_school")).toEqual(["2nde","1re","Terminale"]);
      expect(isLevelAllowedForSchoolType("3e","high_school")).toBe(false);
    }
    expect(isLevelAllowedForSchoolType("6e Année","high_school")).toBe(false);
    expect(isLevelAllowedForSchoolType("CM2","primary")).toBe(true);
    expect(isLevelAllowedForSchoolType("2nde","high_school")).toBe(true);
  });
  it("normalizes common aliases", () => {
    expect(normalizeSchoolLevel("PS")).toBe("Petite Section");
    expect(normalizeSchoolLevel("moyenne section")).toBe("Moyenne Section");
    expect(normalizeSchoolLevel("6ème")).toBe("6e");
    expect(normalizeSchoolLevel("Seconde")).toBe("2nde");
    expect(normalizeSchoolLevel("TLE")).toBe("Terminale");
  });
  it("réserve les domaines et l’évaluation de maîtrise aux sections maternelles", () => {
    expect(isPreschoolLevel("PS")).toBe(true);
    expect(isPreschoolLevel("Grande Section")).toBe(true);
    expect(isPreschoolLevel("1ère Année")).toBe(false);
    expect(getDefaultSubjectsForLevel("Moyenne Section")).toEqual([...PRESCHOOL_LEARNING_DOMAINS]);
    expect(getDefaultSubjectsForLevel("2e Année")).not.toContain("Langage et communication");
  });
  it("deduplicates configured levels", () => {
    const levels=[{code:"6e"},{code:"6ème"},{code:"CM2"},{code:"5e"}];
    expect(filterLevelsForSchoolType(levels,"middle_school").map(x=>normalizeSchoolLevel(x.code))).toEqual(["6e","5e"]);
  });
  it("exposes only profiles compatible with the product edition", () => {
    expect(SCHOOL_PROFILE_OPTIONS).toHaveLength(1);
    expect(SCHOOL_PROFILE_OPTIONS.every((profile) => productAllowsSchoolType(profile.schoolType))).toBe(true);
    if (PRODUCT_EDITION === "primary") {
      expect(SCHOOL_PROFILE_OPTIONS[0].label).toBe("Maternelle et primaire");
      expect(SCHOOL_PROFILE_OPTIONS.some((profile) => profile.schoolType === "primary")).toBe(true);
      expect(SCHOOL_PROFILE_OPTIONS.some((profile) => profile.schoolType === "middle_school")).toBe(false);
    } else {
      expect(SCHOOL_PROFILE_OPTIONS[0].label).toBe("Secondaire");
      expect(SCHOOL_PROFILE_OPTIONS.some((profile) => profile.schoolType === "primary")).toBe(false);
      expect(getDefaultLevelsForSchoolType("complex_school")).toEqual(["6e","5e","4e","3e","2nde","1re","Terminale"]);
    }
  });
});
