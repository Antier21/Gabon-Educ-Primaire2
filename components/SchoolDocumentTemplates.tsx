import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { SchoolDocument } from "@/lib/platform/types";
import type { ReportSnapshot } from "@/lib/grading/types";
import { masteryLevelLabel } from "@/lib/grading/types";
import {
  masteryFromAverage,
  masteryLabel,
  primaryLevelAlias,
  type SchoolDocumentTemplateKey,
} from "@/lib/school-document-templates";
import styles from "./SchoolDocumentTemplates.module.css";

type Payload = Record<string, unknown>;

const text = (payload: Payload, key: string, fallback = "—") => {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : fallback;
};
const num = (value: number | null) =>
  typeof value === "number" ? value.toFixed(2).replace(".", ",") : "—";
const score = (value: number, max = 10) => `${num(value)} /${max}`;

function liveSnapshot(payload: Payload): ReportSnapshot | null {
  const value = payload.reportSnapshot;
  return value && typeof value === "object" ? (value as ReportSnapshot) : null;
}

function scaleToTen(value: number | null, maxScore = 20) {
  if (value === null || !Number.isFinite(value) || !Number.isFinite(maxScore) || maxScore <= 0) return null;
  return (value / maxScore) * 10;
}

function printSchoolDocument() {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  document.body.classList.add("printing-school-document");
  const cleanup = () => document.body.classList.remove("printing-school-document");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanup, 800);
  }, 50);
}

export function SchoolDocumentPreview({ document }: { document: SchoolDocument }) {
  const payload = document.payload as Payload;
  const key = text(payload, "templateKey", "student_identification") as SchoolDocumentTemplateKey;
  if (key === "preschool_progress_report") return <PreschoolProgressReport payload={payload} />;
  if (key === "primary_annual_report") return <PrimaryAnnualReport payload={payload} />;
  if (key === "secondary_term_report") return <SecondaryTermReport payload={payload} />;
  return <StudentIdentificationSheet payload={payload} />;
}

function PreschoolProgressReport({ payload }: { payload: Payload }) {
  const snapshot = liveSnapshot(payload);
  const domains = snapshot?.subjects || [];
  return (
    <PreviewShell payload={payload} title="Carnet de suivi des apprentissages" className={styles.reportDocument}>
      <div className={styles.identity}>
        <div className={styles.box}><b>Enfant :</b> {snapshot?.studentName || text(payload, "studentName")}</div>
        <div className={styles.box}><b>Section :</b> {snapshot?.className || text(payload, "className")}</div>
        <div className={styles.box}><b>Période :</b> {snapshot?.periodLabel || "Période"}</div>
      </div>
      <div className={styles.legend}>
        <div><b>A</b><span>Acquis</span></div>
        <div><b>ECA</b><span>En cours d’acquisition</span></div>
        <div><b>NA</b><span>Non encore acquis</span></div>
        <div><b>NE</b><span>Non évalué</span></div>
      </div>
      <table className={styles.table}>
        <thead><tr><th>Domaines d’apprentissage</th><th>Niveau de maîtrise</th><th>Observations</th><th>Appréciation</th></tr></thead>
        <tbody>
          {domains.length ? domains.map((row) => (
            <tr key={row.subject}><td><b>{row.subject}</b></td><td className={styles.center}>{masteryLevelLabel(row.mastery)}</td><td className={styles.center}>{row.assessmentCount}</td><td>{row.comment || "—"}</td></tr>
          )) : <tr><td colSpan={4}>Les observations apparaîtront après la saisie des apprentissages.</td></tr>}
        </tbody>
      </table>
      <div className={styles.appreciation}>Progression générale : {snapshot?.comments.general || snapshot?.comments.work || "—"}</div>
      <div className={styles.signatures}><div>Enseignant(e)</div><div>Direction</div><div>Parent / responsable</div></div>
    </PreviewShell>
  );
}

