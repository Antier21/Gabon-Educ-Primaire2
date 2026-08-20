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
export type SyncOperationStatus =
  "pending" | "syncing" | "synced" | "conflict" | "error" | "cancelled";
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
