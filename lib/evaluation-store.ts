"use client";

import { createClient } from "@/lib/supabase/client";
import {
  readLocal,
  resolveStorageStatus,
  STORAGE_KEYS,
  withTimeout,
  writeLocal,
  type StorageMode,
} from "@/lib/storage-mode";
import type { SyncState } from "@/lib/lesson-store";
import { enqueueBusinessOperation } from "@/lib/sync/business-operation";
import { updateOperationStatus } from "@/lib/sync/sync-manager";
import { assertSubscriptionWriteAllowed } from "@/lib/subscriptions/write-guard";
import { confirmWrite } from "@/lib/supabase/confirm-write";

export type EvaluationType =
  | "Interrogation"
  | "Devoir surveillé"
  | "Exercice"
  | "Évaluation diagnostique"
  | "Évaluation formative"
  | "Évaluation sommative";
export type QuestionType =
  | "Réponse courte"
  | "Réponse développée"
  | "QCM"
  | "Vrai ou faux"
  | "Exercice numérique";
export type EvaluationQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  answer: string;
  options: string[];
};
export type EvaluationRecord = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  classId: string;
  className: string;
  periodId?: string;
  date: string;
  duration: number;
  maxScore: number;
  coefficient: number;
  type: EvaluationType;
  instructions: string;
  questions: EvaluationQuestion[];
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  syncState?: SyncState;
};
export type EvaluationList = {
  items: EvaluationRecord[];
  mode: StorageMode;
  message: string;
};

export const EVALUATION_TYPES: EvaluationType[] = [
  "Interrogation",
  "Devoir surveillé",
  "Exercice",
  "Évaluation diagnostique",
  "Évaluation formative",
  "Évaluation sommative",
];
export const QUESTION_TYPES: QuestionType[] = [
  "Réponse courte",
  "Réponse développée",
  "QCM",
  "Vrai ou faux",
  "Exercice numérique",
];

export function calculateTotal(
  questions: Pick<EvaluationQuestion, "points">[],
) {
  return questions.reduce(
    (sum, item) =>
      sum + (Number.isFinite(item.points) ? Math.max(0, item.points) : 0),
    0,
  );
}
export function validateEvaluation(record: EvaluationRecord) {
  if (record.title.trim().length < 3)
    throw new Error("Le titre doit comporter au moins trois caractères.");
  if (!record.subject || !record.grade)
    throw new Error("Sélectionnez une matière et un niveau.");
  if (!record.date) throw new Error("Indiquez la date de l’évaluation.");
  if (record.duration < 5 || record.duration > 300)
    throw new Error("La durée doit être comprise entre 5 et 300 minutes.");
  if (!record.questions.length)
    throw new Error("Ajoutez au moins une question.");
  record.questions.forEach((question, index) => {
    if (question.prompt.trim().length < 2)
      throw new Error(`La question ${index + 1} est incomplète.`);
    if (question.points <= 0)
      throw new Error(
        `Les points de la question ${index + 1} doivent être supérieurs à zéro.`,
      );
  });
  return {
    ...record,
    title: record.title.trim(),
    instructions: record.instructions.trim(),
  };
}

