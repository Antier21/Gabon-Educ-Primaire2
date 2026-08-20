"use client";

import { readClasses, saveClassRecord } from "@/lib/class-store";
import {
  readGradingWorkspace,
  saveGradingWorkspace,
  upsertScore,
} from "@/lib/grading/store";
import {
  readPlatformWorkspace,
  savePlatformWorkspace,
} from "@/lib/platform/store";
import type {
  AttendanceEntry,
  Guardian,
  GuardianLink,
  SchoolSubject,
  SchoolUser,
  StudentRecord,
  TimetableSlot,
} from "@/lib/platform/types";
import type { ImportPreview } from "./csv";
const createId = () => crypto.randomUUID(),
  time = () => new Date().toISOString(),
  norm = (value: string) => value.trim().toLocaleLowerCase("fr");
export async function applyValidatedImport(preview: ImportPreview) {
  if (preview.errors.length)
    throw new Error(
      "Corrigez les lignes invalides avant de confirmer l’import.",
    );
  const workspace = readPlatformWorkspace(),
    classes = readClasses(),
    schoolId = workspace.school?.id || "local",
    academicYearId =
      workspace.academicYears.find((item) => item.active)?.id || "local",
    created = time();
  let imported = 0,
    skipped = 0;
  if (preview.module === "classes") {
    for (const row of preview.validRows) {
      if (classes.some((item) => norm(item.name) === norm(row.nom))) {
        skipped += 1;
        continue;
      }
      await saveClassRecord({
        id: createId(),
        name: row.nom,
        level: row.niveau,
        room: row.salle,
        academicYear: row.annee_scolaire,
        mainSubject: "",
        students: [],
      });
      imported += 1;
    }
    return { imported, skipped, module: preview.module };
  }
  if (preview.module === "students") {
    const additions: StudentRecord[] = [];
    for (const row of preview.validRows) {
      if (
        row.matricule &&
        workspace.students.some(
          (item) => norm(item.registrationNumber) === norm(row.matricule),
        )
      ) {
        skipped += 1;
        continue;
      }
      const group = classes.find(
        (item) =>
          norm(item.name) === norm(row.classe) || item.id === row.classe,
      );
      if (!group) {
        skipped += 1;
        continue;
      }
      additions.push({
        id: createId(),
        schoolId,
        academicYearId,
        classId: group.id,
        registrationNumber: row.matricule,
        firstName: row.prenom,
        lastName: row.nom,
        gender: "",
        dateOfBirth: row.date_naissance,
        placeOfBirth: "",
        nationality: "Gabonaise",
        photoUrl: "",
        address: "",
        phone: "",
        email: "",
        previousSchool: "",
        enrolledOn: created.slice(0, 10),
        status: "active",
        specialNeeds: "",
        emergencyContact: "",
        administrativeNotes: "Import CSV v0.9.0",
        limitedMedicalNotes: "",
        createdAt: created,
        updatedAt: created,
      });
      imported += 1;
    }
    await savePlatformWorkspace(
      {
        ...workspace,
        students: [...additions, ...workspace.students],
      },
      additions.map((student) => ({
        module: "students" as const,
        operation: "create" as const,
        entityId: student.id,
        payload: { student },
      })),
    );
    return { imported, skipped, module: preview.module };
  }
  if (preview.module === "teachers") {
    const additions: SchoolUser[] = [];
    for (const row of preview.validRows) {
      if (
        workspace.users.some((item) => norm(item.email) === norm(row.email))
      ) {
        skipped += 1;
        continue;
      }
      additions.push({
        id: createId(),
        schoolId,
        firstName: row.prenom,
        lastName: row.nom,
        email: row.email,
        phone: row.telephone,
        role: row.role === "head_teacher" ? "head_teacher" : "teacher",
        status: "invited",
        scopeClassIds: [],
        invitationStatus: "pending",
        invitedAt: created,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        createdAt: created,
        updatedAt: created,
      });
      imported += 1;
    }
    await savePlatformWorkspace(
      {
        ...workspace,
        users: [...additions, ...workspace.users],
      },
      additions.map((user) => ({
        module: "users" as const,
        operation: "create" as const,
        entityId: user.id,
        payload: { user },
      })),
    );
    return { imported, skipped, module: preview.module };
  }
  if (preview.module === "subjects") {
    const additions: SchoolSubject[] = [];
    for (const row of preview.validRows) {
      if (
        workspace.subjects.some((item) => norm(item.code) === norm(row.code))
      ) {
        skipped += 1;
        continue;
      }
      additions.push({
        id: createId(),
        schoolId,
        code: row.code,
        label: row.libelle,
        color: "#08734f",
        icon: "book",
        levelId: "",
        coefficient: Number(row.coefficient),
        weeklyHours: Number(row.heures_semaine) || 0,
        category: "Générale",
        bulletinOrder: workspace.subjects.length + additions.length + 1,
        active: true,
        createdAt: created,
        updatedAt: created,
      });
      imported += 1;
    }
    await savePlatformWorkspace(
      {
        ...workspace,
        subjects: [...additions, ...workspace.subjects],
      },
      additions.map((subject) => ({
        module: "subjects" as const,
        operation: "create" as const,
        entityId: subject.id,
        payload: { subject },
      })),
    );
    return { imported, skipped, module: preview.module };
  }
  if (preview.module === "guardians") {
    const guardians: Guardian[] = [],
      links: GuardianLink[] = [];
    for (const row of preview.validRows) {
      const student = workspace.students.find(
        (item) => norm(item.registrationNumber) === norm(row.matricule_eleve),
      );
      if (
        !student ||
        workspace.guardians.some(
          (item) => norm(item.phone) === norm(row.telephone),
        )
      ) {
        skipped += 1;
        continue;
      }
      const guardianId = createId();
      guardians.push({
        id: guardianId,
        schoolId,
        firstName: row.prenom,
        lastName: row.nom,
        phone: row.telephone,
        email: row.email,
        address: "",
        contactAllowed: true,
        status: "active",
        createdAt: created,
        updatedAt: created,
      });
      links.push({
        id: createId(),
        schoolId,
        guardianId,
        studentId: student.id,
        relationship: [
          "father",
          "mother",
          "guardian",
          "legal_guardian",
        ].includes(row.lien)
          ? (row.lien as GuardianLink["relationship"])
          : "other",
        primary: false,
        createdAt: created,
      });
      imported += 1;
    }
    await savePlatformWorkspace(
      {
        ...workspace,
        guardians: [...guardians, ...workspace.guardians],
        guardianLinks: [...links, ...workspace.guardianLinks],
      },
      guardians.map((guardian) => ({
        module: "guardians" as const,
        operation: "create" as const,
        entityId: guardian.id,
        payload: {
          guardian,
          link: links.find((item) => item.guardianId === guardian.id),
        },
      })),
    );
    return { imported, skipped, module: preview.module };
  }
  if (preview.module === "attendance") {
    const additions: AttendanceEntry[] = [];
    for (const row of preview.validRows) {
      const student = workspace.students.find(
        (item) => norm(item.registrationNumber) === norm(row.matricule),
      );
      if (!student) {
        skipped += 1;
        continue;
      }
      const kind =
        row.statut === "retard"
          ? "late"
          : row.statut === "sortie_anticipee"
            ? "early_leave"
            : "absence";
      additions.push({
        id: createId(),
        schoolId,
        academicYearId,
        periodId: workspace.periods.find((item) => item.active)?.id || "local",
        classId: student.classId,
        studentId: student.id,
        timetableSlotId: "",
        kind,
        date: row.date,
        durationMinutes: Number(row.duree_minutes) || 0,
        reason: "Import CSV",
        proofName: "",
        justified: ["oui", "true", "1"].includes(norm(row.justifie)),
        recordedBy: "local-user",
        createdAt: created,
        updatedAt: created,
      });
      imported += 1;
    }
    await savePlatformWorkspace(
      {
        ...workspace,
        attendance: [...additions, ...workspace.attendance],
      },
      additions.map((entry) => ({
        module: "attendance" as const,
        operation: "create" as const,
        entityId: entry.id,
        payload: { entry },
      })),
    );
    return { imported, skipped, module: preview.module };
  }
  if (preview.module === "timetable") {
    const additions: TimetableSlot[] = [];
    for (const row of preview.validRows) {
      const group = classes.find(
          (item) => norm(item.name) === norm(row.classe),
        ),
        subject = workspace.subjects.find(
          (item) => norm(item.label) === norm(row.matiere),
        ),
        teacher = workspace.users.find(
          (item) =>
            norm(`${item.firstName} ${item.lastName}`) === norm(row.enseignant),
        );
      if (!group || !subject) {
        skipped += 1;
        continue;
      }
      const day =
        (
          {
            lundi: 1,
            mardi: 2,
            mercredi: 3,
            jeudi: 4,
            vendredi: 5,
            samedi: 6,
          } as Record<string, number>
        )[norm(row.jour)] || Number(row.jour);
      additions.push({
        id: createId(),
        schoolId,
        academicYearId,
        classId: group.id,
        subjectId: subject.id,
        teacherId: teacher?.id || "",
        room: row.salle,
        weekday: day,
        startsAt: row.debut,
        endsAt: row.fin,
        weekLabel: "Import CSV",
        createdAt: created,
        updatedAt: created,
      });
      imported += 1;
    }
    await savePlatformWorkspace(
      {
        ...workspace,
        timetable: [...additions, ...workspace.timetable],
      },
      additions.map((slot) => ({
        module: "timetables" as const,
        operation: "create" as const,
        entityId: slot.id,
        payload: { slot },
      })),
    );
    return { imported, skipped, module: preview.module };
  }
  if (preview.module === "scores") {
    let grading = readGradingWorkspace();
    for (const row of preview.validRows) {
      const assessment = grading.assessments.find(
          (item) => norm(item.title) === norm(row.evaluation),
        ),
        student = classes
          .flatMap((item) => item.students)
          .find(
            (item) =>
              norm(item.registrationNumber || "") === norm(row.matricule),
          );
      if (!assessment || !student) {
        skipped += 1;
        continue;
      }
      grading = upsertScore(grading, {
        id: createId(),
        assessmentId: assessment.id,
        studentId: student.id,
        value: row.note ? Number(row.note) : null,
        status: ["absent", "exempt", "not_graded"].includes(row.statut)
          ? (row.statut as "absent" | "exempt" | "not_graded")
          : "graded",
        updatedAt: created,
      });
      imported += 1;
    }
    await saveGradingWorkspace(grading);
    return { imported, skipped, module: preview.module };
  }
  return {
    imported,
    skipped: preview.validRows.length,
    module: preview.module,
  };
}
