"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Copy,
  Filter,
  MessageSquare,
  Send,
  Settings,
  ShieldAlert,
  SkipForward,
  Smartphone,
  Users2,
  Users,
  Trash2,
  X,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { loadPlatformWorkspace } from "@/lib/platform/store";
import { listClasses, type ClassRecord } from "@/lib/class-store";
import {
  createCampaign,
  deleteCampaign,
  DEFAULT_RETENTION_SETTINGS,
  listCampaignRecipients,
  listCampaigns,
  listTemplates,
  loadRetentionSettings,
  markAllPending,
  markRecipient,
  refreshCampaignProgress,
  resolveBodyFor,
  resolveRecipients,
  saveRetentionSettings,
  type AudienceKind,
  type Campaign,
  type CampaignRecipient,
  type CampaignTarget,
  type MessageTemplate,
  type MessagePriority,
  type MessageRetentionSettings,
  type RecipientDraft,
  type SentChannel,
} from "@/lib/communication/store";
import {
  MESSAGE_VARIABLES,
  buildSmsLink,
  buildWhatsAppAppLink,
  buildWhatsAppLink,
} from "@/lib/communication/whatsapp";
import {
  buildGroupShareLink,
  groupBody,
  groupSendVerdict,
  loadClassGroups,
  removeClassGroup,
  saveClassGroup,
  type ClassWhatsAppGroup,
} from "@/lib/communication/groups";
import styles from "./CommunicationManager.module.css";
import { BackToSpace } from "@/components/BackToSpace";