function readEvaluations() {
  return readLocal<EvaluationRecord[]>(STORAGE_KEYS.evaluations, []);
}
function writeEvaluations(items: EvaluationRecord[]) {
  writeLocal(STORAGE_KEYS.evaluations, items);
}
export async function listEvaluations(): Promise<EvaluationList> {
  const local = readEvaluations();
  const status = await resolveStorageStatus();
  if (status.mode !== "cloud")
    return { items: local, mode: status.mode, message: status.message };
  try {
    const { data, error } = await withTimeout(
      createClient()
        .from("teacher_evaluations")
        .select("id,payload,updated_at")
        .order("updated_at", { ascending: false }),
    );
    if (error) throw error;
    const remote = (data || []).map((row) => ({
      ...row.payload,
      id: row.id,
      updatedAt: row.updated_at,
      syncState: "synced" as const,
    })) as EvaluationRecord[];
    const pending = local.filter(
      (item) =>
        item.syncState === "pending" &&
        !remote.some((remoteItem) => remoteItem.id === item.id),
    );
    const items = [...pending, ...remote];
    writeEvaluations(items);
    return {
      items,
      mode: "cloud",
      message: pending.length
        ? "Certaines évaluations attendent la synchronisation"
        : "Évaluations synchronisées",
    };
  } catch {
    return {
      items: local,
      mode: "offline",
      message: "Mode hors ligne : évaluations locales conservées",
    };
  }
}
export async function saveEvaluation(input: EvaluationRecord) {
  await assertSubscriptionWriteAllowed();
  const previous = readEvaluations().find((item) => item.id === input.id);
  const record = validateEvaluation({
    ...input,
    updatedAt: new Date().toISOString(),
    createdAt: input.createdAt || new Date().toISOString(),
    syncState: "pending",
  });
  writeEvaluations([
    record,
    ...readEvaluations().filter((item) => item.id !== record.id),
  ]);
  const status = await resolveStorageStatus();
  const queued = enqueueBusinessOperation(
    {
      module: "evaluations",
      operation: previous ? "update" : "create",
      entityId: record.id,
      payload: { evaluation: record },
      baseUpdatedAt: previous?.updatedAt,
    },
    {
      schoolId: readLocal(STORAGE_KEYS.activeSchool, "") || "local",
      userId: status.user?.id || "local-user",
    },
  );
  if (status.mode !== "cloud" || !status.user)
    return {
      ...record,
      syncState:
        status.mode === "demo" ? ("local" as const) : ("pending" as const),
    };
  try {
    const { error } = await withTimeout(
      createClient()
        .from("teacher_evaluations")
        .upsert(
          {
            id: record.id,
            teacher_id: status.user.id,
            title: record.title,
            subject: record.subject,
            grade: record.grade,
            class_group_id: record.classId || null,
            evaluation_date: record.date,
            status: record.status,
            payload: record,
          },
          { onConflict: "id" },
        ),
    );
    if (error) throw error;
    const synced = { ...record, syncState: "synced" as const };
    writeEvaluations([
      synced,
      ...readEvaluations().filter((item) => item.id !== record.id),
    ]);
    if (queued) updateOperationStatus(queued.id, "synced");
    return synced;
  } catch {
    return record;
  }
}
export async function deleteEvaluation(id: string) {
  await assertSubscriptionWriteAllowed();
  const previous = readEvaluations().find((item) => item.id === id);
  writeEvaluations(readEvaluations().filter((item) => item.id !== id));
  const status = await resolveStorageStatus();
  const queued = enqueueBusinessOperation(
    {
      module: "evaluations",
      operation: "delete",
      entityId: id,
      payload: {},
      baseUpdatedAt: previous?.updatedAt,
    },
    {
      schoolId: readLocal(STORAGE_KEYS.activeSchool, "") || "local",
      userId: status.user?.id || "local-user",
    },
  );
  if (status.mode === "cloud") {
    try {
      /*
       * Le « catch » vide avalait aussi bien la panne réseau que le refus de
       * droit, puis marquait l'opération « synchronisée ». L'évaluation
       * restait en ligne, et la file de synchronisation croyait avoir fini.
       *
       * On redemande donc la ligne supprimée. Si rien n'a été touché,
       * l'opération reste en attente et sera retentée : c'est exactement à
       * cela que sert la file.
       */
      const result = await withTimeout(
        createClient().from("teacher_evaluations").delete().eq("id", id).select("id"),
      );
      confirmWrite(result, "la suppression de cette évaluation");
      if (queued) updateOperationStatus(queued.id, "synced");
    } catch {
      // L'opération reste en file : elle repartira à la prochaine
      // synchronisation, au lieu d'être classée comme faite.
    }
  }
}
