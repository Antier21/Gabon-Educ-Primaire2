"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  OfflineBanner,
  PageHeader,
  Pagination,
  PrintHeader,
  StatusBadge,
  Toast,
} from "@/components/ui/AppUI";
import {
  clearLocalAuditLog,
  filterAuditLog,
  logAuditAction,
  readAuditLog,
  type AuditStatus,
} from "@/lib/audit/audit-store";
import {
  backupFilename,
  collectLocalData,
  createBackup,
  parseBackup,
  previewRestore,
  restoreBackup,
  type BackupFile,
  type BackupPreview,
} from "@/lib/backup/backup";
import {
  createDiagnosticReport,
  diagnosticChecks,
  type DiagnosticReport,
} from "@/lib/diagnostic/diagnostic";
import { applyValidatedImport } from "@/lib/import-export/apply-import";
import {
  csvTemplate,
  exportCsv,
  importReport,
  validateCsvImport,
  type ImportModule,
  type ImportPreview,
} from "@/lib/import-export/csv";
import {
  deleteNotification,
  filterNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readNotifications,
  type NotificationKind,
} from "@/lib/notifications/notification-store";
import { createSupabaseSyncTransport } from "@/lib/sync/supabase-transport";
import {
  cancelOperation,
  clearCompletedOperations,
  getConnectionState,
  getSyncStatus,
  processQueue,
  readSyncQueue,
  resolveConflict,
  retryOperation,
} from "@/lib/sync/sync-manager";
import type { SyncOperation, SyncStatus } from "@/lib/sync/types";
import {
  hasSupabaseEnvironment,
  STORAGE_KEYS,
  writeLocal,
} from "@/lib/storage-mode";
import styles from "./OperationsCenter.module.css";
import { BackToSpace } from "@/components/BackToSpace";
export type OperationsModule =
  "sync" | "audit" | "notifications" | "import-export" | "diagnostic";
const titles: Record<OperationsModule, [string, string]> = {
  sync: [
    "Centre de synchronisation",
    "Inspectez la file hors ligne, relancez les opérations et résolvez les conflits sans écrasement silencieux.",
  ],
  audit: [
    "Journal d’audit",
    "Consultez les actions importantes enregistrées sans mots de passe, jetons ni secrets.",
  ],
  notifications: [
    "Notifications",
    "Suivez les événements internes, filtrez-les et marquez-les comme lus.",
  ],
  "import-export": [
    "Import, export et sauvegarde",
    "Prévisualisez et validez les CSV, exportez les données locales et restaurez une sauvegarde versionnée.",
  ],
  diagnostic: [
    "Diagnostic de préproduction",
    "Contrôlez l’environnement, la connectivité, Supabase, le stockage et les erreurs récentes sans exposer de clé.",
  ],
};
const download = (
  name: string,
  content: string,
  type = "text/plain;charset=utf-8",
) => {
  const url = URL.createObjectURL(new Blob([content], { type })),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};
