import { describe, expect, it, vi } from "vitest";
import {
  assessmentAverage,
  buildReportCardSnapshot,
  findReportStudent,
  classStatistics,
  normalizedScore,
  rankValues,
  roundTo,
  studentSubjectAverage,
  weightedGeneralAverage,
} from "./calculations";

describe("findReportStudent", () => {
  const students = [
    { id: "student-a", firstName: "A", lastName: "Test" },
  ];

  it("renvoie null pendant la transition vers une classe sans l’élève précédent", () => {
    expect(findReportStudent(students, "student-previous")).toBeNull();
  });

  it("retrouve l’élève sélectionné dans la classe courante", () => {
    expect(findReportStudent(students, "student-a")).toEqual(students[0]);
  });
});
import type {
  AssessmentScore,
  GradeAssessment,
  GradingWorkspace,
  SchoolSettings,
} from "./types";

const assessments: GradeAssessment[] = [
  {
    id: "a1",
    evaluationId: "e1",
    classId: "c",
    subject: "Français",
    periodId: "p",
    title: "Test 1",
    date: "2026-09-01",
    maxScore: 10,
    coefficient: 1,
    active: true,
  },
  {
    id: "a2",
    evaluationId: "e2",
    classId: "c",
    subject: "Français",
    periodId: "p",
    title: "Test 2",
    date: "2026-09-02",
    maxScore: 20,
    coefficient: 2,
    active: true,
  },
];
const scores: AssessmentScore[] = [
  {
    id: "1",
    assessmentId: "a1",
    studentId: "s1",
    value: 8,
    status: "graded",
    updatedAt: "",
  },
  {
    id: "2",
    assessmentId: "a2",
    studentId: "s1",
    value: 10,
    status: "graded",
    updatedAt: "",
  },
  {
    id: "3",
    assessmentId: "a1",
    studentId: "s2",
    value: null,
    status: "absent",
    updatedAt: "",
  },
];
describe("calculs scolaires", () => {
  it("calcule une moyenne simple", () =>
    expect(
      assessmentAverage(
        [
          { ...scores[0], assessmentId: "a" },
          { ...scores[1], assessmentId: "a", value: 6 },
        ],
        "a",
        10,
      ),
    ).toBe(14));
  it("calcule une moyenne pondérée", () =>
    expect(
      studentSubjectAverage("s1", "Français", assessments, scores).average,
    ).toBe(12));
  it("change correctement de barème", () =>
    expect(normalizedScore(8, 10, 20)).toBe(16));
  it("ignore absent et valeur manquante", () =>
    expect(
      studentSubjectAverage("s2", "Français", assessments, scores).average,
    ).toBeNull());
  it("ignore un coefficient nul", () =>
    expect(
      weightedGeneralAverage([
        { average: 18, coefficient: 0 },
        { average: 10, coefficient: 2 },
      ]),
    ).toBe(10));
  it("gère les égalités de rang", () => {
    const ranks = rankValues([
      { id: "a", average: 15 },
      { id: "b", average: 15 },
      { id: "c", average: 12 },
    ]);
    expect([ranks.get("a"), ranks.get("b"), ranks.get("c")]).toEqual([1, 1, 3]);
  });
  it("calcule les statistiques de classe", () =>
    expect(classStatistics([10, 14, null, 16])).toEqual({
      average: 13.33,
      best: 16,
      lowest: 10,
    }));
  it("applique les arrondis configurables", () =>
    expect(roundTo(10.555, 2)).toBe(10.56));
});
describe("bulletin et verrouillage", () => {
  const settings: SchoolSettings = {
    academicYear: "2026-2027",
    periodKind: "trimester",
    activePeriodId: "p",
    maxScore: 20,
    passThreshold: 10,
    decimals: 2,
    schoolName: "",
    logoUrl: "",
    address: "",
    phone: "",
    email: "",
    headName: "",
    bulletinModel: "Standard",
    individualMode: true,
    simulatedRole: "teacher",
  };
  const workspace: GradingWorkspace = {
    settings,
    periods: [
      {
        id: "p",
        label: "Trimestre 1",
        startsOn: "",
        endsOn: "",
        active: true,
        locked: false,
      },
    ],
    classSubjects: [
      {
        id: "cs",
        classId: "c",
        periodId: "p",
        subject: "Français",
        coefficient: 2,
        teacherName: "",
        principal: true,
        active: true,
      },
    ],
    assessments,
    scores,
    attendance: [],
    subjectComments: [],
    generalComments: [],
    reports: [],
    updatedAt: "",
  };
  it("génère un modèle complet de bulletin", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "report" });
    const report = buildReportCardSnapshot({
      workspace,
      settings,
      classId: "c",
      className: "5e A1",
      periodId: "p",
      periodLabel: "Trimestre 1",
      student: { id: "s1", firstName: "Abel", lastName: "Ondo" },
      students: [
        { id: "s1", firstName: "Abel", lastName: "Ondo" },
        { id: "s2", firstName: "Élise", lastName: "Ondo" },
      ],
    });
    expect(report.studentName).toBe("ONDO Abel");
    expect(report.generalAverage).toBe(12);
    expect(report.subjects[0].assessmentCount).toBe(2);
    vi.unstubAllGlobals();
  });
  it("conserve un snapshot verrouillé indépendant des sources", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "report" });
    const source = structuredClone(workspace);
    const report = buildReportCardSnapshot({
      workspace: source,
      settings,
      classId: "c",
      className: "5e A1",
      periodId: "p",
      periodLabel: "Trimestre 1",
      student: { id: "s1", firstName: "Abel", lastName: "Ondo" },
      students: [{ id: "s1", firstName: "Abel", lastName: "Ondo" }],
    });
    const frozen = structuredClone(report);
    source.scores[0].value = 0;
    expect(frozen.generalAverage).toBe(12);
    vi.unstubAllGlobals();
  });
  it("produit un carnet de maternelle sans moyenne numérique", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "preschool-report" });
    const source = structuredClone(workspace);
    source.classSubjects = [{ id: "cs-lang", classId: "c", periodId: "p", subject: "Langage et communication", coefficient: 1, teacherName: "", principal: true, active: true }];
    source.assessments = [{ id: "obs-1", evaluationId: "", classId: "c", periodId: "p", subject: "Langage et communication", title: "Prendre la parole", date: "2026-10-01", maxScore: 10, coefficient: 1, active: true, evaluationMode: "mastery" }];
    source.scores = [{ id: "score-obs", assessmentId: "obs-1", studentId: "s1", value: null, status: "graded", mastery: "developing", updatedAt: "2026-10-01" }];
    const report = buildReportCardSnapshot({
      workspace: source,
      settings,
      classId: "c",
      className: "Moyenne Section A",
      classLevel: "Moyenne Section",
      periodId: "p",
      periodLabel: "Trimestre 1",
      student: { id: "s1", firstName: "Abel", lastName: "Ondo" },
      students: [{ id: "s1", firstName: "Abel", lastName: "Ondo" }],
    });
    expect(report.generalAverage).toBeNull();
    expect(report.generalRank).toBeNull();
    expect(report.subjects[0]).toMatchObject({ mastery: "developing", assessmentCount: 1 });
    vi.unstubAllGlobals();
  });
  it("affiche les domaines du niveau quand aucune matière n’est encore affectée", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "fallback-report" });
    const source = structuredClone(workspace);
    source.classSubjects = [];
    source.assessments = [];
    source.scores = [];
    const report = buildReportCardSnapshot({
      workspace: source,
      settings,
      classId: "c",
      className: "2e Année A",
      classLevel: "2e Année",
      periodId: "p",
      periodLabel: "Trimestre 1",
      student: { id: "s1", firstName: "Abel", lastName: "Ondo" },
      students: [{ id: "s1", firstName: "Abel", lastName: "Ondo" }],
    });
    expect(report.subjects.length).toBeGreaterThan(5);
    expect(report.subjects.map((row) => row.subject)).toContain("Français");
    expect(report.subjects.every((row) => row.average === null)).toBe(true);
    vi.unstubAllGlobals();
  });
});
