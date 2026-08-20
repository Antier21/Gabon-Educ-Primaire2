"use client";

import { readLocal, STORAGE_KEYS, writeLocal } from "@/lib/storage-mode";
export type AuditStatus = "success" | "error";
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "login_failed"
  | "invite"
  | "role_change"
  | "school_change"
  | "score_change"
  | "score_validate"
  | "period_lock"
  | "report_generate"
  | "report_validate"
  | "report_reopen"
  | "publish"
  | "export"
  | "import"
  | "student_transfer"
  | "sync";
export type AuditEntry = {
  id: string;
  userId: string;
  schoolId: string;
  role: string;
  action: AuditAction;
  module: string;
  entityId: string;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  status: AuditStatus;
  message: string;
};
const forbidden = /password|token|secret|authorization|cookie|session/i;
export function sanitizeAuditData(
  value: Record<string, unknown> | null | undefined,
) {
  if (!value) return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !forbidden.test(key))
      .map(([key, item]) => [
        key,
        typeof item === "string" && item.length > 500
          ? `${item.slice(0, 500)}…`
          : item,
      ]),
  );
}
export function readAuditLog() {
  return readLocal<AuditEntry[]>(STORAGE_KEYS.auditLog, []);
}
export function createAuditEntry(
  input: Omit<AuditEntry, "id" | "createdAt" | "before" | "after"> & {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
) {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    before: sanitizeAuditData(input.before),
    after: sanitizeAuditData(input.after),
  } satisfies AuditEntry;
}
export function logAuditAction(input: Parameters<typeof createAuditEntry>[0]) {
  const entry = createAuditEntry(input);
  writeLocal(STORAGE_KEYS.auditLog, [entry, ...readAuditLog()].slice(0, 1000));
  return entry;
}
export function filterAuditLog(filters: {
  schoolId?: string;
  module?: string;
  status?: AuditStatus;
  query?: string;
}) {
  const query = filters.query?.toLocaleLowerCase("fr") || "";
  return readAuditLog().filter(
    (item) =>
      (!filters.schoolId || item.schoolId === filters.schoolId) &&
      (!filters.module || item.module === filters.module) &&
      (!filters.status || item.status === filters.status) &&
      (!query ||
        `${item.action} ${item.module} ${item.message} ${item.entityId}`
          .toLocaleLowerCase("fr")
          .includes(query)),
  );
}
export function clearLocalAuditLog() {
  writeLocal(STORAGE_KEYS.auditLog, []);
}