export function OperationsCenter({ module }: { module: OperationsModule }) {
  const [toast, setToast] = useState("");
  const [label, description] = titles[module];
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <div>
          <BackToSpace className="">←</BackToSpace>
          <Brand />
          <span>
            <b>Préproduction connectée</b>
            <small>Contrôles v0.9.0</small>
          </span>
        </div>
        <StatusBadge
          tone={getConnectionState() === "offline" ? "warning" : "success"}
        >
          {getConnectionState() === "offline" ? "Hors ligne" : "Connecté"}
        </StatusBadge>
      </header>
      <section className={styles.shell}>
        <PrintHeader schoolName="Gabon Éduc+" title={label} />
        <PageHeader title={label} description={description} />
        {module === "sync" && <SyncView notify={setToast} />}{" "}
        {module === "audit" && <AuditView notify={setToast} />}{" "}
        {module === "notifications" && <NotificationsView notify={setToast} />}{" "}
        {module === "import-export" && <ImportExportView notify={setToast} />}{" "}
        {module === "diagnostic" && <DiagnosticView notify={setToast} />}
        <Toast message={toast} />
      </section>
    </main>
  );
}
function SyncView({ notify }: { notify: (value: string) => void }) {
  const [queue, setQueue] = useState<SyncOperation[]>([]),
    [status, setStatus] = useState<SyncStatus>(() => getSyncStatus()),
    [processing, setProcessing] = useState(false);
  const cloudAvailable = hasSupabaseEnvironment();
  const statusLabels: Record<SyncOperation["status"], string> = {
    pending: "En attente",
    syncing: "En cours",
    synced: "Synchronisée",
    error: "Erreur",
    conflict: "Conflit",
    cancelled: "Annulée",
    abandoned: "Abandonnée",
  };
  const refresh = useCallback(() => {
    setQueue(readSyncQueue());
    setStatus(getSyncStatus());
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [refresh]);
  async function run() {
    if (!cloudAvailable) {
      notify("Mode local — synchronisation cloud indisponible");
      return;
    }
    setProcessing(true);
    try {
      await processQueue(createSupabaseSyncTransport());
      refresh();
      notify("Tentative de synchronisation terminée.");
    } catch (error) {
      refresh();
      notify(
        error instanceof Error
          ? error.message
          : "La synchronisation n’a pas pu être relancée.",
      );
    } finally {
      setProcessing(false);
    }
  }
  return (
    <>
      <OfflineBanner
        online={cloudAvailable && status.connection !== "offline"}
        onRetry={() => void run()}
      />
      {!cloudAvailable && (
        <p role="status">Mode local — synchronisation cloud indisponible</p>
      )}
      <div className={styles.stats}>
        {[
          ["En attente", status.pending],
          ["En cours", status.syncing],
          ["Conflits", status.conflicts],
          ["Erreurs", status.errors],
          ["Abandonnées", status.abandoned],
          ["Synchronisées", status.synced],
        ].map(([label, value]) => (
          <article className={styles.stat} key={label}>
            <span>{label}</span>
            <b>{value}</b>
          </article>
        ))}
      </div>
      <section className={styles.card}>
        <div className={styles.toolbar}>
          <Button
            tone="secondary"
            onClick={() => {
              clearCompletedOperations();
              refresh();
            }}
          >
            Vider les opérations terminées
          </Button>
          <Button disabled={processing} onClick={() => void run()}>
            {processing ? "Synchronisation…" : "Réessayer"}
          </Button>
        </div>
        <p>
          Dernier succès :{" "}
          {status.lastSuccessAt
            ? new Date(status.lastSuccessAt).toLocaleString("fr-FR")
            : "aucun"}
          . {status.lastError && `Dernière erreur : ${status.lastError}`}
        </p>
        <DataTable
          headers={[
            "Module",
            "Opération",
            "Entité",
            "État",
            "Date",
            "Tentatives",
            "Dernière erreur",
            "Actions",
          ]}
          rows={queue.map((item) => [
            item.module,
            item.type,
            item.entityId,
            <StatusBadge
              key="s"
              tone={
                item.status === "conflict" ||
                item.status === "error" ||
                item.status === "abandoned"
                  ? "error"
                  : item.status === "pending"
                    ? "warning"
                    : "success"
              }
            >
              {statusLabels[item.status]}
            </StatusBadge>,
            new Date(item.createdAt).toLocaleString("fr-FR"),
            item.retryCount,
            item.abandonReason
              ? `${item.abandonReason} (${item.lastError})`
              : item.nextAttemptAt
                ? `Nouvelle tentative à ${new Date(item.nextAttemptAt).toLocaleTimeString("fr-FR")} — ${item.lastError}`
                : item.lastError || "—",
            <div className={styles.toolbar} key={item.id}>
              {(item.status === "error" || item.status === "abandoned") && (
                <Button
                  tone="secondary"
                  disabled={processing}
                  onClick={async () => {
                    try {
                      retryOperation(item.id, true);
                      refresh();
                      await run();
                    } catch (error) {
                      notify(
                        error instanceof Error
                          ? error.message
                          : "Impossible de relancer cette opération.",
                      );
                      refresh();
                    }
                  }}
                >
                  Réessayer
                </Button>
              )}
              {/*
                Retirer une opération abandonnée, quand la reprise n'a aucun
                sens — l'élève a été supprimé depuis, la classe n'existe plus.
                Sans ce geste, la file gardait indéfiniment des lignes mortes.
              */}
              {item.status === "abandoned" && (
                <Button
                  tone="secondary"
                  onClick={() => {
                    if (
                      !confirm(
                        `Retirer définitivement cette opération de la file ?\n\n${item.module} · ${item.type}\n${item.abandonReason || item.lastError}\n\nLa modification qu’elle portait ne sera pas enregistrée.`,
                      )
                    )
                      return;
                    cancelOperation(item.id);
                    refresh();
                  }}
                >
                  Retirer de la file
                </Button>
              )}
              {item.status === "conflict" && (
                <>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      resolveConflict(item.id, "keep_local");
                      refresh();
                    }}
                  >
                    Garder local
                  </Button>
                  <Button
                    tone="secondary"
                    onClick={() => {
                      resolveConflict(item.id, "keep_cloud");
                      refresh();
                    }}
                  >
                    Garder cloud
                  </Button>
                </>
              )}{" "}
              {["pending", "error"].includes(item.status) && (
                <Button
                  tone="danger"
                  onClick={() => {
                    cancelOperation(item.id);
                    refresh();
                  }}
                >
                  Annuler
                </Button>
              )}
            </div>,
          ])}
        />
      </section>
    </>
  );
}
function AuditView({ notify }: { notify: (value: string) => void }) {
  const [query, setQuery] = useState(""),
    [module, setModule] = useState(""),
    [status, setStatus] = useState<AuditStatus | "">(""),
    [page, setPage] = useState(1),
    [confirm, setConfirm] = useState(false);
  const items = useMemo(
      () =>
        filterAuditLog({
          query,
          module: module || undefined,
          status: status || undefined,
        }),
      [query, module, status],
    ),
    size = 12,
    pages = Math.ceil(items.length / size),
    visible = items.slice((page - 1) * size, page * size);
  function exportLog() {
    download(
      `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      exportCsv(
        items.map((item) => ({
          date: item.createdAt,
          action: item.action,
          module: item.module,
          entite: item.entityId,
          role: item.role,
          statut: item.status,
          message: item.message,
        })),
      ),
    );
    logAuditAction({
      userId: "local-user",
      schoolId: "local",
      role: "school_admin",
      action: "export",
      module: "audit",
      entityId: "audit",
      status: "success",
      message: "Journal d’audit exporté",
    });
    notify("Journal exporté en CSV UTF-8.");
  }
  return (
    <>
      <section className={styles.card}>
        <div className={styles.filters}>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher une action…"
            aria-label="Rechercher dans le journal"
          />
          <select
            value={module}
            onChange={(event) => setModule(event.target.value)}
            aria-label="Filtrer par module"
          >
            <option value="">Tous les modules</option>
            {Array.from(new Set(readAuditLog().map((item) => item.module))).map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as AuditStatus | "")
            }
            aria-label="Filtrer par statut"
          >
            <option value="">Tous les statuts</option>
            <option value="success">Succès</option>
            <option value="error">Erreur</option>
          </select>
        </div>
        <div className={styles.toolbar}>
          <Button tone="secondary" onClick={exportLog}>
            Exporter CSV
          </Button>
          <Button tone="danger" onClick={() => setConfirm(true)}>
            Effacer le journal local
          </Button>
        </div>
        <DataTable
          headers={["Date", "Action", "Module", "Entité", "Rôle", "Statut"]}
          rows={visible.map((item) => [
            new Date(item.createdAt).toLocaleString("fr-FR"),
            item.action,
            item.module,
            item.entityId,
            item.role,
            <StatusBadge
              key={item.id}
              tone={item.status === "error" ? "error" : "success"}
            >
              {item.status}
            </StatusBadge>,
          ])}
        />
        <Pagination page={page} totalPages={pages} onChange={setPage} />
      </section>
      <ConfirmDialog
        open={confirm}
        title="Effacer le journal local ?"
        description="Cette action n’efface pas le journal Supabase de l’établissement."
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          clearLocalAuditLog();
          setConfirm(false);
          notify("Journal local effacé.");
        }}
      />
    </>
  );
}
function NotificationsView({ notify }: { notify: (value: string) => void }) {
  const [userId] = useState("local-user"),
    [unreadOnly, setUnreadOnly] = useState(false),
    [kind, setKind] = useState<NotificationKind | "">(""),
    [, force] = useState(0);
  const refresh = () => force((value) => value + 1),
    items = filterNotifications({
      userId,
      unreadOnly,
      kind: kind || undefined,
    });
  return (
    <section className={styles.card}>
      <div className={styles.filters}>
        <select
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as NotificationKind | "")
          }
        >
          <option value="">Tous les types</option>
          {Array.from(
            new Set(readNotifications().map((item) => item.kind)),
          ).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />{" "}
          Non lues uniquement
        </label>
        <Button
          tone="secondary"
          onClick={() => {
            markAllNotificationsRead(userId);
            refresh();
            notify("Toutes les notifications sont lues.");
          }}
        >
          Tout marquer comme lu
        </Button>
      </div>
      {items.length ? (
        items.map((item) => (
          <article
            className={`${styles.notification} ${!item.readAt ? styles.unread : ""}`}
            key={item.id}
          >
            <div>
              <h3>{item.title}</h3>
              <p>{item.message}</p>
              <small>
                {new Date(item.createdAt).toLocaleString("fr-FR")} · {item.kind}
              </small>
            </div>
            <div className={styles.toolbar}>
              {!item.readAt && (
                <Button
                  tone="secondary"
                  onClick={() => {
                    markNotificationRead(item.id);
                    refresh();
                  }}
                >
                  Lu
                </Button>
              )}
              <Link href={item.href}>Ouvrir</Link>
              <Button
                tone="danger"
                onClick={() => {
                  deleteNotification(item.id);
                  refresh();
                }}
              >
                Supprimer
              </Button>
            </div>
          </article>
        ))
      ) : (
        <EmptyState description="Aucune notification ne correspond à ce filtre." />
      )}
    </section>
  );
}
function ImportExportView({ notify }: { notify: (value: string) => void }) {
  const [module, setModule] = useState<ImportModule>("students"),
    [content, setContent] = useState(""),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [backup, setBackup] = useState<BackupFile | null>(null),
    [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null),
    [confirmImport, setConfirmImport] = useState(false),
    [confirmRestore, setConfirmRestore] = useState(false),
    fileRef = useRef<HTMLInputElement>(null),
    backupRef = useRef<HTMLInputElement>(null);
  function analyze() {
    const result = validateCsvImport(module, content);
    setPreview(result);
    writeLocal(STORAGE_KEYS.importJobs, [importReport(result)]);
    notify(
      result.errors.length
        ? "Prévisualisation terminée avec des erreurs."
        : "Fichier prêt à être confirmé.",
    );
  }
  async function apply() {
    if (!preview) return;
    try {
      const result = await applyValidatedImport(preview);
      logAuditAction({
        userId: "local-user",
        schoolId: "local",
        role: "school_admin",
        action: "import",
        module: preview.module,
        entityId: "csv-import",
        status: "success",
        message: `${result.imported} importé(s), ${result.skipped} ignoré(s)`,
      });
      notify(
        `${result.imported} ligne(s) importée(s), ${result.skipped} ignorée(s).`,
      );
      setConfirmImport(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import impossible.");
    }
  }
  function makeBackup() {
    const file = createBackup("local", collectLocalData());
    download(
      backupFilename(),
      JSON.stringify(file, null, 2),
      "application/json",
    );
    logAuditAction({
      userId: "local-user",
      schoolId: "local",
      role: "school_admin",
      action: "export",
      module: "backup",
      entityId: file.checksum,
      status: "success",
      message: "Sauvegarde complète exportée",
    });
    notify("Sauvegarde complète téléchargée.");
  }
  return (
    <>
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Importer un CSV</h2>
          <p>Aucune ligne incohérente n’est importée silencieusement.</p>
          <div className={styles.form}>
            <FormField label="Module">
              <select
                value={module}
                onChange={(event) => {
                  setModule(event.target.value as ImportModule);
                  setPreview(null);
                }}
              >
                {[
                  "students",
                  "guardians",
                  "teachers",
                  "classes",
                  "subjects",
                  "scores",
                  "attendance",
                  "timetable",
                ].map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </FormField>
            <textarea
              className={styles.textarea}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Collez le contenu CSV ici…"
            />
            <input
              className={styles.file}
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(setContent);
              }}
            />
            <div className={styles.toolbar}>
              <Button
                tone="secondary"
                onClick={() =>
                  download(
                    `modele-${module}.csv`,
                    csvTemplate(module),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                Télécharger le modèle
              </Button>
              <Button tone="secondary" onClick={() => fileRef.current?.click()}>
                Choisir un fichier
              </Button>
              <Button onClick={analyze} disabled={!content.trim()}>
                Prévisualiser
              </Button>
            </div>
          </div>
        </section>
        <section className={styles.card}>
          <h2>Sauvegarde complète</h2>
          <p>Format JSON versionné, sans mot de passe, session ni secret.</p>
          <div className={styles.toolbar}>
            <Button onClick={makeBackup}>Exporter mes données</Button>
            <Button tone="secondary" onClick={() => backupRef.current?.click()}>
              Restaurer
            </Button>
          </div>
          <input
            className={styles.file}
            ref={backupRef}
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file)
                void file.text().then((text) => {
                  try {
                    const parsed = parseBackup(text);
                    setBackup(parsed);
                    setBackupPreview(
                      previewRestore(parsed, collectLocalData()),
                    );
                  } catch (error) {
                    notify(
                      error instanceof Error
                        ? error.message
                        : "Sauvegarde invalide.",
                    );
                  }
                });
            }}
          />
          {backupPreview && (
            <div className={styles.preview}>
              <strong>{backupPreview.itemCount}</strong> module(s) · version{" "}
              {backupPreview.version} · {backupPreview.conflicts.length}{" "}
              conflit(s)
              <div className={styles.toolbar}>
                <Button
                  disabled={!backupPreview.valid}
                  onClick={() => setConfirmRestore(true)}
                >
                  Confirmer la restauration
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
      {preview && (
        <section className={styles.card}>
          <h2>Rapport de prévisualisation</h2>
          <div className={styles.stats}>
            <article className={styles.stat}>
              <span>Lignes</span>
              <b>{preview.rows.length}</b>
            </article>
            <article className={styles.stat}>
              <span>Valides</span>
              <b>{preview.validRows.length}</b>
            </article>
            <article className={styles.stat}>
              <span>Erreurs</span>
              <b>{preview.errors.length}</b>
            </article>
            <article className={styles.stat}>
              <span>Doublons</span>
              <b>{preview.duplicates}</b>
            </article>
          </div>
          {preview.errors.length ? (
            <div className={styles.errorList}>
              {preview.errors.map((error, index) => (
                <div
                  className={styles.errorItem}
                  key={`${error.line}-${error.column}-${index}`}
                >
                  <b>
                    Ligne {error.line} · {error.column}
                  </b>
                  « {error.value} » — {error.problem}. Attendu :{" "}
                  {error.expected}.
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.notice}>
              Toutes les lignes sont cohérentes. L’import peut être confirmé.
            </div>
          )}
          <div className={styles.toolbar}>
            <Button
              disabled={preview.errors.length > 0}
              onClick={() => setConfirmImport(true)}
            >
              Confirmer l’import
            </Button>
          </div>
        </section>
      )}
      <ConfirmDialog
        open={confirmImport}
        title="Importer les lignes validées ?"
        description="Les données existantes sont conservées et les doublons sont ignorés."
        onCancel={() => setConfirmImport(false)}
        onConfirm={() => void apply()}
      />
      <ConfirmDialog
        open={confirmRestore}
        title="Restaurer la sauvegarde ?"
        description="Les clés présentes dans la sauvegarde remplaceront les mêmes modules locaux après confirmation."
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => {
          if (backup) {
            restoreBackup(backup);
            logAuditAction({
              userId: "local-user",
              schoolId: backup.schoolId,
              role: "school_admin",
              action: "import",
              module: "backup",
              entityId: backup.checksum,
              status: "success",
              message: "Sauvegarde restaurée",
            });
            notify("Sauvegarde restaurée. Rechargez la page.");
          }
          setConfirmRestore(false);
        }}
      />
    </>
  );
}
function DiagnosticView({ notify }: { notify: (value: string) => void }) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const refresh = useCallback(() => {
    setReport(createDiagnosticReport());
    notify("Diagnostic actualisé.");
  }, [notify]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  if (!report) return null;
  const checks = diagnosticChecks(report);
  return (
    <>
      <div className={styles.stats}>
        <article className={styles.stat}>
          <span>Version</span>
          <b>{report.version}</b>
        </article>
        <article className={styles.stat}>
          <span>Mode</span>
          <b>{report.supabaseConfigured ? "Cloud" : "Local"}</b>
        </article>
        <article className={styles.stat}>
          <span>En attente</span>
          <b>{report.sync.pending}</b>
        </article>
        <article className={styles.stat}>
          <span>Conflits</span>
          <b>{report.sync.conflicts}</b>
        </article>
        <article className={styles.stat}>
          <span>Stockage</span>
          <b>{Math.ceil(report.localStorageBytes / 1024)} Ko</b>
        </article>
      </div>
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Checklist instantanée</h2>
          {checks.map((item) => (
            <div className={styles.check} key={item.label}>
              <span>{item.label}</span>
              <StatusBadge tone={item.ok ? "success" : "warning"}>
                {item.ok ? "OK" : "À vérifier"}
              </StatusBadge>
            </div>
          ))}
          <div className={styles.toolbar}>
            <Button onClick={refresh}>Actualiser</Button>
          </div>
        </section>
        <section className={styles.card}>
          <h2>Informations non sensibles</h2>
          <p>
            Environnement : {report.environment}
            <br />
            Migrations attendues : {report.expectedMigrations}
            <br />
            Établissement actif : {report.activeSchoolId || "non sélectionné"}
            <br />
            Dernière synchronisation : {report.sync.lastSuccessAt || "aucune"}
          </p>
          <div className={styles.details}>Navigateur : {report.browser}</div>
        </section>
      </div>
      <section className={styles.card}>
        <h2>Erreurs récentes</h2>
        {report.recentErrors.length ? (
          <DataTable
            headers={["Référence", "Type", "Message", "Date"]}
            rows={report.recentErrors.map((item) => [
              item.id,
              item.kind,
              item.message,
              new Date(item.createdAt).toLocaleString("fr-FR"),
            ])}
          />
        ) : (
          <EmptyState description="Aucune erreur locale récente." />
        )}
      </section>
    </>
  );
}
