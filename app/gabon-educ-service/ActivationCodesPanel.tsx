"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Copy, KeyRound, RefreshCcw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./ActivationCodesPanel.module.css";

type ActivationStatus = "active" | "used" | "expired" | "revoked";

type ActivationCodeRow = {
  activation_id: string;
  code_hint: string;
  school_name: string;
  edition: string;
  effective_status: ActivationStatus;
  max_uses: number;
  usage_count: number;
  expires_at: string;
  issued_at: string;
  revoked_at?: string | null;
};

type CreatedActivationCode = ActivationCodeRow & { plain_code: string };

const statusLabels: Record<ActivationStatus, string> = {
  active: "Actif",
  used: "Utilisé",
  expired: "Expiré",
  revoked: "Révoqué",
};

function defaultExpiry() {
  const value = new Date();
  value.setDate(value.getDate() + 30);
  return value.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("fr-FR") : "—";
}

function describe(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown };
    const parts = [raw.message, raw.details]
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    if (parts.length) return parts.join(" — ");
  }
  return "Opération impossible.";
}

export function ActivationCodesPanel() {
  const [codes, setCodes] = useState<ActivationCodeRow[]>([]);
  const [schoolName, setSchoolName] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [maxUses, setMaxUses] = useState("1");
  const [latestCode, setLatestCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadCodes = useCallback(async (showConfirmation = false) => {
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await createClient().rpc("list_school_activation_codes");
    if (rpcError) {
      setCodes([]);
      setError(`Chargement des codes impossible : ${describe(rpcError)}`);
      setLoading(false);
      return;
    }
    setCodes(((data || []) as ActivationCodeRow[]));
    if (showConfirmation) setNotice("Historique des codes actualisé.");
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCodes();
  }, [loadCodes]);

  async function generateCode() {
    const name = schoolName.trim();
    const uses = Number(maxUses);
    if (name.length < 3) {
      setError("Indique le nom de l’établissement destinataire.");
      return;
    }
    if (!expiresAt) {
      setError("Indique une date d’expiration.");
      return;
    }
    if (!Number.isInteger(uses) || uses < 1 || uses > 20) {
      setError("Le nombre d’utilisations doit être compris entre 1 et 20.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    setLatestCode("");
    try {
      const expiration = new Date(`${expiresAt}T23:59:59+01:00`);
      if (Number.isNaN(expiration.getTime()) || expiration <= new Date()) {
        throw new Error("La date d’expiration doit être future.");
      }
      const { data, error: rpcError } = await createClient().rpc("create_school_activation_code", {
        p_school_name: name,
        p_expires_at: expiration.toISOString(),
        p_max_uses: uses,
        p_edition: "primary",
      });
      if (rpcError) throw rpcError;
      const created = (Array.isArray(data) ? data[0] : data) as CreatedActivationCode | undefined;
      if (!created?.plain_code) throw new Error("Le code n’a pas été retourné par Supabase.");
      setLatestCode(created.plain_code);
      setNotice(`Code créé pour « ${created.school_name} ».`);
      setSchoolName("");
      setMaxUses("1");
      setExpiresAt(defaultExpiry());
      await loadCodes();
    } catch (caught) {
      setError(describe(caught));
    } finally {
      setSaving(false);
    }
  }

  async function copyLatestCode() {
    if (!latestCode) return;
    try {
      await navigator.clipboard.writeText(latestCode);
      setNotice("Code copié dans le presse-papiers.");
    } catch {
      setError("Copie automatique impossible. Sélectionne le code affiché pour le copier.");
    }
  }

  async function revoke(row: ActivationCodeRow) {
    if (row.effective_status !== "active") return;
    if (!window.confirm(`Révoquer le code destiné à « ${row.school_name} » ? Il ne pourra plus être utilisé.`)) return;
    setError("");
    setNotice("");
    const { data, error: rpcError } = await createClient().rpc("revoke_school_activation_code", {
      p_activation_id: row.activation_id,
    });
    if (rpcError) {
      setError(describe(rpcError));
      return;
    }
    if (data !== true) {
      setError("Ce code n’a pas pu être révoqué. Il est peut-être déjà utilisé ou expiré.");
      await loadCodes();
      return;
    }
    setNotice(`Code de « ${row.school_name} » révoqué.`);
    await loadCodes();
  }

  return (
    <section className={styles.shell} aria-labelledby="activation-codes-title">
      <div className={styles.panel}>
        <div className={styles.heading}>
          <div className={styles.title}>
            <span className={styles.icon}><KeyRound /></span>
            <div>
              <h2 id="activation-codes-title">Codes d’activation</h2>
              <p>Délivre les autorisations qui serviront bientôt à ouvrir la création d’un nouvel établissement.</p>
            </div>
          </div>
          <span className={styles.phase}><ShieldCheck /> Phase 1 — préparation sécurisée</span>
        </div>

        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.grid}>
          <article className={styles.formCard}>
            <h3>Créer une autorisation</h3>
            <div className={styles.form}>
              <label>
                Établissement destinataire
                <input value={schoolName} onChange={(event) => setSchoolName(event.target.value)} placeholder="Ex. École Les Flamboyants" maxLength={160} />
              </label>
              <label>
                Édition
                <select value="primary" disabled aria-label="Édition Gabon Éduc+">
                  <option value="primary">Gabon Éduc+ Primaire</option>
                </select>
              </label>
              <div className={styles.row}>
                <label>
                  Expire le
                  <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
                </label>
                <label>
                  Utilisations
                  <input type="number" min="1" max="20" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
                </label>
              </div>
              <button className={styles.primary} type="button" onClick={() => void generateCode()} disabled={saving}>
                {saving ? "Génération…" : "Générer le code"}
              </button>
            </div>

            {latestCode && (
              <div className={styles.generated}>
                <small>Code à transmettre à l’établissement</small>
                <div className={styles.generatedLine}>
                  <code>{latestCode}</code>
                  <button type="button" onClick={() => void copyLatestCode()}><Copy /> Copier</button>
                </div>
                <p className={styles.warning}>Le code complet est affiché uniquement maintenant. L’historique n’en conserve qu’une version masquée.</p>
              </div>
            )}
          </article>

          <article className={styles.historyCard}>
            <div className={styles.historyHead}>
              <h3>Historique des autorisations</h3>
              <button className={styles.secondary} type="button" onClick={() => void loadCodes(true)} disabled={loading}>
                <RefreshCcw className={loading ? "spin" : ""} /> {loading ? "Chargement…" : "Actualiser"}
              </button>
            </div>
            <div className={styles.tableWrap}>
              <div className={styles.tableHead}>
                <span>Établissement</span><span>Code</span><span>Édition</span><span>Créé</span><span>Expire</span><span>Statut</span><span>Action</span>
              </div>
              {codes.map((row) => (
                <div className={styles.tableRow} key={row.activation_id}>
                  <span><b>{row.school_name}</b><small>{row.usage_count}/{row.max_uses} utilisation(s)</small></span>
                  <span className={styles.code}>{row.code_hint}</span>
                  <span>Primaire</span>
                  <span>{formatDate(row.issued_at)}</span>
                  <span>{formatDate(row.expires_at)}</span>
                  <span><i className={styles.status} data-status={row.effective_status}>{statusLabels[row.effective_status] || row.effective_status}</i></span>
                  <span>{row.effective_status === "active" ? <button className={styles.danger} type="button" onClick={() => void revoke(row)}><Ban /> Révoquer</button> : "—"}</span>
                </div>
              ))}
              {!loading && !codes.length && <div className={styles.empty}>Aucun code d’activation n’a encore été créé.</div>}
            </div>
          </article>
        </div>

        <p className={styles.footnote}><strong>Important :</strong> cette première phase ne verrouille pas encore l’inscription actuelle. Le verrouillage ne sera activé qu’après création et test réussi d’un premier code depuis ce centre.</p>
      </div>
    </section>
  );
}