function PreviewShell({ payload, title, children, className = "" }: { payload: Payload; title: string; children: ReactNode; className?: string }) {
  return (
    <article className={`${styles.preview} ${className} school-document-print-root`}>
      <header className={styles.top}>
        <div>
          <small>République Gabonaise</small>
          <small>Union · Travail · Justice</small>
          <h3>{text(payload, "schoolName", "Établissement")}</h3>
          <p className={styles.muted}>{text(payload, "schoolProfile", "Profil non configuré")}</p>
        </div>
        <div className={styles.center}>
          <small>Année scolaire</small>
          <h3>{text(payload, "academicYear")}</h3>
          <p>{text(payload, "issuedAt")}</p>
        </div>
        <div className={styles.photo}>Photo<br />élève</div>
      </header>
      <h1 className={styles.title}>{title}</h1>
      {children}
      <p className={`${styles.muted} ${styles.printOnlyHide}`}>{text(payload, "disclaimer", "")}</p>
      <div className={`${styles.printAction} document-action-bar`}>
        <button className="btn btn-light" type="button" onClick={() => alert("Le document est déjà enregistré dans la liste des documents générés.")}>Enregistrer</button>
        <button className="btn btn-light" type="button" onClick={() => alert("Pour modifier, régénérez le document après correction du dossier élève, du relevé ou des appréciations.")}>Modifier</button>
        <button className="btn btn-light" type="button" onClick={() => window.history.back()}>Annuler</button>
        <button className="btn btn-primary" type="button" onClick={printSchoolDocument}>
          Imprimer / enregistrer en PDF
        </button>
      </div>
    </article>
  );
}

function StudentIdentificationSheet({ payload }: { payload: Payload }) {
  return (
    <PreviewShell payload={payload} title="Fiche d’identification de l’élève">
      <div className={styles.studentForm}>
        <div className={styles.caption}>Identité de l’élève</div>
        <div className={styles.identity}>
          <div><b>Nom(s)</b><div className={styles.dotted}>{text(payload, "studentLastName", "")}</div></div>
          <div><b>Prénom(s)</b><div className={styles.dotted}>{text(payload, "studentFirstName", "")}</div></div>
          <div><b>Nationalité</b><div className={styles.dotted}>{text(payload, "studentNationality")}</div></div>
          <div><b>Date de naissance</b><div className={styles.dotted}>{text(payload, "studentBirthDate", "")}</div></div>
          <div><b>Lieu de naissance</b><div className={styles.dotted}>{text(payload, "studentBirthPlace", "")}</div></div>
          <div><b>Matricule</b><div className={styles.dotted}>{text(payload, "studentRegistrationNumber", "")}</div></div>
          <div><b>Téléphone 1</b><div className={styles.dotted}>{text(payload, "studentPhone", "")}</div></div>
          <div><b>E-mail</b><div className={styles.dotted}>{text(payload, "studentEmail", "")}</div></div>
          <div><b>Lieu de résidence</b><div className={styles.dotted}>{text(payload, "studentAddress", "")}</div></div>
        </div>
        <div className={styles.caption}>Établissement</div>
        <div className={styles.identity}>
          <div><b>Nom de l’établissement</b><div className={styles.dotted}>{text(payload, "schoolName")}</div></div>
          <div><b>Classe / niveau</b><div className={styles.dotted}>{text(payload, "className")}</div></div>
          <div><b>Responsable</b><div className={styles.dotted}>{text(payload, "schoolHeadName", "")}</div></div>
        </div>
        <p><b>Catégorie d’enseignement :</b></p>
        <div className={styles.checkLine}>
          <span className={styles.selected}>{text(payload, "schoolProfile", "Établissement")}</span>
        </div>
        <div className={styles.signatures}>
          <div>Signature de l’apprenant</div>
          <div>Signature du parent ou tuteur</div>
          <div>Signature et cachet du chef d’établissement</div>
        </div>
      </div>
    </PreviewShell>
  );
}

const primaryRows = [
  { area: "Français", items: [["Lecture expressive", 9], ["Expression orale - Récitation", 9], ["Compréhension du texte", 10], ["Maniement de la langue", 7], ["Production écrite", 6], ["Dictée", 4]] },
  { area: "Anglais", items: [["Expression orale", 10], ["Expression écrite", 10]] },
  { area: "Mathématiques", items: [["Nombres & opérations", 7], ["Calcul mental", 4], ["Résolution de problèmes", 12], ["Géométrie", 10], ["Mesure", 8]] },
  { area: "EDM / EAS", items: [["Histoire - Géographie", 9], ["Éducation à la citoyenneté, à l’environnement et à la santé", 8], ["Biologie - Sciences physiques - Technologie", 7], ["Informatique / TIC", 8], ["Dessin", 8], ["EPS", 10]] },
];

