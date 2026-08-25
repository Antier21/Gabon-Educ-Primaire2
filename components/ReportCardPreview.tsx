"use client";

import { Fragment } from "react";
import {
  formatAverage,
  masteryLevel,
  MASTERY_LABELS,
  totalsOf,
  type ScoredLine,
} from "@/lib/report-model/scale";
import type { ModelDomain } from "@/lib/report-model/store";
import styles from "./ReportCardPreview.module.css";

/**
 * Le bulletin, tel qu'il sera imprimé.
 *
 * Relevé sur le bulletin d'évaluation du palier 3 de « Le Guide de Nos Enfants
 * Plus », classe de 4e année, année 2025-2026. Trois traits de ce document ne
 * se devinent pas et décident pourtant de toute la mise en page :
 *
 *   — la colonne « Moyenne C » fusionne les lignes d'une même compétence : une
 *     compétence n'a qu'une moyenne, quel que soit le nombre de lignes qu'elle
 *     porte ;
 *   — après chaque domaine vient une ligne en toutes lettres, « Niveau de
 *     maîtrise en Français », qui répète en mots ce que la lettre code ;
 *   — le pied de bulletin situe l'élève dans sa classe — rang sur l'effectif,
 *     moyenne de la classe, meilleure moyenne — et non seulement par rapport
 *     à lui-même.
 *
 * Cet aperçu se nourrit du modèle composé par l'établissement. Il est donc
 * vide de notes : ce qu'il sert à vérifier, c'est que la forme correspond au
 * document que l'établissement remet déjà. Les notes viendront quand la saisie
 * s'appuiera sur ces lignes.
 */

export type PreviewScores = Record<string, number | null>;

