"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarRange, Eye, LayoutList, Plus, TriangleAlert, Trash2 } from "lucide-react";
import { signOut } from "@/lib/profile-store";
import { AdminMegaNav } from "@/components/SpaceNavigation";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { formatSchoolProfile } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";
import styles from "./ReportModelManager.module.css";
import { ReportCardPreview } from "./ReportCardPreview";
import { planPeriods } from "@/lib/report-model/periods";
import {
  ensurePeriods,
  loadPeriodSettings,
  loadSchoolPeriods,
  resolveActiveAcademicYear,
  savePeriodSettings,
  type ReportPeriodSettings,
  type SchoolPeriodRow,
} from "@/lib/report-model/periods-store";
import { OFFICIAL_REPORT_MODEL, modelMaxScore } from "@/lib/report-model/official-model";
import {
  addDomain,
  addLine,
  addSkill,
  loadReportModel,
  removeDomain,
  removeLine,
  saveLine,
  seedOfficialModel,
  type ModelDomain,
} from "@/lib/report-model/store";

/**
 * Composition du modèle de bulletin.
 *
 * Le bulletin gabonais de primaire tient sur trois étages : des domaines, des
 * compétences, et des lignes de notes portant chacune leur barème. Cet écran
 * est celui où l'établissement dit à quoi ressemble son bulletin — et il faut
 * qu'il puisse le dire, parce que trois choses lui appartiennent en propre :
 * les matières qu'il ajoute aux matières officielles, les barèmes qu'il
 * choisit, et l'ordre dans lequel tout cela s'imprime.
 *
 * Le barème d'un domaine ne se saisit jamais : c'est la somme de ses lignes.
 * Le laisser saisir aurait permis d'afficher « Français /60 » au-dessus de
 * lignes totalisant 50, et le bulletin aurait menti sans que rien ne le
 * signale.
 */
