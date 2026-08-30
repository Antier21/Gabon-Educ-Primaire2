import { describe, expect, it } from "vitest";
import {
  mapRemoteSchoolSubjects,
  mergeSchoolSubjectsForCache,
} from "./edt-subject-catalog";
import type { SchoolSubject } from "./types";

function subject(partial: Partial<SchoolSubject>): SchoolSubject {
  return {
    id: "subject",
    schoolId: "school-a",
    code: "MAT",
    label: "Mathématiques",
    color: "",
    icon: "",
    levelId: "",
    coefficient: 1,
    weeklyHours: 5,
    category: "",
    bulletinOrder: 1,
    active: true,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("catalogue matières EDT", () => {
  it("convertit les colonnes school_subjects vers le modèle de l’application", () => {
    const [mapped] = mapRemoteSchoolSubjects([
      {
        id: "remote-1",
        school_id: "school-a",
        code: "INFO",
        label: "Informatique / TIC",
        school_level_id: "level-5",
        coefficient: 2,
        weekly_hours: 1,
        bulletin_order: 9,
        is_active: true,
      },
    ]);

    expect(mapped).toMatchObject({
      id: "remote-1",
      schoolId: "school-a",
      code: "INFO",
      label: "Informatique / TIC",
      levelId: "level-5",
      coefficient: 2,
      weeklyHours: 1,
      bulletinOrder: 9,
      active: true,
    });
  });

  it("remplace le catalogue local de l’établissement actif par les identifiants Supabase", () => {
    const current = [
      subject({ id: "local-old", schoolId: "school-a" }),
      subject({ id: "other-school", schoolId: "school-b", code: "FRA", label: "Français" }),
    ];
    const remote = [subject({ id: "remote-real", schoolId: "school-a" })];

    const merged = mergeSchoolSubjectsForCache(current, remote, "school-a");

    expect(merged.map((item) => item.id)).toEqual(["remote-real", "other-school"]);
  });

  it("conserve le cache quand Supabase ne renvoie aucune matière", () => {
    const current = [subject({ id: "local-only" })];
    expect(mergeSchoolSubjectsForCache(current, [], "school-a")).toBe(current);
  });
});