export function ReportCardPreview({
  domains,
  schoolName,
  periodLabel = "PALIER 3",
  academicYear = "2025 - 2026",
  scores = {},
}: {
  domains: ModelDomain[];
  schoolName: string;
  periodLabel?: string;
  academicYear?: string;
  scores?: PreviewScores;
}) {
  const allLines: ScoredLine[] = [];
  for (const domain of domains)
    for (const skill of domain.skills)
      for (const line of skill.lines)
        allLines.push({ score: scores[line.id] ?? null, maxScore: line.maxScore });
  const general = totalsOf(allLines);

  return (
    <article className={styles.sheet} aria-label="Aperçu du bulletin">
      <header className={styles.head}>
        <div className={styles.identityBlock}>
          <b>{schoolName || "Nom de l’établissement"}</b>
          <small>Établissement privé laïc</small>
          <small>Enseignement pré-primaire &amp; primaire</small>
        </div>
        <div className={styles.ministry}>
          <span>Ministère de l’Éducation Nationale</span>
          <span>Direction d’Académie Provinciale de l’Estuaire</span>
          <span>Circonscription Scolaire Libreville-Est</span>
        </div>
        {/*
          La légende est imprimée sur le bulletin lui-même, en haut à droite :
          un parent doit pouvoir lire « A » et comprendre sans qu'on le lui
          explique.
        */}
        <table className={styles.legend}>
          <tbody>
            <tr><th>A</th><td>Maîtrise maximale</td><td>8 à 10/10</td></tr>
            <tr><th>B</th><td>Maîtrise minimale</td><td>5 à 7,99/10</td></tr>
            <tr><th>C</th><td>Maîtrise partielle</td><td>2 à 4,99/10</td></tr>
            <tr><th>D</th><td>Non maîtrise</td><td>0 à 1,99/10</td></tr>
          </tbody>
        </table>
      </header>

      <h1 className={styles.title}>BULLETIN D’ÉVALUATION DU {periodLabel}</h1>

      <div className={styles.pupil}>
        <p><span>Code de l’élève :</span><i /></p>
        <p><span>Sexe :</span><i /></p>
        <p><span>Classe :</span><i /></p>
        <p className={styles.wide}><span>Nom &amp; Prénoms de l’élève :</span><i /></p>
        <p><span>Année scolaire :</span><b>{academicYear}</b></p>
        <p><span>Né(e) le :</span><i /></p>
        <p><span>à :</span><i /></p>
        <p className={styles.wide}><span>Enseignant(e) :</span><i /></p>
      </div>

      <table className={styles.grid}>
        <thead>
          <tr>
            <th className={styles.skillCol}>Comp.</th>
            <th>Domaines et lignes de notes</th>
            <th className={styles.numCol}>Notes</th>
            <th className={styles.numCol}>Moyenne C</th>
            <th className={styles.masteryCol}>Maîtrise</th>
          </tr>
        </thead>
        <tbody>
          {!domains.length && (
            <tr>
              <td colSpan={5} className={styles.empty}>
                Le modèle ne contient encore aucun domaine.
              </td>
            </tr>
          )}
          {domains.map((domain) => {
            const domainLines: ScoredLine[] = domain.skills.flatMap((skill) =>
              skill.lines.map((line) => ({
                score: scores[line.id] ?? null,
                maxScore: line.maxScore,
              })),
            );
            const domainTotals = totalsOf(domainLines);
            const domainMax = domain.skills.reduce(
              (sum, skill) => sum + skill.lines.reduce((s, l) => s + l.maxScore, 0),
              0,
            );
            const domainMastery = masteryLevel(domainTotals.average);
            return (
              // Un fragment court « <> » ne peut pas porter de clé : sans
              // Fragment nommé, React ne saurait pas réordonner les domaines.
              <Fragment key={domain.id}>
                <tr className={styles.domainRow}>
                  <td colSpan={5}>{domain.label}</td>
                </tr>
                {domain.skills.map((skill) => {
                  const skillTotals = totalsOf(
                    skill.lines.map((line) => ({
                      score: scores[line.id] ?? null,
                      maxScore: line.maxScore,
                    })),
                  );
                  const skillMastery = masteryLevel(skillTotals.average);
                  return skill.lines.map((line, index) => (
                    <tr key={line.id}>
                      {index === 0 && (
                        <th rowSpan={skill.lines.length} className={styles.skillCell}>
                          {skill.code}
                        </th>
                      )}
                      <td>{line.label}</td>
                      <td className={styles.num}>
                        {scores[line.id] === undefined || scores[line.id] === null
                          ? "—"
                          : formatAverage(scores[line.id] as number)}
                        <span className={styles.max}> /{line.maxScore}</span>
                      </td>
                      {/*
                        La fusion sur toute la hauteur de la compétence n'est pas
                        décorative : elle dit qu'une compétence n'a qu'une
                        moyenne, et empêche de la lire ligne par ligne.
                      */}
                      {index === 0 && (
                        <td rowSpan={skill.lines.length} className={styles.numStrong}>
                          {formatAverage(skillTotals.average)}
                        </td>
                      )}
                      {index === 0 && (
                        <td rowSpan={skill.lines.length} className={styles.mastery}>
                          {skillMastery || "—"}
                        </td>
                      )}
                    </tr>
                  ));
                })}
                <tr className={styles.totalRow}>
                  <td colSpan={2}>Total</td>
                  <td className={styles.num}>
                    {domainTotals.total ? formatAverage(domainTotals.obtained) : "—"}
                    <span className={styles.max}> /{domainMax}</span>
                  </td>
                  <td className={styles.numStrong}>{formatAverage(domainTotals.average)}</td>
                  <td className={styles.mastery}>{domainMastery || "—"}</td>
                </tr>
                <tr className={styles.levelRow}>
                  <td colSpan={3}>Niveau de maîtrise en {domain.shortLabel || domain.label}</td>
                  <td colSpan={2}>
                    {domainMastery ? MASTERY_LABELS[domainMastery] : "Non évalué"}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <table className={styles.footTable}>
        <tbody>
          <tr>
            <th>Total général</th>
            <td>
              {general.total ? formatAverage(general.obtained) : "—"}
              <span className={styles.max}> /{
                domains.reduce(
                  (sum, d) =>
                    sum +
                    d.skills.reduce(
                      (s, k) => s + k.lines.reduce((n, l) => n + l.maxScore, 0),
                      0,
                    ),
                  0,
                )
              }</span>
            </td>
            <th>Rang</th>
            <td><i /></td>
          </tr>
          <tr>
            <th>Moyenne générale de l’élève</th>
            <td className={styles.numStrong}>{formatAverage(general.average)}<span className={styles.max}> /10</span></td>
            <th>Moyenne de la classe</th>
            <td><i /></td>
          </tr>
          <tr>
            <th>Niveau de maîtrise de l’élève</th>
            <td>
              {masteryLevel(general.average)
                ? MASTERY_LABELS[masteryLevel(general.average)!]
                : "Non évalué"}
            </td>
            <th>Meilleure moyenne de la classe</th>
            <td><i /></td>
          </tr>
        </tbody>
      </table>

      <section className={styles.appreciation}>
        <b>Niveau de maîtrise de l’élève en fin de {periodLabel.toLowerCase()}</b>
        <div className={styles.lines}><i /><i /></div>
      </section>

      <footer className={styles.signatures}>
        <div><span>Enseignant(e)</span></div>
        <div><span>Direction scolaire</span></div>
        <div><span>Parent</span></div>
      </footer>
    </article>
  );
}
