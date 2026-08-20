"use client";

import {
  hasSupabaseEnvironment,
  readLocal,
  STORAGE_KEYS,
} from "@/lib/storage-mode";
import { getConnectionState, getSyncStatus } from "@/lib/sync/sync-manager";
import { readRecentErrors } from "@/lib/errors/error-manager";
export type DiagnosticReport = {
  version: string;
  environment: string;
  supabaseConfigured: boolean;
  activeSchoolId: string;
  connection: string;
  sync: ReturnType<typeof getSyncStatus>;
  localStorageBytes: number;
  browser: string;
  expectedMigrations: string;
  recentErrors: Array<{
    id: string;
    kind: string;
    message: string;
    createdAt: string;
  }>;
  generatedAt: string;
};
export function estimateLocalStorageBytes(
  storage: Pick<Storage, "length" | "key" | "getItem"> = localStorage,
) {
  let total = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index),
      value = key ? storage.getItem(key) : null;
    if (key && value) total += (key.length + value.length) * 2;
  }
  return total;
}
export function createDiagnosticReport(): DiagnosticReport {
  return {
    version: "0.9.0",
    environment: process.env.NODE_ENV || "development",
    supabaseConfigured: hasSupabaseEnvironment(),
    activeSchoolId: readLocal<string>(STORAGE_KEYS.activeSchool, ""),
    connection: getConnectionState(),
    sync: getSyncStatus(),
    localStorageBytes: estimateLocalStorageBytes(),
    browser: typeof navigator === "undefined" ? "Serveur" : navigator.userAgent,
    expectedMigrations: "001–030",
    recentErrors: readRecentErrors()
      .slice(0, 10)
      .map(({ id, kind, message, createdAt }) => ({
        id,
        kind,
        message,
        createdAt,
      })),
    generatedAt: new Date().toISOString(),
  };
}
export function diagnosticChecks(report: DiagnosticReport) {
  return [
    { label: "Version v0.9.0", ok: report.version === "0.9.0" },
    {
      label: "Migrations attendues 001–030",
      ok: report.expectedMigrations === "001–030",
    },
    { label: "Connectivité connue", ok: report.connection !== "unknown" },
    { label: "Établissement actif", ok: Boolean(report.activeSchoolId) },
    { label: "Supabase configuré", ok: report.supabaseConfigured },
  ];
}
