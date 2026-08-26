"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, ClipboardCheck, GraduationCap, Info, ListChecks, MessageCircle, PhoneCall, UserRoundCheck } from "lucide-react";
import {
  loadAttendance,
  loadClassEvaluations,
  loadClassLessons,
  loadMessages,
  loadReportCards,
  loadScoreStatements,
  loadTimetable,
  loadMyContactRequest,
  requestMyContactChange,
  resolveFamilyIdentity,
  type AttendanceEntry,
  type FamilyChild,
  type FamilyEvaluation,
  type FamilyIdentity,
  type FamilyLesson,
  type FamilyMessage,
  type ContactRequestState,
  type FamilyScoreStatement,
  type ReportCardSummary,
  type TimetableEntry,
} from "@/lib/family/store";
import {
  cleanContact,
  isUnchanged,
  validateContact,
  type GuardianContact,
} from "@/lib/family/contact";
import {
  badgeLabel,
  countFresh,
  markTabSeen,
  readSeenMarks,
  seenKey,
  type SeenMarks,
} from "@/lib/family/freshness";
import {
  loadFamilyLineStatements,
  type FamilyPeriodStatement,
} from "@/lib/family/report-lines";
import { formatAverage, MASTERY_LABELS } from "@/lib/report-model/scale";
import styles from "./FamilySpaceLive.module.css";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
/**
 * Chaque onglet porte une ancre. C'est elle qui permet au menu et aux
 * vignettes d'accueil d'ouvrir directement le bon onglet : sans elle, tous
 * les liens de l'espace famille ramenaient au même écran, et il fallait
 * ensuite retrouver l'onglet à la main.
 */
