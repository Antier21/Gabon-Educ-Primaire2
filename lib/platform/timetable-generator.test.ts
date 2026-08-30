import { describe, expect, it } from "vitest";
import type { ClassRecord } from "@/lib/class-store";
import type { PlatformWorkspace } from "@/lib/platform/types";
import { generateMissingTimetable, inspectTimetableGeneration } from "./timetable-generator";

const stamp = "2026-08-30T12:00:00.000Z";

function workspace(): PlatformWorkspace {
  return {
    school: {
      id: "school-1",
      name: "École test",
      acronym: "ET",
      schoolType: "primary",
      schoolSector: "private",
      registrationNumber: "",
      province: "Estuaire",
      city: "Libreville",
      district: "",
      neighborhood: "",
      address: "",
      phone: "",
      email: "",
      website: "",
      logoUrl: "",
      stampUrl: "",
      headName: "",
      motto: "",
      activeAcademicYearId: "year-current",
      periodSystem: "trimester",
      maxScore: 20,
      passThreshold: 10,
      bulletinModel: "",
      timezone: "Africa/Libreville",
      language: "fr",
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
    },
    users: [
      {
        id: "titular-current",
        schoolId: "school-1",
        firstName: "Tina",
        lastName: "Titulaire",
        email: "",
        phone: "",
        role: "teacher",
        status: "active",
        scopeClassIds: ["class-1"],
        invitationStatus: "accepted",
        invitedAt: stamp,
        expiresAt: "",
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "specialist-old",
        schoolId: "school-1",
        firstName: "Ancien",
        lastName: "Sport",
        email: "",
        phone: "",
        role: "teacher",
        status: "active",
        scopeClassIds: [],
        invitationStatus: "accepted",
        invitedAt: stamp,
        expiresAt: "",
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    academicYears: [
      { id: "year-current", schoolId: "school-1", label: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-06-30", active: true, archived: false, createdAt: stamp, updatedAt: stamp },
      { id: "year-old", schoolId: "school-1", label: "2025-2026", startsOn: "2025-09-01", endsOn: "2026-06-30", active: false, archived: true, createdAt: stamp, updatedAt: stamp },
    ],
    periods: [],
    levels: [{ id: "level-1", schoolId: "school-1", code: "1A", label: "1ère année", cycle: "Primaire", active: true }],
    students: [],
    guardians: [],
    guardianLinks: [],
    subjects: [
      { id: "sport", schoolId: "school-1", code: "EPS", label: "Sport", color: "#08734f", icon: "book", levelId: "level-1", coefficient: 1, weeklyHours: 1, category: "Primaire", bulletinOrder: 1, active: true, createdAt: stamp, updatedAt: stamp },
    ],
    assignments: [
      { id: "current", schoolId: "school-1", academicYearId: "year-current", classId: "class-1", subjectId: "sport", teacherId: "titular-current", startsOn: "2026-09-01", endsOn: "2027-06-30", temporary: false, headTeacher: true, active: true, createdAt: stamp, updatedAt: stamp },
      { id: "old-exception", schoolId: "school-1", academicYearId: "year-old", classId: "class-1", subjectId: "sport", teacherId: "specialist-old", startsOn: "2025-09-01", endsOn: "2026-06-30", temporary: false, headTeacher: false, active: true, createdAt: stamp, updatedAt: stamp },
    ],
    timetable: [],
    attendance: [],
    announcements: [],
    documents: [],
    migrationJournal: [],
    reportWorkflow: [],
    updatedAt: stamp,
  };
}

const classes: ClassRecord[] = [
  { id: "class-1", schoolId: "school-1", name: "1A A", level: "1A", room: "Salle 1", academicYear: "2026-2027", mainSubject: "", students: [], updatedAt: stamp },
];

describe("génération EDT par année scolaire", () => {
  it("ignore une ancienne exception pédagogique lors de la génération actuelle", () => {
    const current = workspace();
    const check = inspectTimetableGeneration(current, classes);
    expect(check.ready).toBe(true);
    expect(check.assignmentCount).toBe(1);

    const generated = generateMissingTimetable(current, classes);
    expect(generated.slots).toHaveLength(1);
    expect(generated.slots[0].teacherId).toBe("titular-current");
    expect(generated.slots[0].academicYearId).toBe("year-current");
  });

  it("respecte la plage de jours choisie pour la génération primaire", () => {
    const generated = generateMissingTimetable(workspace(), classes, {
      weekdays: [1, 2, 3, 4, 5],
      startsAt: "07:30",
      endsAt: "12:25",
    });

    expect(generated.slots).toHaveLength(1);
    expect(generated.slots[0].weekday).toBeGreaterThanOrEqual(1);
    expect(generated.slots[0].weekday).toBeLessThanOrEqual(5);
    expect(generated.slots[0].startsAt).toBeGreaterThanOrEqual("07:30");
    expect(generated.slots[0].endsAt).toBeLessThanOrEqual("12:25");
  });

  it("bloque une configuration dont la capacité hebdomadaire est insuffisante", () => {
    const current = workspace();
    current.subjects[0] = { ...current.subjects[0], weeklyHours: 3 };

    const check = inspectTimetableGeneration(current, classes, {
      weekdays: [1],
      startsAt: "07:30",
      endsAt: "09:20",
    });

    expect(check.ready).toBe(false);
    expect(check.blockers.some((item) => item.includes("n’en offre que 2"))).toBe(true);
  });
});