function PrimaryAnnualReport({ payload }: { payload: Payload }) {
  const snapshot = liveSnapshot(payload);
  const averages = snapshot?.subjects.length
    ? snapshot.subjects.map((row) => {
        const avg = scaleToTen(row.average, snapshot.settings.maxScore) ?? 0;
        return {
          area: row.subject,
          items: [[row.subject, avg]] as Array<[string, number]>,
          total: avg,
          max: 10,
          avg,
          mastery: masteryFromAverage(avg),
        };
      })
    : primaryRows.map((group) => {
        const total = group.items.reduce((sum, [, value]) => sum + Number(value), 0);
        const max = group.items.length * 10;
        const avg = total / group.items.length;
        return { ...group, total, max, avg, mastery: masteryFromAverage(avg) };
      });
  const generalTotal = averages.reduce((sum, item) => sum + item.total, 0);
  const generalMax = averages.reduce((sum, item) => sum + item.max, 0);
  const generalAverage = snapshot ? scaleToTen(snapshot.generalAverage, snapshot.settings.maxScore) ?? generalTotal / Math.max(1, generalMax / 10) : generalTotal / (generalMax / 10);
  const primaryRowCount = averages.reduce((sum, item) => sum + item.items.length, 0) + 1;
  return (
    <PreviewShell payload={payload} title="Bulletin d’évaluation annuelle" className={styles.reportDocument}>
      <div className={styles.mastery}>
        <div className={styles.identity}>
          <div className={styles.box}><b>Code élève :</b> {text(payload, "studentRegistrationNumber", "—")}</div>
          <div className={styles.box}><b>Sexe :</b> {text(payload, "studentGender", "—")}</div>
          <div className={styles.box}><b>Classe :</b> {primaryLevelAlias(text(payload, "className", "—"))}</div>
          <div className={styles.box}><b>Nom & prénoms :</b> {text(payload, "studentName", "—")}</div>
          <div className={styles.box}><b>Enseignant(e) :</b> —</div>
          <div className={styles.box}><b>Année scolaire :</b> {text(payload, "academicYear")}</div>
        </div>
        <div className={styles.legend}>
          <div><b>A</b><span>Maîtrise maximale = 8 à 10 / 10</span></div>
          <div><b>B</b><span>Maîtrise minimale = 5 à 7,99 / 10</span></div>
          <div><b>C</b><span>Maîtrise partielle = 2 à 4,99 / 10</span></div>
          <div><b>D</b><span>Maîtrise insuffisante = 0 à 1,99 / 10</span></div>
        </div>
      </div>
      <table
        className={styles.table}
        style={{ "--bulletin-row-height": `${Math.max(4.8, Math.min(7, 135 / primaryRowCount))}mm` } as CSSProperties}
      >
        <thead><tr><th>Domaine</th><th>Composantes / activités</th><th>Notes</th><th>Moyenne</th><th>Maîtrise</th></tr></thead>
        <tbody>
          {averages.map((group) => (
            <Fragment key={group.area}>
              {group.items.map(([label, value], index) => (
                <tr key={`${group.area}-${label}`}>
                  {index === 0 && <td rowSpan={group.items.length} className={`${styles.center} ${styles.primaryArea}`}><b>{group.area}</b></td>}
                  <td>{label}</td><td className={styles.center}>{score(Number(value), Number(value) > 10 ? 20 : 10)}</td>
                  {index === 0 && <td rowSpan={group.items.length} className={styles.center}><b>{num(group.avg)}</b></td>}
                  {index === 0 && <td rowSpan={group.items.length} className={styles.center}><b>{group.mastery}</b><br /><small>{masteryLabel(group.mastery)}</small></td>}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className={styles.summary}>
        <div><span>Total général</span><b>{num(generalTotal)} / {generalMax}</b></div>
        <div><span>Moyenne générale</span><b>{num(generalAverage)} / 10</b></div>
        <div><span>Rang</span><b>—</b></div>
        <div><span>Niveau</span><b>{masteryLabel(masteryFromAverage(generalAverage))}</b></div>
      </div>
      <div className={styles.appreciation}>Appréciation générale de l’enseignant(e) : {snapshot?.comments.general || snapshot?.comments.work || "—"}</div>
      <div className={styles.signatures}><div>Enseignant(e)</div><div>Direction</div><div>Parent</div></div>
    </PreviewShell>
  );
}

const secondarySubjects = [
  ["Mathématiques", 1, "Performance passable. Peut mieux faire."],
  ["Physique / Chimie", 1, "Travail passable. Doit vite rebondir."],
  ["S.V.T.", 1, "Résultat assez bon."],
  ["Français", 1, "Assez bon travail dans l’ensemble."],
  ["Anglais", 1, "Résultat en baisse ce trimestre."],
  ["Histoire - Géographie / Instruction civique", 1, "Travail plus sérieux attendu."],
  ["Éducation physique et sportive", 1, "Bon travail dans l’ensemble."],
];

function SecondaryTermReport({ payload }: { payload: Payload }) {
  const snapshot = liveSnapshot(payload);
  const rows = snapshot?.subjects.length
    ? snapshot.subjects.map((row) => ({
        subject: row.subject,
        coefficient: row.coefficient,
        average: row.average,
        classAverage: row.classAverage,
        rank: row.rank ? `${row.rank}/${snapshot.classSize}` : "—",
        low: null as number | null,
        high: null as number | null,
        comment: row.comment || "—",
      }))
    : secondarySubjects.map(([subject, coefficient, comment], index) => {
        const average = [11.2, 10.67, 11.27, 14.39, 12.75, 12.22, 14.33][index] || 10;
        return {
          subject: String(subject),
          coefficient: Number(coefficient),
          average,
          classAverage: [11.87, 13.78, 13.60, 11.87, 13.32, 12.90, 12.86][index] || 10,
          rank: `${index + 5}/49`,
          low: [4.4, 4.17, 5.71, 6.9, 8.25, 8.33, 8.33][index] || 0,
          high: [16.6, 20, 18.18, 15.27, 19.25, 18.33, 16.33][index] || 20,
          comment: String(comment),
        };
      });
  const general = snapshot?.generalAverage ?? rows.reduce((sum, row) => sum + (row.average || 0) * row.coefficient, 0) / Math.max(1, rows.reduce((sum, row) => sum + row.coefficient, 0));
  return (
    <PreviewShell payload={payload} title="Bulletin de notes trimestriel" className={styles.reportDocument}>
      <div className={styles.identity}>
        <div className={styles.box}><b>Élève :</b> {snapshot?.studentName || text(payload, "studentName")}</div>
        <div className={styles.box}><b>Classe :</b> {snapshot?.className || text(payload, "className")}</div>
        <div className={styles.box}><b>Période :</b> {snapshot?.periodLabel || "Trimestre"}</div>
      </div>
      <table
        className={`${styles.table} ${styles.secondaryTable}`}
        style={{ "--bulletin-row-height": `${Math.max(5.5, Math.min(13, 130 / (rows.length + 1)))}mm` } as CSSProperties}
      >
        <thead><tr><th>Matières</th><th>Coef.</th><th>Rang</th><th>Moyenne élève</th><th>Moy. classe</th><th>-</th><th>+</th><th>H. Abs.</th><th>Appréciations des enseignants</th><th>Signatures</th></tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.subject}><td><b>{row.subject}</b></td><td className={styles.center}>{row.coefficient.toFixed(2).replace(".", ",")}</td><td className={styles.center}>{row.rank}</td><td className={styles.center}>{num(row.average)}</td><td className={styles.center}>{num(row.classAverage)}</td><td className={styles.center}>{num(row.low)}</td><td className={styles.center}>{num(row.high)}</td><td className={styles.center}>{snapshot?.attendance.absences ?? "—"}</td><td>{row.comment}</td><td></td></tr>)}
        </tbody>
      </table>
      <div className={styles.summary}>
        <div><span>Moyenne générale</span><b>{num(general)} / {snapshot?.settings.maxScore || 20}</b></div>
        <div><span>Rang général</span><b>{snapshot?.generalRank ? `${snapshot.generalRank} / ${snapshot.classSize}` : "—"}</b></div>
        <div><span>Absences</span><b>{snapshot?.attendance.absences ?? "—"}</b></div>
        <div><span>Mention</span><b>{snapshot?.comments.mention || "—"}</b></div>
      </div>
      <div className={styles.appreciation}>Appréciation du chef d’établissement : {snapshot?.comments.general || snapshot?.comments.work || "—"}</div>
      <div className={styles.signatures}><div>Enseignant principal</div><div>Directeur des études</div><div>Chef d’établissement</div></div>
    </PreviewShell>
  );
}