const TABS = [
  // Le relevé précède le bulletin, parce qu'il change toutes les semaines
  // tandis que le bulletin ne paraît qu'une fois par trimestre.
  { key: "scores", hash: "releve-de-notes", label: "Relevé de notes", icon: ListChecks },
  { key: "results", hash: "bulletins", label: "Bulletins", icon: GraduationCap },
  { key: "lessons", hash: "cahiers-de-texte", label: "Cahiers de texte", icon: BookOpen },
  { key: "evaluations", hash: "evaluations", label: "Évaluations", icon: ClipboardCheck },
  { key: "attendance", hash: "vie-scolaire", label: "Vie scolaire", icon: UserRoundCheck },
  { key: "timetable", hash: "emploi-du-temps", label: "Emploi du temps", icon: CalendarDays },
  { key: "messages", hash: "messages", label: "Messages", icon: MessageCircle },
  // En dernier, parce qu'on y va rarement — mais présent, parce qu'un numéro
  // périmé rend muet tout le reste de cet espace.
  { key: "contact", hash: "mes-coordonnees", label: "Mes coordonnées", icon: PhoneCall },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Onglets réellement offerts à chaque espace.
 *
 * L'élève n'a pas de messagerie. Les messages de l'établissement partent aux
 * responsables — convocations, réunions, rappels de paiement — et la règle de
 * lecture les réserve aux comptes de parents : l'onglet aurait été vide quoi
 * qu'il arrive. Or nous venons précisément de retirer de cet espace les
 * entrées qui ne menaient nulle part ; en laisser une ici serait retomber dans
 * le défaut corrigé.
 */
function tabsFor(space: "parent" | "student") {
  // L'élève n'a ni messagerie ni coordonnées à lui : sa fiche est tenue par
  // l'établissement, et la modifier relève du secrétariat.
  return space === "student"
    ? TABS.filter((item) => item.key !== "messages" && item.key !== "contact")
    : TABS;
}

/** Une absence ou une dispense se dit en toutes lettres, pas par une case vide. */
const STATUS_LABELS_SCORE: Record<string, string> = {
  absent: "Absent",
  exempt: "Dispensé",
  not_graded: "En attente",
};

const ATTENDANCE_LABELS: Record<AttendanceEntry["kind"], string> = {
  absence: "Absence",
  late: "Retard",
  early_leave: "Départ anticipé",
};

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

export function FamilySpaceLive({ space }: { space: "parent" | "student" }) {
  const [identity, setIdentity] = useState<FamilyIdentity | null>(null);
  const [childId, setChildId] = useState("");
  // Le relevé est l'écran d'accueil : il change chaque semaine, tandis que
  // les bulletins restent vides entre deux trimestres.
  const [tab, setTab] = useState<TabKey>("scores");
  const [reports, setReports] = useState<ReportCardSummary[]>([]);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [messages, setMessages] = useState<FamilyMessage[]>([]);
  const [lessons, setLessons] = useState<FamilyLesson[]>([]);
  const [evaluations, setEvaluations] = useState<FamilyEvaluation[]>([]);
  const [statements, setStatements] = useState<FamilyScoreStatement[]>([]);
  /**
   * Le relevé sur les lignes du bulletin.
   *
   * Il s'ajoute à l'ancien relevé au lieu de le remplacer : couper l'ancien
   * d'un coup priverait de notes les familles dont l'enseignant n'a pas encore
   * basculé sur le nouveau modèle.
   */
  const [lineStatements, setLineStatements] = useState<FamilyPeriodStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /**
   * Repères figés à l'ouverture de la page.
   *
   * Ils ne sont volontairement pas rafraîchis pendant la visite : si le
   * repère avançait à mesure que le parent ouvre les onglets, la pastille
   * disparaîtrait sous ses yeux avant qu'il ait pu la lire. Les onglets déjà
   * ouverts dans cette visite sont retenus à part.
   */
  const [seenAtOpen, setSeenAtOpen] = useState<SeenMarks>({});
  const [visited, setVisited] = useState<string[]>([]);
  const [contactForm, setContactForm] = useState<GuardianContact>({ phone: "", email: "", address: "" });
  const [contactSaved, setContactSaved] = useState<GuardianContact>({ phone: "", email: "", address: "" });
  const [contactMessage, setContactMessage] = useState("");
  const [contactError, setContactError] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<ContactRequestState | null>(null);

  useEffect(() => {
    setSeenAtOpen(readSeenMarks());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const resolved = await resolveFamilyIdentity(space);
        setIdentity(resolved);
        setChildId(resolved.children[0]?.id || "");
        setContactForm(resolved.contact);
        setContactSaved(resolved.contact);
        if (resolved.guardianId) setPendingRequest(await loadMyContactRequest(resolved.guardianId));
        if (resolved.guardianId) setMessages(await loadMessages(resolved.guardianId));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      } finally {
        setLoading(false);
      }
    })();
  }, [space]);

  // L'onglet suit l'ancre de l'adresse. Le menu et les vignettes d'accueil
  // pointent vers « …/espace-parent#vie-scolaire » : la page est déjà ouverte,
  // seul l'onglet change, sans rechargement ni perte des données chargées.
  useEffect(() => {
    const applyHash = () => {
      const wanted = window.location.hash.replace(/^#/, "");
      const found = tabsFor(space).find((item) => item.hash === wanted);
      if (found) setTab(found.key);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [space]);

  function selectTab(next: TabKey) {
    setTab(next);
    // Le parent ouvre l'onglet lui-même : sa pastille a fait son travail.
    const key = seenKey(childId, next);
    setVisited((previous) => (previous.includes(key) ? previous : [...previous, key]));
    const found = TABS.find((item) => item.key === next);
    // replaceState plutôt que push : parcourir les onglets ne doit pas
    // remplir l'historique au point que le bouton « retour » du téléphone
    // devienne inutilisable.
    if (found) window.history.replaceState(null, "", `#${found.hash}`);
  }

  const child: FamilyChild | undefined = identity?.children.find((item) => item.id === childId);

  /**
   * L'onglet affiché est consulté : on pose le repère pour la prochaine visite.
   *
   * On ne le retire pas des pastilles de la visite en cours, et c'est
   * délibéré. L'onglet d'accueil — le relevé de notes — serait sinon marqué lu
   * avant que le parent ait rien vu, et la pastille ne pourrait jamais
   * apparaître là où elle sert le plus : sur les notes qui viennent d'arriver.
   * Seul un clic du parent efface une pastille, plus bas dans « selectTab ».
   */
  useEffect(() => {
    if (!childId) return;
    markTabSeen(readSeenMarks(), childId, tab, new Date());
  }, [childId, tab]);

  useEffect(() => {
    if (!child) return;
    void (async () => {
      try {
        const [
          reportList,
          attendanceList,
          timetableList,
          lessonList,
          evaluationList,
          statementList,
          lineList,
        ] = await Promise.all([
          loadReportCards(child.id),
          loadAttendance(child.id),
          loadTimetable(child.classId),
          loadClassLessons(child.classId),
          loadClassEvaluations(child.classId),
          loadScoreStatements(child.id),
          loadFamilyLineStatements(child.id),
        ]);
        setReports(reportList);
        setAttendance(attendanceList);
        setTimetable(timetableList);
        setLessons(lessonList);
        setEvaluations(evaluationList);
        setStatements(statementList);
        setLineStatements(lineList);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Lecture des données impossible.");
      }
    })();
  }, [child]);

  /**
   * Ce qui est apparu depuis la dernière visite, onglet par onglet.
   *
   * Chaque onglet est jugé sur la date qui décrit le moment où la famille
   * pouvait l'apprendre — la mise à jour du relevé, la publication du
   * bulletin, la saisie de l'absence, l'annonce de l'évaluation. Pour cette
   * dernière, la date de composition ne conviendrait pas : elle est à venir,
   * et l'épreuve resterait signalée comme neuve jusqu'au jour de l'examen.
   *
   * Ce calcul est placé avant les retours anticipés : un hook qui suivrait un
   * « return » ne serait pas appelé à chaque rendu.
   */
  const freshCounts = useMemo(() => {
    const source: Record<TabKey, Array<string | null | undefined>> = {
      scores: [
        ...statements.map((item) => item.updatedAt),
        ...lineStatements.map((item) => item.updatedAt),
      ],
      results: reports.map((item) => item.publishedAt),
      lessons: lessons.map((item) => item.updatedAt),
      evaluations: evaluations.map((item) => item.announcedAt),
      attendance: attendance.map((item) => item.recordedAt),
      timetable: [],
      messages: messages.map((item) => item.receivedAt),
      contact: [],
    };
    const counts = {} as Record<TabKey, number>;
    for (const { key } of TABS) {
      counts[key] = visited.includes(seenKey(childId, key))
        ? 0
        : countFresh(source[key], seenAtOpen[seenKey(childId, key)]);
    }
    return counts;
  }, [
    statements,
    lineStatements,
    reports,
    lessons,
    evaluations,
    attendance,
    messages,
    childId,
    seenAtOpen,
    visited,
  ]);

  if (loading) return <div className={styles.state}>Chargement de vos informations…</div>;

  if (error)
    return (
      <div className={styles.stateError}>
        <Info /> {error}
      </div>
    );

  if (!identity || identity.kind === "unlinked" || !identity.children.length)
    return (
      <div className={styles.stateError}>
        <Info /> {identity?.reason || "Aucune donnée n'est rattachée à ce compte."}
      </div>
    );

  const absences = attendance.filter((item) => item.kind === "absence");
  const lates = attendance.filter((item) => item.kind === "late");

  return (
    <div className={styles.wrapper}>
      {identity.children.length > 1 && (
        <div className={styles.childBar}>
          {identity.children.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === childId ? styles.childActive : styles.childChip}
              onClick={() => setChildId(item.id)}
            >
              <b>{item.fullName}</b>
              <small>{item.className || "Classe non renseignée"}</small>
            </button>
          ))}
        </div>
      )}

      {child && (
        <div className={styles.childHeader}>
          <div>
            <small>{child.relationship}</small>
            <h2>{child.fullName}</h2>
            <p>{child.className || "Classe non renseignée"}</p>
          </div>
          <div className={styles.counters}>
            <span>
              <b>{absences.length}</b> absence(s)
            </span>
            <span>
              <b>{lates.length}</b> retard(s)
            </span>
            <span>
              <b>{reports.length}</b> bulletin(s)
            </span>
          </div>
        </div>
      )}

      <nav className={styles.tabs}>
        {tabsFor(space).map(({ key, label, icon: Icon }) => {
          const fresh = freshCounts[key] || 0;
          return (
            <button
              key={key}
              type="button"
              className={tab === key ? styles.tabActive : styles.tab}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => selectTab(key)}
            >
              <Icon /> {label}
              {fresh > 0 && (
                // Le nombre seul ne dit rien à qui n'y voit pas : le texte
                // caché est ce que le lecteur d'écran annonce à sa place.
                <span className={styles.badge}>
                  <span aria-hidden="true">{badgeLabel(fresh)}</span>
                  <span className={styles.srOnly}>
                    {fresh} nouveauté(s) depuis votre dernière visite
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "scores" && (
        <section className={styles.panel}>
          {/*
            Le relevé du nouveau modèle passe en premier : c'est celui que
            l'établissement remplit désormais. L'ancien reste dessous tant que
            toutes les classes n'ont pas basculé.
          */}
          {lineStatements.map((statement) => (
            <article key={statement.periodId} className={styles.statement}>
              <header>
                <div>
                  <b>{statement.periodLabel}</b>
                  <small>
                    {statement.scoredCount} note(s) · total {statement.obtained} sur{" "}
                    {statement.maxScore}
                  </small>
                </div>
                {statement.average !== null && (
                  <span className={styles.average}>{formatAverage(statement.average)}</span>
                )}
              </header>

              {statement.domains
                .filter((domain) =>
                  domain.skills.some((skill) => skill.lines.some((line) => line.score !== null)),
                )
                .map((domain) => (
                  <div key={domain.label} className={styles.lineDomain}>
                    <h4>
                      {domain.label}
                      <span>
                        {formatAverage(domain.average)}
                        {domain.mastery ? ` · ${MASTERY_LABELS[domain.mastery]}` : ""}
                      </span>
                    </h4>
                    <ul>
                      {domain.skills.flatMap((skill) =>
                        skill.lines
                          .filter((line) => line.score !== null)
                          .map((line) => (
                            <li key={`${skill.code}-${line.label}`}>
                              <span>{line.label}</span>
                              <b>
                                {formatAverage(line.score)}
                                <small> /{line.maxScore}</small>
                              </b>
                            </li>
                          )),
                      )}
                    </ul>
                  </div>
                ))}
            </article>
          ))}

          {!statements.length && !lineStatements.length ? (
            <p className={styles.empty}>
              Aucune note enregistrée pour le moment. Le relevé se remplit dès la première évaluation
              corrigée, sans attendre le bulletin.
            </p>
          ) : (
            statements.map((statement) => (
              <article key={`${statement.periodLabel}-${statement.updatedAt}`} className={styles.statement}>
                <header>
                  <div>
                    <b>{statement.periodLabel}</b>
                    <small>
                      {statement.assessmentCount} note(s) · barème sur {statement.maxScore}
                    </small>
                  </div>
                  {statement.generalAverage !== null && (
                    <span className={styles.average}>
                      {Number(statement.generalAverage).toFixed(2)}
                    </span>
                  )}
                </header>
                {statement.subjects.map((subject) => (
                  <div key={`${statement.periodLabel}-${subject.subject}`} className={styles.statementSubject}>
                    <div className={styles.statementSubjectHead}>
                      <b>{subject.subject}</b>
                      <span>
                        {subject.average === null
                          ? "Moyenne en attente"
                          : `Moyenne ${Number(subject.average).toFixed(2)}`}
                      </span>
                    </div>
                    <ul>
                      {subject.assessments.map((line, index) => (
                        <li key={`${subject.subject}-${index}`}>
                          <div>
                            <b>{line.title}</b>
                            <small>{formatDate(line.date)}</small>
                          </div>
                          <span className={styles.scoreValue}>
                            {line.status !== "graded" || line.rawScore === null ? (
                              <em>{STATUS_LABELS_SCORE[line.status] || "En attente"}</em>
                            ) : (
                              <>
                                {line.rawScore}
                                <small>/{line.maxScore}</small>
                              </>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className={styles.statementNote}>
                  Relevé provisoire, mis à jour à chaque note saisie. Les appréciations et le classement
                  figurent sur le bulletin.
                </p>
              </article>
            ))
          )}
        </section>
      )}

      {tab === "results" && (
        <section className={styles.panel}>
          {!reports.length ? (
            <p className={styles.empty}>
              Aucun bulletin publié pour le moment. Les bulletins apparaissent ici une fois validés par
              l’établissement.
            </p>
          ) : (
            reports.map((report) => (
              <article key={report.id} className={styles.report}>
                <header>
                  <div>
                    <b>Bulletin</b>
                    {report.rank && <small>Rang : {report.rank}</small>}
                  </div>
                  {report.average !== null && (
                    <span className={styles.average}>{Number(report.average).toFixed(2)}</span>
                  )}
                </header>
                <table>
                  <thead>
                    <tr>
                      <th>Matière</th>
                      <th>Moyenne</th>
                      <th>Coef.</th>
                      <th>Appréciation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.subjects.map((subject, index) => (
                      <tr key={`${report.id}-${index}`}>
                        <td>{subject.name}</td>
                        <td>{subject.average === null ? "—" : Number(subject.average).toFixed(2)}</td>
                        <td>{subject.coefficient}</td>
                        <td>{subject.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.generalComment && <p className={styles.comment}>{report.generalComment}</p>}
              </article>
            ))
          )}
        </section>
      )}

      {tab === "lessons" && (
        <section className={styles.panel}>
          {!lessons.length ? (
            <p className={styles.empty}>
              Aucune séance publiée pour cette classe. Les enseignants publient leurs fiches lorsqu’ils
              souhaitent les rendre visibles aux familles.
            </p>
          ) : (
            <ul className={styles.lessonList}>
              {lessons.map((lesson) => (
                <li key={lesson.id} className={styles.lessonItem}>
                  <div className={styles.lessonHead}>
                    <b>{lesson.title}</b>
                    <small>
                      {[lesson.subject, lesson.weekNumber ? `Semaine ${lesson.weekNumber}` : ""]
                        .filter(Boolean)
                        .join(" · ") || "Matière non précisée"}
                    </small>
                  </div>
                  {lesson.summary && <p className={styles.lessonSummary}>{lesson.summary}</p>}
                  {lesson.homework && (
                    <p className={styles.homework}>
                      <b>Travail à faire :</b> {lesson.homework}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "evaluations" && (
        <section className={styles.panel}>
          {!evaluations.length ? (
            <p className={styles.empty}>
              Aucune évaluation publiée pour cette classe.
            </p>
          ) : (
            <ul className={styles.evaluationList}>
              {evaluations.map((evaluation) => (
                <li
                  key={evaluation.id}
                  className={evaluation.upcoming ? styles.evaluationSoon : styles.evaluationPast}
                >
                  <div>
                    <b>{evaluation.title}</b>
                    <small>{evaluation.subject || "Matière non précisée"}</small>
                  </div>
                  <span className={styles.evaluationDate}>
                    {formatDate(evaluation.date)}
                    <em>{evaluation.upcoming ? "À venir" : "Passée"}</em>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "attendance" && (
        <section className={styles.panel}>
          {!attendance.length ? (
            <p className={styles.empty}>Aucune absence ni retard enregistré.</p>
          ) : (
            <ul className={styles.attendanceList}>
              {attendance.map((entry) => (
                <li key={entry.id} className={entry.justified ? styles.justified : styles.unjustified}>
                  <div>
                    <b>{ATTENDANCE_LABELS[entry.kind]}</b>
                    <small>{formatDate(entry.date)}</small>
                    {entry.reason && <em>{entry.reason}</em>}
                  </div>
                  <span>{entry.justified ? "Justifié" : "Non justifié"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "timetable" && (
        <section className={styles.panel}>
          {!timetable.length ? (
            <p className={styles.empty}>L’emploi du temps de cette classe n’a pas encore été renseigné.</p>
          ) : (
            DAYS.map((day, index) => {
              const slots = timetable.filter((slot) => slot.weekday === index + 1);
              if (!slots.length) return null;
              return (
                <div key={day} className={styles.day}>
                  <h3>{day}</h3>
                  <ul>
                    {slots.map((slot) => (
                      <li key={slot.id}>
                        <span className={styles.hour}>
                          {slot.startsAt} – {slot.endsAt}
                        </span>
                        <b>{slot.subject}</b>
                        {slot.room && <small>{slot.room}</small>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      )}

      {space === "parent" && tab === "messages" && (
        <section className={styles.panel}>
          {!messages.length ? (
            <p className={styles.empty}>Aucun message reçu de l’établissement.</p>
          ) : (
            messages.map((message) => (
              <article key={message.id} className={styles.message}>
                <header>
                  <b>{message.title}</b>
                  <small>{formatDate(message.receivedAt)}</small>
                </header>
                <p>{message.body}</p>
                {message.studentName && <small>Concerne {message.studentName}</small>}
              </article>
            ))
          )}
        </section>
      )}

      {space === "parent" && tab === "contact" && (
        <section className={styles.panel}>
          <form
            className={styles.contactForm}
            onSubmit={async (event) => {
              event.preventDefault();
              setContactMessage("");
              const probleme = validateContact(contactForm);
              if (probleme) {
                setContactError(probleme);
                return;
              }
              if (isUnchanged(contactForm, contactSaved)) {
                setContactError("");
                setContactMessage("Vos coordonnées sont déjà à jour.");
                return;
              }
              setSavingContact(true);
              setContactError("");
              try {
                const propose = cleanContact(contactForm);
                await requestMyContactChange(propose);
                setPendingRequest({
                  status: "pending",
                  ...propose,
                  createdAt: new Date().toISOString(),
                  reviewedAt: "",
                });
                setContactMessage(
                  "Votre demande a été transmise à l’établissement. Elle sera prise en compte dès que le secrétariat l’aura validée.",
                );
              } catch (caught) {
                setContactError(
                  caught instanceof Error ? caught.message : "Enregistrement impossible.",
                );
              } finally {
                setSavingContact(false);
              }
            }}
          >
            <p className={styles.contactIntro}>
              L’établissement vous joint à ce numéro pour les convocations, les absences et les
              rappels. S’il a changé, signalez-le ici : personne d’autre ne peut le faire à votre
              place. Le secrétariat validera la correction, puis mettra votre fiche à jour. Votre
              nom et le rattachement à vos enfants relèvent de l’établissement.
            </p>

            {/*
              Sans cet avis, un parent qui ne voit pas son numéro changer croit
              que rien n'est parti et redépose sa demande chaque semaine — et le
              secrétariat prend cette insistance pour de l'hésitation.
            */}
            {pendingRequest?.status === "pending" && (
              <p className={styles.contactPending}>
                Demande en attente de validation par l’établissement, déposée le{" "}
                {formatDate(pendingRequest.createdAt)} : {pendingRequest.phone}
                {pendingRequest.email ? ` · ${pendingRequest.email}` : ""}. Vos coordonnées
                actuelles restent affichées ci-dessous jusqu’à la validation.
              </p>
            )}
            {pendingRequest?.status === "rejected" && (
              <p className={styles.contactError}>
                Votre dernière demande n’a pas été retenue par l’établissement. Rapprochez-vous du
                secrétariat, ou déposez-en une nouvelle.
              </p>
            )}

            <label>
              <span>Téléphone</span>
              <input
                type="tel"
                inputMode="tel"
                value={contactForm.phone}
                onChange={(event) =>
                  setContactForm((previous) => ({ ...previous, phone: event.target.value }))
                }
                placeholder="077 03 77 07"
                required
              />
            </label>

            <label>
              <span>Adresse électronique (facultative)</span>
              <input
                type="email"
                value={contactForm.email}
                onChange={(event) =>
                  setContactForm((previous) => ({ ...previous, email: event.target.value }))
                }
                placeholder="parent@exemple.ga"
              />
            </label>

            <label>
              <span>Adresse (facultative)</span>
              <input
                type="text"
                value={contactForm.address}
                onChange={(event) =>
                  setContactForm((previous) => ({ ...previous, address: event.target.value }))
                }
                placeholder="Quartier, ville"
              />
            </label>

            {contactError && <p className={styles.contactError}>{contactError}</p>}
            {contactMessage && <p className={styles.contactOk}>{contactMessage}</p>}

            <button type="submit" className={styles.contactSubmit} disabled={savingContact}>
              {savingContact ? "Enregistrement…" : "Enregistrer mes coordonnées"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
