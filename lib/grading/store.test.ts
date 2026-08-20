import { describe, expect, it, vi } from "vitest";
import {
  archiveReport,
  canEditGeneralComment,
  canLockPeriod,
  defaultWorkspace,
  parseScoresCsv,
  reopenReport,
  reportCompleteness,
  scoresToCsv,
  upsertAssessment,
  upsertScore,
} from "./store";
import type { GradeAssessment, ReportSnapshot } from "./types";

const assessment: GradeAssessment = {
  id: "a",
  evaluationId: "",
  classId: "c",
  subject: "Mathématiques",
  periodId: "period-t1",
  title: "Devoir",
  date: "2026-09-12",
  maxScore: 20,
  coefficient: 1,
  active: true,
};
const report: ReportSnapshot = {
  id: "r",
  studentId: "s",
  studentName: "ONDO Abel",
  classId: "c",
  className: "5e A",
  periodId: "period-t1",
  periodLabel: "Trimestre 1",
  academicYear: "2026-2027",
  createdAt: "2026-09-30T00:00:00.000Z",
  status: "calculated",
  settings: defaultWorkspace.settings,
  subjects: [],
  generalAverage: 12,
  generalRank: 1,
  classAverage: 12,
  bestAverage: 12,
  lowestAverage: 12,
  totalCoefficients: 0,
  attendance: {
    studentId: "s",
    periodId: "period-t1",
    absences: 0,
    lateCount: 0,
  },
  comments: {
    studentId: "s",
    periodId: "period-t1",
    general: "",
    work: "",
    conduct: "",
    decision: "",
    mention: "",
  },
  classSize: 1,
};

describe("registre de notes", () => {
  it("empêche la modification d’une période verrouillée", () => {
    const workspace = {
      ...structuredClone(defaultWorkspace),
      periods: defaultWorkspace.periods.map((item) =>
        item.id === "period-t1" ? { ...item, locked: true } : item,
      ),
      assessments: [assessment],
    };
    expect(() =>
      upsertScore(workspace, {
        id: "s",
        assessmentId: "a",
        studentId: "e",
        value: 15,
        status: "graded",
        updatedAt: "",
      }),
    ).toThrow("verrouillée");
  });
  it("valide les limites du barème", () => {
    const workspace = {
      ...structuredClone(defaultWorkspace),
      assessments: [assessment],
    };
    expect(() =>
      upsertScore(workspace, {
        id: "s",
        assessmentId: "a",
        studentId: "e",
        value: 21,
        status: "graded",
        updatedAt: "",
      }),
    ).toThrow("comprise");
  });
  it("valide une observation de maternelle sans note numérique", () => {
    const masteryAssessment: GradeAssessment = {
      ...assessment,
      evaluationMode: "mastery",
      subject: "Langage et communication",
    };
    const workspace = {
      ...structuredClone(defaultWorkspace),
      assessments: [masteryAssessment],
    };
    const saved = upsertScore(workspace, {
      id: "mastery-score",
      assessmentId: "a",
      studentId: "e",
      value: null,
      status: "graded",
      mastery: "developing",
      updatedAt: "",
    });
    expect(saved.scores[0].mastery).toBe("developing");
    expect(() => upsertScore(workspace, {
      id: "numeric-preschool-score",
      assessmentId: "a",
      studentId: "e",
      value: 8,
      status: "graded",
      mastery: "acquired",
      updatedAt: "",
    })).toThrow("note numérique");
  });
  it("refuse de créer une évaluation sur une période verrouillée", () => {
    const workspace = {
      ...structuredClone(defaultWorkspace),
      periods: defaultWorkspace.periods.map((item) =>
        item.id === "period-t1" ? { ...item, locked: true } : item,
      ),
    };
    expect(() => upsertAssessment(workspace, assessment)).toThrow(
      "verrouillée",
    );
  });
  it("importe et exporte les notes CSV", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "score" });
    const csv = scoresToCsv(
      assessment,
      [{ id: "e", firstName: "Abel", lastName: "Ondo" }],
      [
        {
          id: "s",
          assessmentId: "a",
          studentId: "e",
          value: 14,
          status: "graded",
          updatedAt: "",
        },
      ],
    );
    const parsed = parseScoresCsv(csv, assessment);
    expect(parsed[0]).toMatchObject({
      studentId: "e",
      value: 14,
      status: "graded",
    });
    vi.unstubAllGlobals();
  });
});

describe("workflow des bulletins", () => {
  it("archive une copie figée lors du verrouillage", () => {
    const workspace = archiveReport(
      structuredClone(defaultWorkspace),
      structuredClone(report),
      "locked",
    );
    const changed = structuredClone(report);
    changed.generalAverage = 2;
    expect(workspace.reports[0].snapshot.generalAverage).toBe(12);
    expect(workspace.reports[0].lockedAt).not.toBeNull();
    expect(() => archiveReport(workspace, changed, "locked")).toThrow(
      "rouvert",
    );
  });
  it("réserve la réouverture aux rôles autorisés", () => {
    const workspace = archiveReport(
      structuredClone(defaultWorkspace),
      report,
      "locked",
    );
    expect(() => reopenReport(workspace, "r", "teacher")).toThrow("rôle");
    expect(() => reopenReport(workspace, "r", "headmaster", "")).toThrow("motif");
    expect(reopenReport(workspace, "r", "headmaster", "Correction d’une appréciation").reports[0].status).toBe(
      "review",
    );
  });
  it("applique les droits de préparation et verrouillage", () => {
    expect(canEditGeneralComment("teacher")).toBe(false);
    expect(canEditGeneralComment("head_teacher")).toBe(true);
    expect(canLockPeriod("school_admin")).toBe(true);
    expect(canLockPeriod("teacher")).toBe(false);
  });
  it("détecte les notes manquantes avant validation",()=>{const workspace={...structuredClone(defaultWorkspace),classSubjects:[{id:"cs",classId:"c",periodId:"period-t1",subject:"Mathématiques",coefficient:2,teacherName:"",principal:false,active:true}],assessments:[assessment],scores:[]};expect(reportCompleteness(workspace,"c","period-t1",["e"])).toMatchObject({missingScores:1,complete:false});const complete={...workspace,scores:[{id:"s",assessmentId:"a",studentId:"e",value:null,status:"absent" as const,updatedAt:""}]};expect(reportCompleteness(complete,"c","period-t1",["e"]).complete).toBe(true);});
});
