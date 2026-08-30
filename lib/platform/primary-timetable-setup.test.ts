import { describe, expect, it } from "vitest";
import type { ClassRecord } from "@/lib/class-store";
import type { PlatformWorkspace } from "@/lib/platform/types";
import { buildPrimaryTimetableSetup } from "./primary-timetable-setup";

const stamp = "2026-08-30T12:00:00.000Z";

function fixture(): { workspace: PlatformWorkspace; classes: ClassRecord[] } {
  const workspace: PlatformWorkspace = {
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
      activeAcademicYearId: "year-2026",
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
        id: "teacher-a",
        schoolId: "school-1",
        firstName: "Aline",
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
        id: "teacher-sport",
        schoolId: "school-1",
        firstName: "Serge",
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
      {
        id: "year-2026",
        schoolId: "school-1",
        label: "2026-2027",
        startsOn: "2026-09-01",
        endsOn: "2027-06-30",
        active: true,
        archived: false,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "year-old",
        schoolId: "school-1",
        label: "2025-2026",
        startsOn: "2025-09-01",
        endsOn: "2026-06-30",
        active: false,
        archived: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    periods: [],
    levels: [
      { id: "level-1", schoolId: "school-1", code: "1A", label: "1ère année", cycle: "Primaire", active: true },
    ],
    students: [],
    guardians: [],
    guardianLinks: [],
    subjects: [
      {
        id: "subject-fr",
        schoolId: "school-1",
        code: "FR",
        label: "Français",
        color: "#08734f",
        icon: "book",
        levelId: "level-1",
        coefficient: 1,
        weeklyHours: 0,
        category: "Primaire",
        bulletinOrder: 1,
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "subject-eps",
        schoolId: "school-1",
        code: "EPS",
        label: "Sport",
        color: "#08734f",
        icon: "book",
        levelId: "level-1",
        coefficient: 1,
        weeklyHours: 0,
        category: "Primaire",
        bulletinOrder: 2,
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "subject-archived",
        schoolId: "school-1",
        code: "OLD",
        label: "Ancienne matière",
        color: "#08734f",
        icon: "book",
        levelId: "level-1",
        coefficient: 1,
        weeklyHours: 1,
        category: "Primaire",
        bulletinOrder: 3,
        active: false,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    assignments: [
      {
        id: "old-year-assignment",
        schoolId: "school-1",
        academicYearId: "year-old",
        classId: "class-1",
        subjectId: "subject-fr",
        teacherId: "teacher-a",
        startsOn: "2025-09-01",
        endsOn: "2026-06-30",
        temporary: false,
        headTeacher: true,
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "unmanaged-assignment",
        schoolId: "school-1",
        academicYearId: "year-2026",
        classId: "class-1",
        subjectId: "subject-archived",
        teacherId: "teacher-a",
        startsOn: "2026-09-01",
        endsOn: "2027-06-30",
        temporary: false,
        headTeacher: true,
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    timetable: [],
    attendance: [],
    announcements: [],
    documents: [],
    migrationJournal: [],
    reportWorkflow: [],
    updatedAt: stamp,
  };

  const classes: ClassRecord[] = [
    {
      id: "class-1",
      schoolId: "school-1",
      name: "1A A",
      level: "1A",
      room: "Salle 1",
      academicYear: "2026-2027",
      mainSubject: "",
      students: [],
      updatedAt: stamp,
    },
  ];

  return { workspace, classes };
}

function ids() {
  let index = 0;
  return () => `new-${++index}`;
}

describe("buildPrimaryTimetableSetup", () => {
  it("refuse de générer les affectations si le titulaire ou les volumes manquent", () => {
    const { workspace, classes } = fixture();
    const result = buildPrimaryTimetableSetup(workspace, classes, {
      titularByClassId: {},
      weeklyHoursBySubjectId: {},
      exceptions: [],
    });

    expect(result.ready).toBe(false);
    expect(result.errors.some((item) => item.includes("titulaire non défini"))).toBe(true);
    expect(result.errors.some((item) => item.includes("volume hebdomadaire"))).toBe(true);
    expect(result.metadata).toHaveLength(0);
  });

  it("affecte le titulaire à toutes les matières et conserve une exception spécialisée", () => {
    const { workspace, classes } = fixture();
    const result = buildPrimaryTimetableSetup(
      workspace,
      classes,
      {
        titularByClassId: { "class-1": "teacher-a" },
        weeklyHoursBySubjectId: { "subject-fr": 8, "subject-eps": 2 },
        exceptions: [
          { classId: "class-1", subjectId: "subject-eps", teacherId: "teacher-sport" },
        ],
      },
      { now: stamp, makeId: ids() },
    );

    expect(result.ready).toBe(true);
    const current = result.workspace.assignments.filter(
      (item) => item.academicYearId === "year-2026" && ["subject-fr", "subject-eps"].includes(item.subjectId),
    );
    expect(current.filter((item) => item.headTeacher)).toHaveLength(2);
    expect(current.find((item) => item.subjectId === "subject-eps" && !item.headTeacher)?.teacherId).toBe("teacher-sport");
    expect(result.workspace.subjects.find((item) => item.id === "subject-fr")?.weeklyHours).toBe(8);
    expect(result.summary.exceptions).toBe(1);
  });

  it("préserve l’historique et les affectations hors du périmètre automatique", () => {
    const { workspace, classes } = fixture();
    const result = buildPrimaryTimetableSetup(
      workspace,
      classes,
      {
        titularByClassId: { "class-1": "teacher-a" },
        weeklyHoursBySubjectId: { "subject-fr": 8, "subject-eps": 2 },
        exceptions: [],
      },
      { now: stamp, makeId: ids() },
    );

    expect(result.workspace.assignments.some((item) => item.id === "old-year-assignment")).toBe(true);
    expect(result.workspace.assignments.some((item) => item.id === "unmanaged-assignment")).toBe(true);
    expect(result.metadata.some((item) => item.operation === "delete" && item.entityId === "old-year-assignment")).toBe(false);
    expect(result.metadata.some((item) => item.operation === "delete" && item.entityId === "unmanaged-assignment")).toBe(false);
  });

  it("est idempotent lorsque le même paramétrage est enregistré une seconde fois", () => {
    const { workspace, classes } = fixture();
    const input = {
      titularByClassId: { "class-1": "teacher-a" },
      weeklyHoursBySubjectId: { "subject-fr": 8, "subject-eps": 2 },
      exceptions: [
        { classId: "class-1", subjectId: "subject-eps", teacherId: "teacher-sport" },
      ],
    };
    const first = buildPrimaryTimetableSetup(workspace, classes, input, { now: stamp, makeId: ids() });
    const second = buildPrimaryTimetableSetup(first.workspace, classes, input, { now: stamp, makeId: ids() });

    expect(first.ready).toBe(true);
    expect(second.ready).toBe(true);
    expect(second.metadata).toHaveLength(0);
  });
});
