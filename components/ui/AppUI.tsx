"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./AppUI.module.css";
export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <div className={styles.breadcrumbs} aria-label="Fil d’Ariane">
      {items.map((item, index) => (
        <span key={item.label}>
          {index > 0 && " › "}
          {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
        </span>
      ))}
    </div>
  );
}
export function PageHeader({
  eyebrow = "GABON ÉDUC+ v0.9.0",
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Tableau de bord", href: "/gabon-educ/tableau-de-bord" },
          { label: title },
        ]}
      />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions && <div className={styles.toolbar}>{actions}</div>}
      </header>
    </>
  );
}
export function StatusBadge({
  tone = "success",
  children,
}: {
  tone?: "success" | "warning" | "error" | "neutral";
  children: ReactNode;
}) {
  return (
    <span
      className={`${styles.badge} ${tone === "warning" ? styles.warning : tone === "error" ? styles.error : tone === "neutral" ? styles.neutral : ""}`}
    >
      {children}
    </span>
  );
}
export function OfflineBanner({
  online,
  onRetry,
}: {
  online: boolean;
  onRetry?: () => void;
}) {
  if (online) return null;
  return (
    <div className={styles.banner} role="status">
      <span>
        Mode hors ligne temporaire : les modifications sont conservées dans la
        file locale.
      </span>
      {onRetry && (
        <button
          className={`${styles.button} ${styles.secondary}`}
          onClick={onRetry}
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  title = "Aucune donnée",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className={styles.loading} role="status">
      {label}
    </div>
  );
}
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={styles.errorState} role="alert">
      <h2>Une difficulté est survenue</h2>
      <p>{message}</p>
      {onRetry && (
        <button className={styles.button} onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
export function Button({
  children,
  tone = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "danger";
}) {
  return (
    <button
      {...props}
      className={`${styles.button} ${tone === "secondary" ? styles.secondary : tone === "danger" ? styles.danger : ""}`}
    >
      {children}
    </button>
  );
}
export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      {label}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  if (!rows.length)
    return (
      <EmptyState description="Aucun élément ne correspond aux critères actuels." />
    );
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((item) => (
              <th key={item}>{item}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td data-label={headers[cellIndex]} key={cellIndex}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className={styles.pagination}>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Précédent
      </button>
      <span>
        Page {page} sur {Math.max(1, totalPages)}
      </span>
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Suivant
      </button>
    </div>
  );
}
export function ConfirmDialog({
  open,
  title,
  description,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <footer>
          <Button tone="secondary" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={onConfirm}>Confirmer</Button>
        </footer>
      </section>
    </div>
  );
}
export function Toast({ message }: { message: string }) {
  return message ? (
    <div className={styles.toast} role="status">
      {message}
    </div>
  ) : null;
}
export function PrintHeader({
  schoolName,
  title,
}: {
  schoolName: string;
  title: string;
}) {
  return (
    <header className={styles.printHeader}>
      <b>{schoolName || "Gabon Éduc+"}</b>
      <h1>{title}</h1>
    </header>
  );
}
