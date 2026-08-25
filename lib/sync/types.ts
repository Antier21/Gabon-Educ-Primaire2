export type SyncModule =
  | "classes"
  | "students"
  | "guardians"
  | "announcements"
  | "evaluations"
  | "attendance"
  | "timetables"
  | "documents"
  | "lessons"
  | "grading"
  | "users"
  | "subjects"
  | "assignments"
  | "settings";
export type SyncOperationType = "create" | "update" | "delete";
export type SyncOperationMetadata = {
  module: SyncModule;
  operation: SyncOperationType;
  entityId: string;
  payload: SyncEntityPayload;
  baseUpdatedAt?: string | null;
};
/**
 * « abandoned » : l'opération ne sera plus reprise d'elle-même.
 *
 * Sans cet état, une opération refusée définitivement — un droit manquant,
 * une référence détruite — restait « en erreur » indéfiniment : jamais
 * retentée puisque le nombre de tentatives était épuisé, jamais signalée non
 * plus. Elle devenait un poids mort invisible, et le centre de synchronisation
 * affichait un compte d'erreurs qui ne bougeait plus.
 */
export type SyncOperationStatus =
  "pending" | "syncing" | "synced" | "conflict" | "error" | "cancelled" | "abandoned";
export type SyncEntityPayload = Record<string, unknown>;
export type SyncOperation = {
  id: string;
  schoolId: string;
  userId: string;
  module: SyncModule;
  type: SyncOperationType;
  entityId: string;
  payload: SyncEntityPayload;
  createdAt: string;
  updatedAt: string;
  baseUpdatedAt: string | null;
  retryCount: number;
  lastError: string;
  status: SyncOperationStatus;
  remotePayload: SyncEntityPayload | null;
  remoteUpdatedAt: string | null;
  /**
   * Date avant laquelle il est inutile de retenter. Une panne réseau ne se
   * répare pas en une seconde : réessayer aussitôt gaspille la connexion et
   * épuise les tentatives sans rien apprendre.
   */
  nextAttemptAt?: string | null;
  /** Pourquoi l'opération a été abandonnée, en français, pour l'utilisateur. */
  abandonReason?: string;
};
export type SyncMetadata = {
  lastSuccessAt: string;
  lastAttemptAt: string;
  lastError: string;
  connection: "online" | "offline" | "unknown";
};
export type SyncStatus = {
  connection: SyncMetadata["connection"];
  pending: number;
  syncing: number;
  conflicts: number;
  errors: number;
  synced: number;
  /** Opérations qui ne repartiront plus sans intervention. */
  abandoned: number;
  lastSuccessAt: string;
  lastError: string;
};
export type ConflictResolution = "keep_local" | "keep_cloud" | "merge";
export type SyncExecutionResult = {
  remotePayload: SyncEntityPayload | null;
  remoteUpdatedAt: string | null;
};
export type SyncTransport = {
  execute(operation: SyncOperation): Promise<SyncExecutionResult>;
};