export function ReportModelManager() {
  const router = useRouter();
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolProfile, setSchoolProfile] = useState("");
  const [domains, setDomains] = useState<ModelDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  /**
   * L'aperçu du bulletin, replié par défaut.
   *
   * Composer la structure et vérifier la mise en page sont deux gestes
   * différents : dérouler la maquette entre chaque modification obligerait à
   * faire défiler une page A4 pour atteindre le champ suivant.
   */
  const [showPreview, setShowPreview] = useState(false);
  const [periodSettings, setPeriodSettings] = useState<ReportPeriodSettings>({
    scheme: "trimester",
    paliersPerTerm: 2,
  });
  const [academicYear, setAcademicYear] = useState<{ id: string; label: string } | null>(null);
  const [schoolPeriods, setSchoolPeriods] = useState<SchoolPeriodRow[]>([]);

  const refresh = useCallback(async (id: string) => {
    setDomains(await loadReportModel(id));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        setSchoolId(context.school.id);
        setSchoolName(context.school.name);
        setSchoolProfile(
          formatSchoolProfile(context.school.schoolType, context.school.schoolSector),
        );
        await refresh(context.school.id);
        setPeriodSettings(await loadPeriodSettings(context.school.id));
        const year = await resolveActiveAcademicYear(context.school.id);
        setAcademicYear(year);
        if (year) setSchoolPeriods(await loadSchoolPeriods(context.school.id, year.id));
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Établissement indisponible.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  /**
   * Enveloppe commune à toutes les écritures.
   *
   * Chaque geste relit le modèle entier ensuite. C'est un aller-retour de plus,
   * assumé : l'écran affiche alors exactement ce que contient la base, et non
   * ce que le navigateur croit y avoir écrit — ce qui est la seule façon de ne
   * pas laisser un établissement composer son bulletin sur une illusion.
   */
  async function run(action: () => Promise<unknown>, note: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh(schoolId);
      setMessage(note);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  const totalMax = domains.reduce(
    (total, domain) =>
      total +
      domain.skills.reduce(
        (sum, skill) => sum + skill.lines.reduce((s, line) => s + line.maxScore, 0),
        0,
      ),
    0,
  );
  const officialMax = modelMaxScore(OFFICIAL_REPORT_MODEL);

  async function logout() {
    await signOut();
    router.push("/gabon-educ/connexion-administration");
    router.refresh();
  }

  return (
    <main className="admin-workspace">
      <header className="admin-brandbar">
        <div className="admin-brand-identity">
          <div className="admin-seal"><LayoutList /></div>
          <div><b>{PRODUCT.name}</b><span>Modèle de bulletin</span></div>
        </div>
        <div className="admin-school-profile" aria-label="Établissement actif">
          <Building2 />
          <div>
            <span>ÉTABLISSEMENT ACTIF</span>
            <strong>{schoolProfile || "Chargement du profil…"}</strong>
            <small>{schoolName || "Établissement en cours de résolution"}</small>
          </div>
        </div>
      </header>

      <AdminMegaNav onLogout={() => void logout()} />
      <SubscriptionBanner />

      <section className="admin-contextbar">
        <div>
          <b>Composition du bulletin</b>
          <span>
            {domains.length} domaine(s) · total {totalMax} point(s)
            {totalMax !== officialMax && domains.length > 0
              ? ` — le modèle officiel en compte ${officialMax}`
              : ""}
          </span>
        </div>
      </section>

      {!loading && (
        <section className={styles.panel}>
          <div className={styles.domainHead}>
            <h2><CalendarRange /> Découpage de l’année</h2>
            <span className={styles.yearChip}>
              {academicYear ? academicYear.label : "Aucune année scolaire déclarée"}
            </span>
          </div>
          <p>
            Les paliers ne remplacent pas les trimestres : ils se logent dedans. Un
            établissement qui évalue par paliers conserve ses trois trimestres, y ajoute six
            paliers et un bilan annuel. Les autres s’en tiennent aux trimestres.
          </p>

          <div className={styles.schemeChoice}>
            <label className={periodSettings.scheme === "trimester" ? styles.schemeActive : styles.scheme}>
              <input
                type="radio"
                name="scheme"
                checked={periodSettings.scheme === "trimester"}
                onChange={() => setPeriodSettings((p) => ({ ...p, scheme: "trimester" }))}
              />
              <b>Trimestres</b>
              <small>Trois bulletins dans l’année, un par trimestre.</small>
            </label>
            <label className={periodSettings.scheme === "palier" ? styles.schemeActive : styles.scheme}>
              <input
                type="radio"
                name="scheme"
                checked={periodSettings.scheme === "palier"}
                onChange={() => setPeriodSettings((p) => ({ ...p, scheme: "palier" }))}
              />
              <b>Paliers</b>
              <small>
                {periodSettings.paliersPerTerm} palier(s) par trimestre, plus le bilan annuel.
              </small>
            </label>
          </div>

          {periodSettings.scheme === "palier" && (
            <label className={styles.perTerm}>
              Paliers par trimestre
              <input
                type="number"
                min={1}
                max={4}
                value={periodSettings.paliersPerTerm}
                onChange={(event) =>
                  setPeriodSettings((p) => ({
                    ...p,
                    paliersPerTerm: Math.max(1, Math.min(4, Number(event.target.value) || 2)),
                  }))
                }
              />
            </label>
          )}

          {/*
            Montrer la liste avant d'écrire : basculer en paliers crée sept
            périodes d'un coup, et un établissement doit voir ce qu'il
            déclenche avant de le déclencher.
          */}
          <p className={styles.plannedList}>
            À créer pour {academicYear?.label || "l’année active"} :{" "}
            {planPeriods(periodSettings.scheme, periodSettings.paliersPerTerm)
              .map((period) => period.label)
              .join(" · ")}
          </p>

          {schoolPeriods.length > 0 && (
            <p className={styles.plannedList}>
              Déjà en place : {schoolPeriods.map((period) => period.label).join(" · ")}
            </p>
          )}

          <button
            type="button"
            className={styles.primary}
            disabled={busy || !schoolId || !academicYear}
            onClick={() =>
              void run(async () => {
                await savePeriodSettings(schoolId, periodSettings);
                const result = await ensurePeriods(
                  schoolId,
                  academicYear?.id || "",
                  periodSettings,
                );
                if (academicYear)
                  setSchoolPeriods(await loadSchoolPeriods(schoolId, academicYear.id));
                return result;
              }, "Découpage enregistré. Les périodes déjà évaluées ont été conservées.")
            }
          >
            Enregistrer le découpage
          </button>
        </section>
      )}

      {!loading && domains.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.domainHead}>
            <h2>Aperçu du bulletin</h2>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setShowPreview((previous) => !previous)}
            >
              <Eye /> {showPreview ? "Replier l’aperçu" : "Voir le bulletin"}
            </button>
          </div>
          <p>
            La mise en page telle qu’elle sera imprimée, alimentée par le modèle ci-dessous.
            Les notes sont absentes : ce que cet aperçu sert à vérifier, c’est que la forme
            correspond au bulletin que vous remettez déjà aux familles.
          </p>
          {showPreview && (
            <div className={styles.previewFrame}>
              <ReportCardPreview domains={domains} schoolName={schoolName} />
            </div>
          )}
        </section>
      )}

      {error && (
        <p className={styles.error}>
          <TriangleAlert /> {error}
        </p>
      )}
      {message && <p className={styles.ok}>{message}</p>}

      {loading ? (
        <section className={styles.panel}><p>Chargement du modèle…</p></section>
      ) : !domains.length ? (
        <section className={styles.panel}>
          <h2>Aucun modèle n’est encore composé</h2>
          <p>
            La structure officielle du primaire comporte quatre domaines — Français, Anglais,
            Mathématiques, Éveil — découpés en compétences, pour dix-neuf lignes de notes et{" "}
            {officialMax} points. Vous pourrez ensuite y ajouter vos matières, changer les
            barèmes et retirer ce que votre établissement n’enseigne pas.
          </p>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !schoolId}
            onClick={() =>
              void run(() => seedOfficialModel(schoolId), "Structure officielle installée.")
            }
          >
            Installer la structure officielle
          </button>
        </section>
      ) : (
        <>
          {domains.map((domain) => {
            const domainMax = domain.skills.reduce(
              (sum, skill) => sum + skill.lines.reduce((s, line) => s + line.maxScore, 0),
              0,
            );
            return (
              <section className={styles.panel} key={domain.id}>
                <header className={styles.domainHead}>
                  <h2>
                    {domain.label} <small>/{domainMax}</small>
                  </h2>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Supprimer le domaine « ${domain.label} » ?\n\nSes compétences et ses ${domain.skills.reduce((n, s) => n + s.lines.length, 0)} ligne(s) de notes seront supprimées avec lui. Cette action est définitive.`,
                        )
                      )
                        return;
                      void run(
                        () => removeDomain(domain.id),
                        `Domaine « ${domain.label} » supprimé.`,
                      );
                    }}
                  >
                    <Trash2 /> Supprimer ce domaine
                  </button>
                </header>

                {domain.skills.map((skill) => (
                  <div key={skill.id} className={styles.skillBlock}>
                    <h3>
                      {skill.code}
                      {skill.label ? ` — ${skill.label}` : ""}
                    </h3>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Ligne de notes</th>
                          <th style={{ width: 110 }}>Barème</th>
                          <th style={{ width: 120 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skill.lines.map((line) => (
                          <tr key={line.id}>
                            <td>
                              <input
                                defaultValue={line.label}
                                aria-label={`Intitulé de la ligne ${line.label}`}
                                onBlur={(event) => {
                                  const label = event.target.value.trim();
                                  if (!label || label === line.label) return;
                                  void run(
                                    () => saveLine({ ...line, label }),
                                    "Intitulé enregistré.",
                                  );
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={line.maxScore}
                                aria-label={`Barème de la ligne ${line.label}`}
                                onBlur={(event) => {
                                  const maxScore = Number(event.target.value);
                                  if (!maxScore || maxScore === line.maxScore) return;
                                  void run(
                                    () => saveLine({ ...line, maxScore }),
                                    "Barème enregistré. Les moyennes déjà calculées en tiendront compte.",
                                  );
                                }}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.ghost}
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Supprimer la ligne « ${line.label} » ?\n\nLes notes déjà saisies sur cette ligne ne seront plus reportées au bulletin.`,
                                    )
                                  )
                                    return;
                                  void run(() => removeLine(line.id), "Ligne supprimée.");
                                }}
                              >
                                Retirer
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <form
                      className={styles.inlineForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        const label = String(form.get("label") || "").trim();
                        const maxScore = Number(form.get("maxScore") || 10);
                        if (!label) return;
                        event.currentTarget.reset();
                        void run(
                          () =>
                            addLine(schoolId, skill.id, label, maxScore, skill.lines.length),
                          "Ligne ajoutée.",
                        );
                      }}
                    >
                      <input name="label" placeholder="Nouvelle ligne de notes" required />
                      <input
                        name="maxScore"
                        type="number"
                        min={1}
                        step={1}
                        defaultValue={10}
                        aria-label="Barème de la nouvelle ligne"
                      />
                      <button className={styles.ghost} disabled={busy}>
                        <Plus /> Ajouter
                      </button>
                    </form>
                  </div>
                ))}

                <form
                  className={styles.inlineForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const code = String(form.get("code") || "").trim();
                    if (!code) return;
                    event.currentTarget.reset();
                    void run(
                      () => addSkill(schoolId, domain.id, code, domain.skills.length),
                      "Compétence ajoutée.",
                    );
                  }}
                >
                  <input name="code" placeholder="Nouvelle compétence (C4…)" required />
                  <button className={styles.ghost} disabled={busy}>
                    <Plus /> Ajouter une compétence
                  </button>
                </form>
              </section>
            );
          })}

          <section className={styles.panel}>
            <h2>Ajouter un domaine</h2>
            <p>
              Pour une matière que votre établissement enseigne en plus des matières
              officielles. Ajoutez-y ensuite au moins une compétence, puis ses lignes de notes.
            </p>
            <form
              className={styles.inlineForm}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const label = String(form.get("label") || "").trim();
                const shortLabel = String(form.get("shortLabel") || "").trim();
                if (!label) return;
                event.currentTarget.reset();
                void run(
                  () => addDomain(schoolId, label, shortLabel, domains.length),
                  "Domaine ajouté.",
                );
              }}
            >
              <input name="label" placeholder="Nom du domaine" required />
              <input name="shortLabel" placeholder="Nom court sur le bulletin (facultatif)" />
              <button className={styles.primary} disabled={busy}>
                <Plus /> Ajouter
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