const AUDIENCES: Array<{ kind: AudienceKind; label: string; hint: string }> = [
  { kind: "school", label: "Tout l’établissement", hint: "Tous les parents rattachés à un élève actif" },
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
  const [retention, setRetention] = useState<MessageRetentionSettings>(DEFAULT_RETENTION_SETTINGS);
  const [retentionPanel, setRetentionPanel] = useState(false);

  const [audience, setAudience] = useState<AudienceKind>("class");
  const [classId, setClassId] = useState("");
  const [levelCode, setLevelCode] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<MessagePriority>("normal");

  const [drafts, setDrafts] = useState<RecipientDraft[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);
  /**
   * Les groupes WhatsApp déclarés, et la catégorie du modèle employé.
   *
   * La catégorie compte autant que le texte : une convocation rédigée en
   * toutes lettres ne porte aucune variable, et ne concerne pas moins une
   * seule famille.
   */
  const [classGroups, setClassGroups] = useState<ClassWhatsAppGroup[]>([]);
  const [category, setCategory] = useState("general");
  const [groupPanel, setGroupPanel] = useState(false);

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
        const [templateList, campaignList, retentionSettings] = await Promise.all([
          listTemplates(school.id),
          listCampaigns(school.id),
          loadRetentionSettings(school.id),
        ]);
        setTemplates(templateList);
        setCampaigns(campaignList);
        setRetention(retentionSettings);
        setClassGroups(await loadClassGroups(school.id));
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
        priority,
      });
      setCampaignId(id);
      setRecipients(await listCampaignRecipients(id));
      setCampaigns(await listCampaigns(schoolId));
      setNotice({
        kind: "success",
        text: `Message remis dans Gabon Éduc+ à ${drafts.length} parent(s).`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Création impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function sendOne(recipient: CampaignRecipient, channel: SentChannel = "whatsapp") {
    // Le lien ouvre déjà WhatsApp : appeler le transporteur ici ouvrait un
    // second onglet pour le même message. On se contente donc d'enregistrer
    // l'envoi, que WhatsApp ne peut de toute façon pas nous confirmer.
    //
    // Le canal est retenu parent par parent : une famille jointe par SMS ne
    // doit pas se confondre avec une famille jointe par WhatsApp, sans quoi on
    // ne saurait plus laquelle a réellement reçu quoi.
    await markRecipient(recipient.id, "sent", "", channel);
    await refreshCampaignProgress(campaignId);
    setRecipients(await listCampaignRecipients(campaignId));
    setCampaigns(await listCampaigns(schoolId));
  }

  /**
   * L'envoi au groupe de la classe.
   *
   * WhatsApp n'ouvre pas ses conversations à une page web : le logiciel
   * compose, l'humain dépose. Le message part donc dans le presse-papiers
   * **et** WhatsApp s'ouvre — si le sélecteur de conversation n'apparaît pas
   * sur ce poste, le surveillant colle lui-même dans le groupe. Rien n'est
   * perdu dans un cas comme dans l'autre.
   */
  async function sendToGroup() {
    const group = classGroups.find((item) => item.classId === classId);
    if (!group || !campaignId) return;
    const verdict = groupSendVerdict({ body, audienceKind: audience, category });
    if (!verdict.allowed) {
      setNotice({ kind: "error", text: verdict.reason });
      return;
    }
    const message = groupBody(body, {
      className: selectedClass?.name || "",
      schoolName,
    });
    // La copie et l'ouverture partent avant tout « await » : un navigateur ne
    // laisse ouvrir un onglet que dans le geste de l'utilisateur.
    const copied = navigator.clipboard?.writeText(message);
    window.open(buildGroupShareLink(message), "_blank", "noopener");
    setBusy(true);
    try {
      await copied?.catch(() => undefined);
      const count = await markAllPending(campaignId, "group");
      await refreshCampaignProgress(campaignId);
      setRecipients(await listCampaignRecipients(campaignId));
      setCampaigns(await listCampaigns(schoolId));
      setNotice({
        kind: "success",
        text: `Message copié et WhatsApp ouvert. Déposez-le dans « ${group.groupName} » : ${count} famille(s) sont comptées comme informées.`,
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Enregistrement impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function saveGroup(classIdentifier: string, name: string, link: string) {
    setBusy(true);
    setNotice(null);
    try {
      if (!name.trim()) await removeClassGroup(classIdentifier);
      else await saveClassGroup(schoolId, classIdentifier, name, link);
      setClassGroups(await loadClassGroups(schoolId));
      setNotice({ kind: "success", text: name.trim() ? "Groupe enregistré." : "Groupe retiré." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Enregistrement impossible." });
    } finally {
      setBusy(false);
    }
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

  async function saveRetention() {
    if (!schoolId) return;
    setBusy(true);
    setNotice(null);
    try {
      await saveRetentionSettings(schoolId, retention);
      setNotice({ kind: "success", text: "Règles de conservation enregistrées." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Enregistrement impossible." });
    } finally {
      setBusy(false);
    }
  }

  async function removeCampaign(campaign: Campaign) {
    if (!window.confirm(`Supprimer définitivement « ${campaign.title} » et tous ses destinataires ?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      await deleteCampaign(campaign.id);
      if (campaignId === campaign.id) {
        setCampaignId("");
        setRecipients([]);
      }
      setCampaigns(await listCampaigns(schoolId));
      setNotice({ kind: "success", text: "Campagne supprimée définitivement." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Suppression impossible." });
    } finally {
      setBusy(false);
    }
  }

  const excluded = drafts.filter((item) => !item.contactAllowed || !item.phoneUsable);
  const pending = recipients.filter((item) => item.status === "pending");
  const sent = recipients.filter((item) => item.status === "sent");
  /**
   * Le parent qui se présente maintenant, et le compte de ceux déjà traités.
   *
   * « Traité » et non « envoyé » : un parent volontairement passé fait avancer
   * la file au même titre qu'un parent joint. Ne compter que les envois ferait
   * reculer le rang affiché dès qu'on passe quelqu'un.
   */
  const handled = recipients.filter((item) => item.status !== "pending");
  const current = pending[0];
  /** Le groupe de la classe visée, et le droit d'y écrire ce message-ci. */
  const classGroup = classGroups.find((item) => item.classId === classId);
  const verdict = groupSendVerdict({ body, audienceKind: audience, category });
  const preview = drafts[0] ? resolveBodyFor(body, drafts[0], schoolName) : "";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <BackToSpace className={styles.back} />
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
              Envoyez un message privé à une classe, un niveau ou tout l’établissement.
              Chaque parent le reçoit dans son espace Gabon Éduc+, sans voir les autres destinataires.
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
              <span className={styles.badgeOk}>{drafts.length} parent(s) recevront le message interne</span>
              {excluded.length > 0 && <span className={styles.badgeWarn}>{excluded.length} sans WhatsApp utilisable</span>}
              {excluded.length > 0 && (
                <ul className={styles.excludedList}>
                  {excluded.slice(0, 5).map((item) => (
                    <li key={`${item.guardianId}-${item.studentId}`}>
                      {item.guardianName} ({item.studentName}) —{" "}
                      {!item.contactAllowed ? "canal externe désactivé" : "numéro inutilisable"}
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
                  setCategory(template.category || "general");
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
            Importance
            <select value={priority} onChange={(event) => setPriority(event.target.value as MessagePriority)}>
              <option value="normal">Information</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
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
          <div className={styles.internalNotice}>
            <CheckCircle2 /> Remise privée dans l’espace parent, avec suivi de lecture.
          </div>
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
            disabled={busy || !drafts.length}
          >
            <Send /> Envoyer à {drafts.length} parent(s)
          </button>
        </section>

        {campaignId && (
          <section className={styles.card}>
            <h2>
              <CheckCircle2 /> 3. Message interne remis
              <span className={styles.progress}>
                {sent.length} / {recipients.length}
              </span>
            </h2>
            <p className={styles.muted}>
              Le message est déjà disponible dans l’espace privé de chaque parent. Le suivi ci-dessous
              distingue les messages remis, lus et confirmés. WhatsApp reste disponible comme renfort.
            </p>

            {/*
              L'envoi au groupe de la classe.

              C'est la pratique réelle des établissements : un groupe par
              classe, tenu par les surveillants. Le logiciel ne s'y substitue
              pas — il compose le message et le dépose dans le presse-papiers.
              Vingt classes font vingt gestes, au lieu de mille deux cents.
            */}
            {audience === "class" && classGroup && verdict.allowed && pending.length > 0 && (
              <div className={styles.groupSend}>
                <div>
                  <b>
                    <Users2 /> Envoyer au groupe « {classGroup.groupName} »
                  </b>
                  <small>
                    Un seul geste pour les {pending.length} famille(s) restantes. Le message est copié
                    et WhatsApp s’ouvre : choisissez le groupe, collez, envoyez.
                  </small>
                </div>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void sendToGroup()}
                >
                  <Users2 /> Message au groupe
                </button>
              </div>
            )}

            {/*
              Le refus, expliqué.

              Un groupe classe est une place publique : soixante parents y
              lisent tout. Un bulletin, un impayé ou une absence n'y ont pas
              leur place — et c'est précisément ce qui arrive quand on envoie
              vite, depuis un téléphone. Ici, le logiciel dit non et donne sa
              raison.
            */}
            {audience === "class" && classGroup && !verdict.allowed && pending.length > 0 && (
              <div className={styles.groupBlocked}>
                <b>
                  <ShieldAlert /> Ce message ne partira pas dans le groupe de la classe
                </b>
                <small>{verdict.reason}</small>
              </div>
            )}

            {/*
              L'envoi enchaîné.

              WhatsApp exige une action humaine par parent : soixante familles
              feront toujours soixante gestes, et aucune astuce ne changera
              cela. Ce qu'on peut supprimer, ce sont les deux gestes qui
              entourent chacun — chercher la bonne ligne dans une liste de
              soixante, puis y revenir. Le prochain parent se présente ici de
              lui-même, et la liste complète reste dessous pour reprendre un
              cas particulier.
            */}
            {current && (
              <div className={styles.focus}>
                <div className={styles.focusHead}>
                  <span className={styles.focusRank}>
                    Parent {handled.length + 1} sur {recipients.length}
                  </span>
                  <b>{current.guardianName}</b>
                  <small>
                    {current.studentName}
                    {current.className ? ` · ${current.className}` : ""} · {current.phone}
                  </small>
                </div>
                <p className={styles.focusBody}>{current.resolvedBody}</p>
                <div className={styles.focusActions}>
                  <a
                    className={styles.sendButton}
                    href={buildWhatsAppLink(current.phone, current.resolvedBody)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void sendOne(current, "whatsapp")}
                  >
                    <Send /> Envoyer par WhatsApp
                  </a>
                  {/*
                    Le repli SMS existait dans le code depuis le début, mais
                    n'était branché nulle part : un parent sans WhatsApp était
                    laissé de côté sans que rien ne le signale au secrétariat.
                  */}
                  <a
                    className={styles.ghost}
                    href={buildSmsLink(current.phone, current.resolvedBody)}
                    onClick={() => void sendOne(current, "sms")}
                    title="Pour un parent qui n’utilise pas WhatsApp"
                  >
                    <Smartphone /> Par SMS
                  </a>
                  <a
                    className={styles.ghost}
                    href={buildWhatsAppAppLink(current.phone, current.resolvedBody)}
                    title="Ouvrir l’application WhatsApp installée sur cet ordinateur"
                  >
                    Application
                  </a>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => void changeStatus(current, "skipped")}
                  >
                    <SkipForward /> Passer
                  </button>
                </div>
                <small className={styles.focusHint}>
                  Après l’envoi, revenez sur cet onglet : le parent suivant s’affiche ici.
                </small>
              </div>
            )}

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
                      <>
                        <span className={styles.sentTag}>
                          <CheckCircle2 />
                          {recipient.acknowledgedAt
                            ? "Pris en connaissance"
                            : recipient.readAt
                              ? "Lu"
                              : recipient.sentChannel === "internal"
                                ? "Remis"
                                : "Envoyé"}
                          {recipient.sentChannel === "sms"
                            ? " · SMS"
                            : recipient.sentChannel === "whatsapp"
                              ? " · WhatsApp"
                              : recipient.sentChannel === "group"
                                ? " · Groupe classe"
                                : recipient.sentChannel === "internal"
                                  ? " · Gabon Éduc+"
                                  : ""}
                        </span>
                        {recipient.sentChannel === "internal" && recipient.phoneUsable && (
                          <a
                            className={styles.ghost}
                            href={buildWhatsAppLink(recipient.phone, recipient.resolvedBody)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Renvoyer aussi ce message par WhatsApp"
                          >
                            <Smartphone /> WhatsApp en renfort
                          </a>
                        )}
                      </>
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
                        {/*
                          Replis quand le web WhatsApp est lent ou inaccessible :
                          ouverture directe de l'application installée, ou copie
                          du message pour un envoi à la main.
                        */}
                        <a
                          className={styles.ghost}
                          href={buildSmsLink(recipient.phone, recipient.resolvedBody)}
                          onClick={() => void sendOne(recipient, "sms")}
                          title="Pour un parent qui n’utilise pas WhatsApp"
                        >
                          <Smartphone /> SMS
                        </a>
                        <a
                          className={styles.ghost}
                          href={buildWhatsAppAppLink(recipient.phone, recipient.resolvedBody)}
                          title="Ouvrir l’application WhatsApp installée sur cet ordinateur"
                        >
                          Application
                        </a>
                        <button
                          type="button"
                          className={styles.ghost}
                          title="Copier le message pour l’envoyer à la main"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(recipient.resolvedBody)
                              .then(() => setNotice({ kind: "info", text: `Message pour ${recipient.guardianName} copié.` }))
                              .catch(() => setNotice({ kind: "error", text: "Copie impossible sur ce navigateur." }));
                          }}
                        >
                          <Copy /> Copier
                        </button>
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
              <p className={styles.done}>Tous les messages ont été remis dans les espaces parents.</p>
            )}
          </section>
        )}

        {/*
          Le registre des groupes.

          Déclaré une fois par classe, en début d'année. Le nom doit être celui
          qui apparaît dans WhatsApp — c'est lui que le surveillant cherchera
          dans sa liste de conversations. Le lien d'invitation ne sert pas à
          envoyer : il sert à faire entrer un parent arrivé en cours d'année.
        */}
        <section className={styles.card}>
          <h2>
            <Users2 /> Groupes WhatsApp des classes
            <button
              type="button"
              className={styles.ghost}
              style={{ marginLeft: "auto" }}
              onClick={() => setGroupPanel((open) => !open)}
            >
              {groupPanel ? "Replier" : `Gérer (${classGroups.length}/${classes.length})`}
            </button>
          </h2>
          <p className={styles.muted}>
            Déclarez ici le groupe de chaque classe pour pouvoir y déposer un message en un geste.
            Laissez le nom vide pour retirer un groupe.
          </p>
          {groupPanel && (
            <ul className={styles.groupList}>
              {classes.map((item) => {
                const existing = classGroups.find((entry) => entry.classId === item.id);
                return (
                  <li key={item.id}>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void saveGroup(
                          item.id,
                          String(data.get("groupName") || ""),
                          String(data.get("inviteLink") || ""),
                        );
                      }}
                    >
                      <b>{item.name}</b>
                      <input
                        name="groupName"
                        defaultValue={existing?.groupName || ""}
                        placeholder="Nom du groupe dans WhatsApp"
                      />
                      <input
                        name="inviteLink"
                        defaultValue={existing?.inviteLink || ""}
                        placeholder="Lien d’invitation (facultatif)"
                      />
                      <button type="submit" className={styles.ghost} disabled={busy}>
                        Enregistrer
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.card}>
          <h2>
            <Settings /> Conservation des messages
            <button
              type="button"
              className={styles.ghost}
              style={{ marginLeft: "auto" }}
              onClick={() => setRetentionPanel((open) => !open)}
            >
              {retentionPanel ? "Replier" : "Programmer"}
            </button>
          </h2>
          <p className={styles.muted}>
            L’établissement choisit combien de jours chaque type de message doit être conservé.
            Laissez un champ vide pour conserver cette catégorie jusqu’à une suppression manuelle.
          </p>
          {retentionPanel && (
            <div className={styles.retentionPanel}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={retention.enabled}
                  onChange={(event) => setRetention((current) => ({ ...current, enabled: event.target.checked }))}
                />
                Activer la suppression automatique
              </label>
              <div className={styles.retentionGrid}>
                {([
                  ["normalDays", "Messages ordinaires"],
                  ["importantDays", "Messages importants"],
                  ["urgentDays", "Messages urgents"],
                ] as const).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <div className={styles.dayInput}>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        disabled={!retention.enabled}
                        value={retention[key] ?? ""}
                        placeholder="Jamais"
                        onChange={(event) =>
                          setRetention((current) => ({
                            ...current,
                            [key]: event.target.value ? Number(event.target.value) : null,
                          }))
                        }
                      />
                      <span>jours</span>
                    </div>
                  </label>
                ))}
              </div>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void saveRetention()}>
                Enregistrer la programmation
              </button>
            </div>
          )}
        </section>

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
                  <th>Lus</th>
                  <th>Confirmés</th>
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
                          : campaign.audienceKind === "school"
                            ? "Tout l’établissement"
                            : "Sélection d’élèves"}
                    </td>
                    <td>
                      {campaign.sentCount} / {campaign.recipientCount}
                    </td>
                    <td>{campaign.readCount} / {campaign.recipientCount}</td>
                    <td>{campaign.acknowledgedCount} / {campaign.recipientCount}</td>
                    <td>{campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString("fr-FR") : ""}</td>
                    <td>
                      <div className={styles.journalActions}>
                        <button type="button" className={styles.ghost} onClick={() => void openCampaign(campaign)}>
                          Ouvrir
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          disabled={busy}
                          onClick={() => void removeCampaign(campaign)}
                        >
                          <Trash2 /> Supprimer
                        </button>
                      </div>
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
