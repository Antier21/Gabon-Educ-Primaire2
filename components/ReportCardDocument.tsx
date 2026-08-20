import type { CSSProperties } from "react";
import type { ClassStudent } from "@/lib/class-store";
import type { ReportSnapshot } from "@/lib/grading/types";
import styles from "./Gradebook.module.css";
import { PRODUCT_EDITION } from "@/lib/product-edition";
import { masteryFromAverage, masteryLabel } from "@/lib/school-document-templates";
import { isPreschoolLevel } from "@/lib/school-profiles";
import { masteryLevelLabel } from "@/lib/grading/types";

const show = (value: number | null) =>
  value === null ? "—" : value.toFixed(2).replace(".", ",");

export function ReportCardDocument({
  snapshot,
  student,
}: {
  snapshot: ReportSnapshot;
  student?: ClassStudent;
}) {
  if (PRODUCT_EDITION === "primary") {
    if (isPreschoolLevel(snapshot.classLevel || snapshot.className)) {
      return <PreschoolProgressReportDocument snapshot={snapshot} student={student} />;
    }
    return <PrimaryReportCardDocument snapshot={snapshot} student={student} />;
  }
  const s = snapshot.settings;
  return (
    <article className={styles.report} data-report-kind="secondary">
      <header className={styles.reportHeader}>
        {/* Le logo est une URL configurable et doit rester imprimable sans optimisation distante. */}
        {s.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.logo}
            src={s.logoUrl}
            alt="Logo de l’établissement"
          />
        ) : (
          <div className={styles.logoPlaceholder}>LOGO</div>
        )}
        <div>
          <h2>{s.schoolName || "Enseignant individuel"}</h2>
          <p>
            {[s.address, s.phone, s.email].filter(Boolean).join(" · ") ||
              "Coordonnées non configurées"}
          </p>
          <p>Année scolaire {snapshot.academicYear}</p>
        </div>
        <div>
          <p>République Gabonaise</p>
          <p>Union · Travail · Justice</p>
        </div>
      </header>
      <div className={styles.reportTitle}>
        <h1>Bulletin scolaire</h1>
        <p>
          {snapshot.periodLabel} · {s.bulletinModel}
        </p>
      </div>
      <section className={styles.identity}>
        <div>
          <b>Élève :</b> {snapshot.studentName}
          <br />
          <b>Matricule :</b> {student?.registrationNumber || "—"}
        </div>
        <div>
          <b>Classe :</b> {snapshot.className}
          <br />
          <b>Effectif :</b> {snapshot.classSize}
        </div>
        <div>
          <b>Naissance :</b>{" "}
          {student?.dateOfBirth
            ? new Intl.DateTimeFormat("fr-FR").format(
                new Date(`${student.dateOfBirth}T12:00:00`),
              )
            : "—"}
          <br />
          <b>Édition :</b>{" "}
          {new Intl.DateTimeFormat("fr-FR").format(
            new Date(snapshot.createdAt),
          )}
        </div>
      </section>
      <table
        className={styles.reportTable}
        style={{ "--bulletin-row-height": `${Math.max(5.5, Math.min(10, 105 / (snapshot.subjects.length + 1)))}mm` } as CSSProperties}
      >
        <thead>
          <tr>
            <th>Matière</th>
            <th>Moy.</th>
            <th>Coef.</th>
            <th>Pondérée</th>
            <th>Moy. classe</th>
            <th>Rang</th>
            <th>Évals.</th>
            <th>Appréciation</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.subjects.length ? (
            snapshot.subjects.map((row) => (
              <tr key={row.subject}>
                <td>
                  <b>{row.subject}</b>
                </td>
                <td>{show(row.average)}</td>
                <td>{row.coefficient}</td>
                <td>{show(row.weighted)}</td>
                <td>{show(row.classAverage)}</td>
                <td>{row.rank || "—"}</td>
                <td>{row.assessmentCount}</td>
                <td>{row.comment || "—"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8}>
                Aucune matière active ou aucune donnée disponible.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <section className={styles.summary}>
        <div>
          <span>Moyenne générale</span>
          <b>
            {show(snapshot.generalAverage)} / {s.maxScore}
          </b>
        </div>
        <div>
          <span>Rang général</span>
          <b>
            {snapshot.generalRank
              ? `${snapshot.generalRank} / ${snapshot.classSize}`
              : "—"}
          </b>
        </div>
        <div>
          <span>Moyenne classe</span>
          <b>{show(snapshot.classAverage)}</b>
        </div>
        <div>
          <span>Extrêmes</span>
          <b>
            {show(snapshot.lowestAverage)} – {show(snapshot.bestAverage)}
          </b>
        </div>
      </section>
      <section className={styles.comments}>
        <div>
          <b>Travail :</b> {snapshot.comments.work || "—"}
          <br />
          <b>Appréciation générale :</b> {snapshot.comments.general || "—"}
        </div>
        <div>
          <b>Conduite :</b> {snapshot.comments.conduct || "—"}
          <br />
          <b>Absences / retards :</b> {snapshot.attendance.absences} /{" "}
          {snapshot.attendance.lateCount}
        </div>
        <div>
          <b>Décision du conseil :</b> {snapshot.comments.decision || "—"}
        </div>
        <div>
          <b>Mention :</b> {snapshot.comments.mention || "Aucune"}
          <br />
          <b>Total coefficients :</b> {snapshot.totalCoefficients}
        </div>
      </section>
      <section className={styles.signatures}>
        <div>Enseignant principal</div>
        <div>Parent / responsable</div>
        <div>
          {s.headName
            ? `Chef d’établissement : ${s.headName}`
            : "Chef d’établissement"}
        </div>
      </section>
      <p className={styles.disclaimer}>
        Modèle configurable de bulletin scolaire — à adapter aux exigences de
        l’établissement et aux textes officiels applicables.
      </p>
    </article>
  );
}

function PreschoolProgressReportDocument({
  snapshot,
  student,
}: {
  snapshot: ReportSnapshot;
  student?: ClassStudent;
}) {
  const s = snapshot.settings;
  return (
    <article className={styles.report} data-report-kind="preschool">
      <header className={styles.reportHeader}>
        {s.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.logo} src={s.logoUrl} alt="Logo de l’établissement" />
        ) : <div className={styles.logoPlaceholder}>LOGO</div>}
        <div>
          <h2>{s.schoolName || "École maternelle"}</h2>
          <p>{[s.address, s.phone, s.email].filter(Boolean).join(" · ") || "Coordonnées non configurées"}</p>
          <p>Année scolaire {snapshot.academicYear}</p>
        </div>
        <div><p>République Gabonaise</p><p>Union · Travail · Justice</p></div>
      </header>
      <div className={styles.reportTitle}>
        <h1>Carnet de suivi des apprentissages</h1>
        <p>{snapshot.periodLabel} · Évaluation par niveaux de maîtrise, sans note numérique</p>
      </div>
      <section className={styles.identity}>
        <div><b>Enfant :</b> {snapshot.studentName}<br /><b>Matricule :</b> {student?.registrationNumber || "—"}</div>
        <div><b>Section :</b> {snapshot.className}<br /><b>Effectif :</b> {snapshot.classSize}</div>
        <div><b>Naissance :</b> {student?.dateOfBirth ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${student.dateOfBirth}T12:00:00`)) : "—"}</div>
      </section>
      <table className={styles.reportTable} style={{ "--bulletin-row-height": `${Math.max(9, Math.min(18, 130 / (snapshot.subjects.length + 1)))}mm` } as CSSProperties}>
        <thead><tr><th>Domaines d’apprentissage</th><th>Niveau de maîtrise</th><th>Observations</th><th>Appréciation</th></tr></thead>
        <tbody>
          {snapshot.subjects.length ? snapshot.subjects.map((row) => (
            <tr key={row.subject}><td><b>{row.subject}</b></td><td><b>{masteryLevelLabel(row.mastery)}</b></td><td>{row.assessmentCount}</td><td>{row.comment || "—"}</td></tr>
          )) : <tr><td colSpan={4}>Aucun domaine d’apprentissage actif.</td></tr>}
        </tbody>
      </table>
      <section className={styles.summary}>
        <div><span>A</span><b>Acquis</b></div>
        <div><span>ECA</span><b>En cours d’acquisition</b></div>
        <div><span>NA</span><b>Non encore acquis</b></div>
        <div><span>NE</span><b>Non évalué</b></div>
      </section>
      <section className={styles.comments}>
        <div><b>Progression générale :</b> {snapshot.comments.general || snapshot.comments.work || "—"}</div>
        <div><b>Autonomie et vie en groupe :</b> {snapshot.comments.conduct || "—"}</div>
        <div><b>Suite du parcours :</b> {snapshot.comments.decision || "—"}</div>
      </section>
      <section className={styles.signatures}><div>Enseignant(e)</div><div>Parent / responsable</div><div>{s.headName ? `Direction : ${s.headName}` : "Direction"}</div></section>
    </article>
  );
}

function PrimaryReportCardDocument({
  snapshot,
  student,
}: {
  snapshot: ReportSnapshot;
  student?: ClassStudent;
}) {
  const s = snapshot.settings;
  return (
    <article className={styles.report} data-report-kind="primary">
      <header className={styles.reportHeader}>
        {s.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.logo} src={s.logoUrl} alt="Logo de l’établissement" />
        ) : <div className={styles.logoPlaceholder}>LOGO</div>}
        <div>
          <h2>{s.schoolName || "École primaire"}</h2>
          <p>{[s.address, s.phone, s.email].filter(Boolean).join(" · ") || "Coordonnées non configurées"}</p>
          <p>Année scolaire {snapshot.academicYear}</p>
        </div>
        <div><p>République Gabonaise</p><p>Union · Travail · Justice</p></div>
      </header>
      <div className={styles.reportTitle}>
        <h1>Bulletin d’évaluation du primaire</h1>
        <p>{snapshot.periodLabel} · Notes sur 10 et niveaux de maîtrise</p>
      </div>
      <section className={styles.identity}>
        <div><b>Élève :</b> {snapshot.studentName}<br /><b>Matricule :</b> {student?.registrationNumber || "—"}</div>
        <div><b>Classe :</b> {snapshot.className}<br /><b>Effectif :</b> {snapshot.classSize}</div>
        <div><b>Naissance :</b> {student?.dateOfBirth ? new Intl.DateTimeFormat("fr-FR").format(new Date(`${student.dateOfBirth}T12:00:00`)) : "—"}</div>
      </section>
      <table className={styles.reportTable} style={{ "--bulletin-row-height": `${Math.max(7, Math.min(12, 120 / (snapshot.subjects.length + 1)))}mm` } as CSSProperties}>
        <thead><tr><th>Domaine / compétence</th><th>Note /10</th><th>Maîtrise</th><th>Activités</th><th>Appréciation</th></tr></thead>
        <tbody>
          {snapshot.subjects.length ? snapshot.subjects.map((row) => {
            const mastery = masteryFromAverage(row.average);
            return <tr key={row.subject}><td><b>{row.subject}</b></td><td>{show(row.average)}</td><td><b>{mastery}</b><br /><small>{masteryLabel(mastery)}</small></td><td>{row.assessmentCount}</td><td>{row.comment || "—"}</td></tr>;
          }) : <tr><td colSpan={5}>Aucun domaine actif ou aucune donnée disponible.</td></tr>}
        </tbody>
      </table>
      <section className={styles.summary}>
        <div><span>Moyenne générale</span><b>{show(snapshot.generalAverage)} / 10</b></div>
        <div><span>Rang</span><b>{snapshot.generalRank ? `${snapshot.generalRank} / ${snapshot.classSize}` : "—"}</b></div>
        <div><span>Niveau de maîtrise</span><b>{masteryLabel(masteryFromAverage(snapshot.generalAverage))}</b></div>
        <div><span>Assiduité</span><b>{snapshot.attendance.absences} absence(s)</b></div>
      </section>
      <section className={styles.comments}>
        <div><b>Appréciation générale :</b> {snapshot.comments.general || snapshot.comments.work || "—"}</div>
        <div><b>Conduite :</b> {snapshot.comments.conduct || "—"}</div>
        <div><b>Décision :</b> {snapshot.comments.decision || "—"}</div>
      </section>
      <section className={styles.signatures}><div>Enseignant(e)</div><div>Parent / responsable</div><div>{s.headName ? `Direction : ${s.headName}` : "Direction"}</div></section>
    </article>
  );
}
