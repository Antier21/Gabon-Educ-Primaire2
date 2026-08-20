"use client";

export type BackupFile = {
  format: "gabon-educ-backup";
  version: string;
  createdAt: string;
  schoolId: string;
  modules: string[];
  data: Record<string, unknown>;
  checksum: string;
};
export type BackupPreview = {
  valid: boolean;
  version: string;
  schoolId: string;
  modules: string[];
  itemCount: number;
  conflicts: string[];
  errors: string[];
};
const forbidden = /password|token|secret|authorization|cookie|session/i;
function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function collectLocalData(
  storage: Pick<Storage, "length" | "key" | "getItem"> = localStorage,
) {
  const data: Record<string, unknown> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith("gabon-educ-plus:") || forbidden.test(key))
      continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw) as unknown;
    } catch {
      data[key] = raw;
    }
  }
  return data;
}
export function createBackup(
  schoolId: string,
  data = collectLocalData(),
): BackupFile {
  const createdAt = new Date().toISOString(),
    modules = Object.keys(data).sort(),
    content = JSON.stringify({ version: "0.9.0", schoolId, modules, data });
  return {
    format: "gabon-educ-backup",
    version: "0.9.0",
    createdAt,
    schoolId,
    modules,
    data,
    checksum: stableHash(content),
  };
}
export function parseBackup(content: string): BackupFile {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("Le fichier de sauvegarde n’est pas un JSON valide.");
  }
  if (!value || typeof value !== "object")
    throw new Error("Format de sauvegarde invalide.");
  const candidate = value as Partial<BackupFile>;
  if (
    candidate.format !== "gabon-educ-backup" ||
    !candidate.version ||
    !candidate.data ||
    typeof candidate.data !== "object"
  )
    throw new Error(
      "Ce fichier n’est pas une sauvegarde Gabon Éduc+ reconnue.",
    );
  return candidate as BackupFile;
}
export function previewRestore(
  backup: BackupFile,
  current: Record<string, unknown>,
): BackupPreview {
  const errors: string[] = [];
  if (!["0.8.0", "0.9.0"].includes(backup.version))
    errors.push(`Version ${backup.version} non prise en charge.`);
  const conflicts = Object.keys(backup.data).filter(
    (key) =>
      key in current &&
      JSON.stringify(current[key]) !== JSON.stringify(backup.data[key]),
  );
  return {
    valid: errors.length === 0,
    version: backup.version,
    schoolId: backup.schoolId,
    modules: backup.modules,
    itemCount: Object.keys(backup.data).length,
    conflicts,
    errors,
  };
}
export function restoreBackup(
  backup: BackupFile,
  storage: Pick<Storage, "setItem"> = localStorage,
  strategy: "keep_current" | "use_backup" = "use_backup",
) {
  const current = collectLocalData(localStorage),
    preview = previewRestore(backup, current);
  if (!preview.valid) throw new Error(preview.errors.join(" "));
  for (const [key, value] of Object.entries(backup.data)) {
    if (strategy === "keep_current" && key in current) continue;
    if (forbidden.test(key)) continue;
    storage.setItem(key, JSON.stringify(value));
  }
  return preview;
}
export function backupFilename(date = new Date()) {
  return `gabon-educ-sauvegarde-v0.9.0-${date.toISOString().slice(0, 10)}.json`;
}
