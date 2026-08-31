import { describe, expect, it } from "vitest";
import {
  studentSubjectAverage,
  studentSubjectIsRanked,
  validScore,
} from "./calculations";
import type { AssessmentScore, GradeAssessment } from "./types";

const assessments: GradeAssessment[] = [
  {
    id: "fr-1",
    evaluationId: "",
    classId: "classe-a",
    subject: "Français",
    periodId: "p1",
    title: "Évaluation 1",
    date: "2026-09-10",
    maxScore: 10,
    coefficient: 1,
    active: true,
  },
  {
    id: "fr-2",
    evaluationId: "",
    classId: "classe-a",
    subject: "Français",
    periodId: "p1",
    title: "Évaluation 2",
    date: "2026-09-20",
    maxScore: 10,
    coefficient: 1,
    active: true,
  },
  {
    id: "math-1",
    evaluationId: "",
    classId: "classe-a",
    subject: "Mathématiques",
    periodId: "p1",
    title: "Évaluation maths",
    date: "2026-09-22",
    maxScore: 10,
    coefficient: 1,
    active: true,
  },
];

function score(
  id: string,
  assessmentId: string,
  status: AssessmentScore["status"],
  value: number | null,
): AssessmentScore {
  return {
    id,
    assessmentId,
    studentId: "eleve-1",
    status,
    value,
    updatedAt: "2026-09-30T12:00:00.000Z",
  };
}

describe("codes spéciaux du relevé de notes", () => {
  it("Abs exclut l’évaluation de la moyenne", () => {
    const scores = [
      score("s1", "fr-1", "graded", 8),
      score("s2", "fr-2", "absent", null),
    ];

    expect(
      studentSubjectAverage(
        "eleve-1",
        "Français",
        assessments,
        scores,
        10,
        2,
      ),
    ).toEqual({ average: 8, count: 1 });
  });

  it("Z compte comme un zéro dans la moyenne", () => {
    const scores = [
      score("s1", "fr-1", "graded", 8),
      score("s2", "fr-2", "zero_penalty", 0),
    ];

    expect(validScore(scores[1])).toBe(true);
    expect(
      studentSubjectAverage(
        "eleve-1",
        "Français",
        assessments,
        scores,
        10,
        2,
      ),
    ).toEqual({ average: 4, count: 2 });
  });

  it("N retire l’élève du classement de la matière seulement", () => {
    const scores = [
      score("s1", "fr-1", "graded", 8),
      score("s2", "fr-2", "not_ranked", null),
    ];

    expect(validScore(scores[1])).toBe(false);
    expect(
      studentSubjectAverage(
        "eleve-1",
        "Français",
        assessments,
        scores,
        10,
        2,
      ).average,
    ).toBe(8);
    expect(
      studentSubjectIsRanked("eleve-1", "Français", assessments, scores),
    ).toBe(false);
    expect(
      studentSubjectIsRanked("eleve-1", "Mathématiques", assessments, scores),
    ).toBe(true);
  });
});
