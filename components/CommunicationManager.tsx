"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Filter,
  MessageSquare,
  Send,
  SkipForward,
  Users,
  X,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { loadPlatformWorkspace } from "@/lib/platform/store";
import { listClasses, type ClassRecord } from "@/lib/class-store";
import {
  createCampaign,
  listCampaignRecipients,
  listCampaigns,
  listTemplates,
  markRecipient,
  refreshCampaignProgress,
  resolveBodyFor,
  resolveRecipients,
  type AudienceKind,
  type Campaign,
  type CampaignRecipient,
  type CampaignTarget,
  type MessageTemplate,
  type RecipientDraft,
} from "@/lib/communication/store";
import { MESSAGE_VARIABLES, buildWhatsAppLink, waMeTransport } from "@/lib/communication/whatsapp";
import styles from "./CommunicationManager.module.css";

const AUDIENCES: Array<{ kind: AudienceKind; label: string; hint: string }> = [
  { kind: "class", label: "Une classe", hint: "Tous les parents d'une même classe" },
  { kind: "level", label: "Un niveau", hint: "Toutes les classes d'un même niveau" },
  { kind: "students", label: "Des élèves choisis", hint: "Sélection manuelle, élève par élève" },
];

export function CommunicationManager() {
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const [audience, setAudience] = useState<AudienceKind>("class");
  const [classId, setClassId] = useState("");
  const [levelCode, setLevelCode] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishToParentSpace, setPublishToParentSpace] = useState(true);

  const [drafts, setDrafts] = useState<RecipientDraft[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);

  const levels = useMemo(
    () => [...new Set(classes.map((item) => item.level).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [classes],
  );
  const selectedClass = classes.find((item) => item.id === classId);

  useEffect(() => {
    void (async () => {
      try {
        const platform = await loadPlatformWorkspace();
        const school = platform.workspace.school;
        if (!school?.id) {
          setNotice({ kind: "error", text: "Aucun établissement actif. Sélectionnez-en un dans Service abonnements." });
          return;
        }
        setSchoolId(school.id);
        setSchoolName(school.name || "");
        const classResult = await listClasses({
          schoolId: school.id,
          schoolType: school.schoolType,
        });
        setClasses(classResult.items);
        setClassId((current) => current || classResult.items[0]?.id || "");
        const [templateList, campaignList] = await Promise.all([
          listTemplates(school.id),
          listCampaigns(school.id),
        ]);
        setTemplates(templateList);
        setCampaigns(campaignList);
      } catch (error) {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "Chargement impossible." });
      }
    })();
  }, []);

  const target: CampaignTarget = useMemo(
    () => ({
      kind: audience,
      classId: audience === "class" ? classId : undefined,
      levelCode: audience === "level" ? levelCode : undefined,
      studentIds: audience === "students" ? studentIds : undefined,
    }),
    [audience, classId, levelCode, studentIds],
  );

  async function previewRecipients() {
    if (!schoolId) return;
    setBusy(true);
    setNotice(null);
    try {
      const list = await resolveRecipients(schoolId, target);
      setDrafts(list);
      setCampaignId("");
      setRecipients([]);
      if (!list.length)
        setNotice({
          kind: "info",
          text: "Aucun parent trouvé pour cette cible. Vérifiez que les responsables des élèves sont bien enregistrés.",
        });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Lecture des parents impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function startCampaign() {
    if (!schoolId || !drafts.length) return;
    if (!title.trim() || !body.trim()) {
      setNotice({ kind: "error", text: "Un titre et un message sont nécessaires." });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const id = await createCampaign({
        schoolId,
        schoolName,
        title,
        body,
        target,
        recipients: drafts,
        publishToParentSpace,
      });
      setCampaignId(id);
      setRecipients(await listCampaignRecipients(id));
      setCampaigns(await listCampaigns(schoolId));
      setNotice({
        kind: "success",
        text: "Campagne enregistrée. Envoyez maintenant les messages un par un ci-dessous.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Création impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function sendOne(recipient: CampaignRecipient) {
    const outcome = await waMeTransport.send(recipient.phone, recipient.resolvedBody);
    if (outcome.status === "failed") {
      await markRecipient(recipient.id, "failed", outcome.reason || "Envoi impossible.");
    } else {
      // wa.me ne confirme rien : l'ouverture de WhatsApp vaut envoi déclaré.
      await markRecipient(recipient.id, "sent");
    }
    await refreshCampaignProgress(campaignId);
    setRecipients(await listCampaignRecipients(campaignId));
    setCampaigns(await listCampaigns(schoolId));
  }

  async function changeStatus(recipient: CampaignRecipient, status: "pending" | "skipped") {
    await markRecipient(recipient.id, status, status === "skipped" ? "Ignoré par le secrétariat." : "");
    await refreshCampaignProgress(campaignId);
    setRecipients(await listCampaignRecipients(campaignId));
  }

  async function openCampaign(campaign: Campaign) {
    setBusy(true);
    try {
      setCampaignId(campaign.id);
      setTitle(campaign.title);
      setBody(campaign.body);
      setRecipients(await listCampaignRecipients(campaign.id));
      setDrafts([]);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Ouverture impossible." });
    } finally {
      setBusy(false);
    }
  }

  const contactable = drafts.filter((item) => item.contactAllowed && item.phoneUsable);
  const excluded = drafts.filter((item) => !item.contactAllowed || !item.phoneUsable);
  const pending = recipients.filter((item) => item.status === "pending");
  const sent = recipients.filter((item) => item.status === "sent");
  const preview = drafts[0] ? resolveBodyFor(body, drafts[0], schoolName) : "";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link href="/gabon-educ/tableau-de-bord" className={styles.back} aria-label="Retour">
            <ArrowLeft />
          </Link>
          <Brand />
          <div>
            <b>Communication</b>
            <small>Messages groupés aux parents</small>
          </div>
        </div>
      </header>

      <section className={styles.shell}>
        <div className={styles.heading}>
          <div>
            <small>ESPACE ADMINISTRATION</small>
            <h1>Écrire aux parents</h1>
            <p>
              Les messages partent par WhatsApp, sur le numéro enregistré de chaque responsable.
              Vous validez chaque envoi, et l’application garde la trace de ce qui est parti.
            </p>
          </div>
        </div>

        {notice && (
          <div className={notice.kind === "error" ? styles.noticeError : styles.notice}>
            {notice.text}
            <button type="button" onClick={() => setNotice(null)} aria-label="Fermer">
              <X />
            </button>
          </div>
        )}

        <section className={styles.card}>
          <h2>
            <Filter /> 1. Choisir les destinataires
          </h2>
          <div className={styles.audienceGrid}>
            {AUDIENCES.map((item) => (
              <button
                key={item.kind}
                type="button"
                className={audience === item.kind ? styles.audienceActive : styles.audienceCard}
                onClick={() => {
                  setAudience(item.kind);
                  setDrafts([]);
                }}
              >
                <b>{item.label}</b>
                <small>{item.hint}</small>
              </button>
            ))}
          </div>

          <div className={styles.targetRow}>
            {audience === "class" && (
              <label>
                Classe
                <select value={classId} onChange={(event) => setClassId(event.target.value)}>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.students.length} élève(s)
                    </option>
                  ))}
                </select>
              </label>
            )}
            {audience === "level" && (
              <label>
                Niveau
                <select value={levelCode} onChange={(event) => setLevelCode(event.target.value)}>
                  <option value="">Choisir un niveau</option>
                  {levels.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {audience === "students" && (
              <label>
                Classe à parcourir
                <select value={classId} onChange={(event) => setClassId(event.target.value)}>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className={styles.primary} onClick={() => void previewRecipients()} disabled={busy}>
              <Users /> Voir les parents concernés
            </button>
          </div>

          {audience === "students" && selectedClass && (
            <div className={styles.studentPicker}>
              {selectedClass.students.map((student) => {
                const checked = studentIds.includes(student.id);
                return (
                  <label key={student.id} className={checked ? styles.studentChecked : styles.studentChip}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setStudentIds((current) =>
                          current.includes(student.id)
                            ? current.filter((value) => value !== student.id)
                            : [...current, student.id],
                        )
                      }
                    />
                    {student.lastName} {student.firstName}
                  </label>
                );
              })}
              {!selectedClass.students.length && <p className={styles.muted}>Cette classe ne compte aucun élève.</p>}
            </div>
          )}

          {drafts.length > 0 && (
            <div className={styles.recipientSummary}>
              <span className={styles.badgeOk}>{contactable.length} parent(s) joignable(s)</span>
              {excluded.length > 0 && <span className={styles.badgeWarn}>{excluded.length} écarté(s)</span>}
              {excluded.length > 0 && (
                <ul className={styles.excludedList}>
                  {excluded.slice(0, 5).map((item) => (
                    <li key={`${item.guardianId}-${item.studentId}`}>
                      {item.guardianName} ({item.studentName}) —{" "}
                      {!item.contactAllowed ? "contact refusé" : "numéro inutilisable"}
                    </li>
                  ))}
                  {excluded.length > 5 && <li>et {excluded.length - 5} autre(s)…</li>}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2>
            <MessageSquare /> 2. Rédiger le message
          </h2>
          <div className={styles.templateRow}>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={styles.templateChip}
                onClick={() => {
                  setTitle(template.name);
                  setBody(template.body);
                }}
              >
                {template.name}
              </button>
            ))}
          </div>
          <label>
            Objet
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Réunion des parents du 12 septembre"
            />
          </label>
          <label>
            Message
            <textarea
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Bonjour {parent}, …"
            />
          </label>
          <div className={styles.variables}>
            {MESSAGE_VARIABLES.map((variable) => (
              <button
                key={variable.token}
                type="button"
                onClick={() => setBody((current) => `${current}${variable.token}`)}
                title={variable.label}
              >
                {variable.token}
              </button>
            ))}
            <span className={styles.muted}>Cliquez pour insérer — remplacé pour chaque parent.</span>
          </div>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={publishToParentSpace}
              onChange={(event) => setPublishToParentSpace(event.target.checked)}
            />
            Publier aussi le message dans l’espace parent de l’application
          </label>
          {preview && (
            <div className={styles.preview}>
              <small>Aperçu pour {drafts[0]?.guardianName}</small>
              <p>{preview}</p>
            </div>
          )}
          <button
            type="button"
            className={styles.primary}
            onClick={() => void startCampaign()}
            disabled={busy || !contactable.length}
          >
            <Send /> Préparer l’envoi à {contactable.length} parent(s)
          </button>
        </section>

        {campaignId && (
          <section className={styles.card}>
            <h2>
              <Send /> 3. Envoyer
              <span className={styles.progress}>
                {sent.length} / {recipients.length}
              </span>
            </h2>
            <p className={styles.muted}>
              Chaque bouton ouvre WhatsApp avec le message déjà écrit. Il ne vous reste qu’à appuyer sur
              envoyer, puis à revenir ici — la ligne passe automatiquement en « envoyé ».
            </p>
            <ul className={styles.recipientList}>
              {recipients.map((recipient) => (
                <li key={recipient.id} className={styles[`row_${recipient.status}`] || styles.row_pending}>
                  <div>
                    <b>{recipient.guardianName}</b>
                    <small>
                      {recipient.studentName}
                      {recipient.className ? ` · ${recipient.className}` : ""} · {recipient.phone}
                    </small>
                    {recipient.failureReason && <em>{recipient.failureReason}</em>}
                  </div>
                  <div className={styles.rowActions}>
                    {recipient.status === "sent" && (
                      <span className={styles.sentTag}>
                        <CheckCircle2 /> Envoyé
                      </span>
                    )}
                    {recipient.status === "pending" && (
                      <>
                        <a
                          className={styles.sendButton}
                          href={buildWhatsAppLink(recipient.phone, recipient.resolvedBody)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => void sendOne(recipient)}
                        >
                          <Send /> WhatsApp
                        </a>
                        <button type="button" className={styles.ghost} onClick={() => void changeStatus(recipient, "skipped")}>
                          <SkipForward /> Ignorer
                        </button>
                      </>
                    )}
                    {(recipient.status === "failed" || recipient.status === "skipped") && (
                      <button type="button" className={styles.ghost} onClick={() => void changeStatus(recipient, "pending")}>
                        Reprendre
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!pending.length && recipients.length > 0 && (
              <p className={styles.done}>Tous les messages de cette campagne ont été traités.</p>
            )}
          </section>
        )}

        <section className={styles.card}>
          <h2>
            <ClipboardList /> Journal des envois
          </h2>
          {!campaigns.length ? (
            <p className={styles.muted}>Aucun message envoyé pour le moment.</p>
          ) : (
            <table className={styles.journal}>
              <thead>
                <tr>
                  <th>Objet</th>
                  <th>Cible</th>
                  <th>Envoyés</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>{campaign.title}</td>
                    <td>
                      {campaign.audienceKind === "class"
                        ? campaign.className || "Classe"
                        : campaign.audienceKind === "level"
                          ? `Niveau ${campaign.levelCode}`
                          : "Sélection d’élèves"}
                    </td>
                    <td>
                      {campaign.sentCount} / {campaign.recipientCount}
                    </td>
                    <td>{campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString("fr-FR") : ""}</td>
                    <td>
                      <button type="button" className={styles.ghost} onClick={() => void openCampaign(campaign)}>
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </section>
    </main>
  );
}
