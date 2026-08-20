"use client";

import { readLocal, STORAGE_KEYS, writeLocal } from "@/lib/storage-mode";
export type AppErrorKind =
  | "user"
  | "validation"
  | "network"
  | "supabase"
  | "permission"
  | "server"
  | "conflict"
  | "import";
export type AppErrorRecord = {
  id: string;
  kind: AppErrorKind;
  message: string;
  technicalMessage: string;
  module: string;
  createdAt: string;
  retryable: boolean;
};
const messages: Record<AppErrorKind, string> = {
  user: "L’action demandée ne peut pas être réalisée.",
  validation: "Certaines informations sont incorrectes.",
  network:
    "La connexion est indisponible. Vos données locales sont conservées.",
  supabase: "Le service de synchronisation ne répond pas.",
  permission: "Votre rôle ne permet pas cette action.",
  server: "Le service a rencontré une erreur.",
  conflict: "Deux versions différentes doivent être comparées.",
  import: "Le fichier contient des données à corriger.",
};
export function createAppError(
  kind: AppErrorKind,
  module: string,
  error?: unknown,
): AppErrorRecord {
  const record = {
    id: `GE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    kind,
    message: messages[kind],
    technicalMessage: error instanceof Error ? error.message : "",
    module,
    createdAt: new Date().toISOString(),
    retryable: ["network", "supabase", "server"].includes(kind),
  };
  try {
    writeLocal(
      STORAGE_KEYS.errorLog,
      [record, ...readRecentErrors()].slice(0, 50),
    );
  } catch {}
  return record;
}
export function readRecentErrors() {
  return readLocal<AppErrorRecord[]>(STORAGE_KEYS.errorLog, []);
}
export function userErrorMessage(record: AppErrorRecord) {
  return `${record.message} Référence : ${record.id}`;
}
